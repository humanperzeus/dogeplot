import fs from 'fs/promises';
import path from 'path';

const workerTemplate = `
    import { parentPort, workerData } from 'worker_threads';
    import { createClient } from "@supabase/supabase-js";
    import { PDFExtract } from "pdf.js-extract";
    import axios from "axios";
    import { v5 as uuidv5 } from 'uuid';
    import { determineBillStatus, isValidStatusProgression } from '../utils/statusDetermination.js';

    const { bills, congressApiKey, savePdfs, envVars } = workerData;

    // Use environment variables passed from main process
    const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const pdfExtract = new PDFExtract();

    async function extractTextFromPDF(pdfBuffer) {
      try {
        const data = await pdfExtract.extractBuffer(pdfBuffer);
        return data.pages
          .map((page) => page.content.map((item) => item.str).join(" "))
          .join("\\n");
      } catch (error) {
        console.error("Error extracting text from PDF:", error);
        throw error;
      }
    }

    async function fetchBillPDF(congress, type, number) {
      try {
        const url = \`https://api.congress.gov/v3/bill/\${congress}/\${type}/\${number}/text?format=json&api_key=\${congressApiKey}\`;
        const response = await axios.get(url);
        if (!response.data?.textVersions?.length) {
          return { url: null, buffer: null };
        }

        const pdfVersions = response.data.textVersions
          .filter((version) => version.formats.some((format) => format.type === 'PDF'));

        if (!pdfVersions.length) {
          return { url: null, buffer: null };
        }

        const latestVersion = pdfVersions[pdfVersions.length - 1];
        const pdfFormat = latestVersion.formats.find((format) => format.type === 'PDF');
        
        if (!pdfFormat) {
          return { url: null, buffer: null };
        }

        const pdfUrl = pdfFormat.url;

        // Always try to get the PDF buffer for text extraction
        try {
          const pdfResponse = await axios.get(pdfUrl, {
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept': 'application/pdf'
            }
          });

          return {
            url: pdfUrl,
            buffer: Buffer.from(pdfResponse.data)
          };
        } catch (error) {
          console.error('Error downloading PDF:', error);
          return { url: pdfUrl, buffer: null };
        }
      } catch (error) {
        console.error('Error fetching PDF:', error);
        return { url: null, buffer: null };
      }
    }

    async function processBill(billData) {
      const billType = billData.bill.type.toLowerCase();
      const billNumber = billData.bill.number;
      const congress = billData.bill.congress;

      try {
        const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
        const billId = uuidv5(\`\${congress}_\${billType}\${billNumber}\`, NAMESPACE);

        // Check if bill exists and get current status
        const { data: existingBill, error: lookupError } = await supabase
          .from('bills')
          .select('id, status, has_full_text')
          .eq('id', billId)
          .single();

        // Always try to fetch PDF for text extraction
        const pdfResult = await fetchBillPDF(congress, billType, billNumber);

        let textContent = '';
        let hasFullText = false;

        // Try to extract text if we have a PDF buffer
        if (pdfResult.buffer) {
          try {
            textContent = await extractTextFromPDF(pdfResult.buffer);
            hasFullText = true;
          } catch (error) {
            console.error("Error extracting text from PDF:", error);
          }
        }

        // Determine new status
        const newStatus = determineBillStatus(billData);

        // Validate status progression if bill exists
        if (existingBill && !isValidStatusProgression(existingBill.status, newStatus)) {
          console.warn(\`Invalid status progression attempted: \${existingBill.status} -> \${newStatus}\`);
          console.warn(\`Bill: \${billType}\${billNumber}, Action: \${billData.bill.latestAction?.text}\`);
        }

        // Log status change to history if different
        if (existingBill && existingBill.status !== newStatus) {
          const { error: historyError } = await supabase
            .from('bill_status_history')
            .insert({
              bill_id: billId,
              status: newStatus,
              action_text: billData.bill.latestAction?.text || 'Status updated',
            });

          if (historyError) {
            console.error("Error logging status change to history:", historyError);
          }
        }

        const bill = {
          id: billId,
          bill_number: billNumber,
          congress: congress,
          title: billData.bill.title,
          introduction_date: billData.bill.introducedDate ? \`\${billData.bill.introducedDate}T00:00:00Z\` : null,
          status: newStatus,
          analysis_status: 'pending',
          key_points: [],
          analysis: null,
          sponsors: billData.bill.sponsors ? billData.bill.sponsors.map((sponsor) => sponsor.fullName) : [],
          committee: billData.bill.committees?.count > 0 ? billData.bill.committees.url : null,
          full_text: hasFullText ? textContent : null,
          has_full_text: hasFullText,
          bill_type: billType,
          origin_chamber: billData.bill.originChamber || null,
          origin_chamber_code: billData.bill.originChamberCode || null,
          latest_action_date: billData.bill.latestAction?.actionDate ? \`\${billData.bill.latestAction.actionDate}T00:00:00Z\` : null,
          latest_action_text: billData.bill.latestAction?.text || null,
          constitutional_authority_text: billData.bill.constitutionalAuthorityStatementText || null,
          policy_area: billData.bill.policyArea?.name || null,
          subjects: billData.bill.subjects?.count > 0 ? [billData.bill.subjects.url] : [],
          summary: billData.bill.summary?.text || null,
          cbo_cost_estimates: JSON.stringify(billData.bill.cboCostEstimates || []),
          laws: JSON.stringify(billData.bill.laws || []),
          committees_count: billData.bill.committees?.count || 0,
          cosponsors_count: billData.bill.cosponsors?.count || 0,
          withdrawn_cosponsors_count: billData.bill.cosponsors?.countIncludingWithdrawnCosponsors || 0,
          actions_count: billData.bill.actions?.count || 0,
          update_date: billData.bill.updateDate ? new Date(billData.bill.updateDate).toISOString() : null,
          update_date_including_text: billData.bill.updateDateIncludingText ? new Date(billData.bill.updateDateIncludingText).toISOString() : null,
          pdf_url: pdfResult.url
        };

        const { error: upsertError } = await supabase
          .from("bills")
          .upsert(bill);

        if (upsertError) {
          throw upsertError;
        }

        // Save PDF if we have it and savePdfs is true
        if (pdfResult.buffer && savePdfs) {
          const { error: storageError } = await supabase
            .storage
            .from("bill_pdfs")
            .upload(\`\${billId}.pdf\`, pdfResult.buffer, {
              contentType: "application/pdf",
              upsert: true
            });

          if (storageError) {
            console.error("Error saving PDF to Supabase storage:", storageError);
          }
        }

        parentPort?.postMessage({ success: true, bill: { id: billId, type: billType, number: billNumber } });
      } catch (error) {
        parentPort?.postMessage({ success: false, error: error.message, bill: { type: billType, number: billNumber } });
      }
    }

    // Process bills in the worker
    async function processAllBills() {
      for (const bill of bills) {
        try {
          const response = await axios.get(
            \`https://api.congress.gov/v3/bill/\${bill.congress}/\${bill.type}/\${bill.number}?format=json&api_key=\${congressApiKey}\`
          );
          await processBill(response.data);
          // Add a small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          parentPort?.postMessage({ success: false, error: error.message, bill });
        }
      }

      parentPort?.postMessage('done');
    }

    processAllBills().catch(error => {
      console.error('Worker error:', error);
      process.exit(1);
    });
`;

async function updateWorkers() {
  const scriptsDir = path.join(process.cwd(), 'src', 'scripts');
  
  // Update all worker files
  for (let i = 0; i < 4; i++) {
    const workerPath = path.join(scriptsDir, `worker_${i}.mjs`);
    await fs.writeFile(workerPath, workerTemplate);
    console.log(`Updated worker_${i}.mjs`);
  }
}

updateWorkers().catch(console.error); 