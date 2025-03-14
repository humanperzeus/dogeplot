import axios from 'axios';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { createClient } from "@supabase/supabase-js";
import { PDFExtract } from "pdf.js-extract";
import { v5 as uuidv5 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the appropriate .env file
const envPath = join(__dirname, '../../.env.staging');
console.log(`Loading environment from: ${envPath}`);
config({ path: envPath });

// Check if we have the required environment variables
if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VITE_CONGRESS_API_KEY) {
  console.error('Missing required environment variables. Please check your .env.staging file.');
  process.exit(1);
}

const congressApiKey = process.env.VITE_CONGRESS_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const pdfExtract = new PDFExtract();

async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt} of ${maxRetries}...`);
      const response = await axios.get(url, {
        timeout: 30000, // 30 second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf'
        }
      });
      return response;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) {
        throw error;
      }
      // Wait longer between each retry
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
}

async function extractTextFromPDF(pdfBuffer) {
  try {
    const data = await pdfExtract.extractBuffer(pdfBuffer);
    return data.pages
      .map((page) => page.content.map((item) => item.str).join(" "))
      .join("\n");
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    throw error;
  }
}

async function fetchBillContent(congress, type, number) {
  try {
    console.log('\nFetching text versions...');
    const textUrl = `https://api.congress.gov/v3/bill/${congress}/${type}/${number}/text?format=json&api_key=${congressApiKey}`;
    const textResponse = await fetchWithRetry(textUrl);
    
    if (!textResponse.data?.textVersions?.length) {
      return { 
        pdfUrl: null, 
        pdfBuffer: null,
        apiText: null,
        textSource: null 
      };
    }

    // Get the latest version
    const latestVersion = textResponse.data.textVersions[textResponse.data.textVersions.length - 1];
    console.log("Available formats:", latestVersion.formats.map(f => f.type));

    // Try formats in order: XML -> HTML -> PDF
    const xmlFormat = latestVersion.formats.find(f => f.type === 'Formatted XML');
    const htmlFormat = latestVersion.formats.find(f => f.type === 'Formatted Text');
    const pdfFormat = latestVersion.formats.find(f => f.type === 'PDF');

    if (xmlFormat) {
      try {
        console.log("\nTrying XML format...");
        const response = await fetchWithRetry(xmlFormat.url);
        const text = response.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return {
          pdfUrl: pdfFormat?.url || null,
          pdfBuffer: null,
          apiText: text,
          textSource: 'api'
        };
      } catch (error) {
        console.log("Failed to fetch XML:", error.message);
      }
    }

    if (htmlFormat) {
      try {
        console.log("\nTrying HTML format...");
        const response = await fetchWithRetry(htmlFormat.url);
        const text = response.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return {
          pdfUrl: pdfFormat?.url || null,
          pdfBuffer: null,
          apiText: text,
          textSource: 'api'
        };
      } catch (error) {
        console.log("Failed to fetch HTML:", error.message);
      }
    }

    // If no text formats worked or are available, try PDF
    if (pdfFormat) {
      try {
        console.log("\nTrying PDF format...");
        const pdfResponse = await fetchWithRetry(pdfFormat.url);
        const pdfBuffer = Buffer.from(pdfResponse.data);
        const text = await extractTextFromPDF(pdfBuffer);
        return {
          pdfUrl: pdfFormat.url,
          pdfBuffer,
          apiText: text,
          textSource: 'pdf'
        };
      } catch (error) {
        console.log("Failed to process PDF:", error.message);
        return {
          pdfUrl: pdfFormat.url,
          pdfBuffer: null,
          apiText: null,
          textSource: null
        };
      }
    }

    return { 
      pdfUrl: null, 
      pdfBuffer: null,
      apiText: null,
      textSource: null 
    };
  } catch (error) {
    console.error("Error fetching bill content:", error.message);
    return { 
      pdfUrl: null, 
      pdfBuffer: null,
      apiText: null,
      textSource: null 
    };
  }
}

function determineBillStatus(billData) {
  const actions = billData.bill.actions || [];
  const laws = billData.bill.laws || [];
  const lastAction = billData.bill.latestAction;
  const lastActionText = lastAction?.text?.toLowerCase() || '';

  if (laws.length > 0 || lastActionText.includes('became public law')) {
    return 'signed_into_law';
  }
  if (lastActionText.includes('veto overridden')) {
    return 'veto_overridden';
  }
  if (lastActionText.includes('vetoed')) {
    return 'vetoed';
  }
  if (lastActionText.includes('presented to president')) {
    return 'presented_to_president';
  }
  if (lastActionText.includes('passed senate') && lastActionText.includes('passed house')) {
    return 'passed_both_chambers';
  }
  if (lastActionText.includes('passed') && (lastActionText.includes('house') || lastActionText.includes('senate'))) {
    return 'passed_chamber';
  }
  if (lastActionText.includes('reported')) {
    return 'reported_by_committee';
  }
  if (lastActionText.includes('referred to')) {
    return 'referred_to_committee';
  }
  
  return 'introduced';
}

async function retryFailedBills() {
  try {
    // Get all failed bills that haven't been retried too many times
    const { data: failedBills, error } = await supabase
      .from('failed_bills')
      .select('*')
      .lt('retry_count', 3) // Only retry bills that haven't been tried more than 3 times
      .order('last_retry', { ascending: true });

    if (error) {
      throw error;
    }

    console.log(`Found ${failedBills?.length || 0} failed bills to retry`);

    let successCount = 0;
    let failureCount = 0;

    for (const bill of failedBills || []) {
      console.log(`\nProcessing ${bill.bill_type}${bill.bill_number} from congress ${bill.congress}...`);
      
      try {
        // First fetch the full bill details
        const billUrl = `https://api.congress.gov/v3/bill/${bill.congress}/${bill.bill_type}/${bill.bill_number}?format=json&api_key=${congressApiKey}`;
        const billResponse = await fetchWithRetry(billUrl);
        
        if (!billResponse.data) {
          throw new Error('No data received from Congress API');
        }

        // Generate bill ID
        const billId = uuidv5(`${bill.congress}_${bill.bill_type}${bill.bill_number}`, NAMESPACE);

        // Then try to get the content
        const content = await fetchBillContent(bill.congress, bill.bill_type, bill.bill_number);
        
        // Prepare the bill record
        const billRecord = {
          id: billId,
          bill_number: bill.bill_number,
          congress: bill.congress,
          title: billResponse.data.bill.title,
          introduction_date: billResponse.data.bill.introducedDate ? `${billResponse.data.bill.introducedDate}T00:00:00Z` : null,
          status: determineBillStatus(billResponse.data),
          analysis_status: 'pending',
          key_points: [],
          analysis: null,
          sponsors: billResponse.data.bill.sponsors ? billResponse.data.bill.sponsors.map(sponsor => sponsor.fullName) : [],
          committee: billResponse.data.bill.committees?.count > 0 ? billResponse.data.bill.committees.url : null,
          full_text: content.apiText,
          has_full_text: !!content.apiText,
          text_source: content.textSource,
          bill_type: bill.bill_type,
          origin_chamber: billResponse.data.bill.originChamber || null,
          origin_chamber_code: billResponse.data.bill.originChamberCode || null,
          latest_action_date: billResponse.data.bill.latestAction?.actionDate ? `${billResponse.data.bill.latestAction.actionDate}T00:00:00Z` : null,
          latest_action_text: billResponse.data.bill.latestAction?.text || null,
          constitutional_authority_text: billResponse.data.bill.constitutionalAuthorityStatementText || null,
          policy_area: billResponse.data.bill.policyArea?.name || null,
          subjects: billResponse.data.bill.subjects?.count > 0 ? [billResponse.data.bill.subjects.url] : [],
          summary: billResponse.data.bill.summary?.text || null,
          cbo_cost_estimates: JSON.stringify(billResponse.data.bill.cboCostEstimates || []),
          laws: JSON.stringify(billResponse.data.bill.laws || []),
          committees_count: billResponse.data.bill.committees?.count || 0,
          cosponsors_count: billResponse.data.bill.cosponsors?.count || 0,
          withdrawn_cosponsors_count: billResponse.data.bill.cosponsors?.countIncludingWithdrawnCosponsors || 0,
          actions_count: billResponse.data.bill.actions?.count || 0,
          update_date: billResponse.data.bill.updateDate ? new Date(billResponse.data.bill.updateDate).toISOString() : null,
          update_date_including_text: billResponse.data.bill.updateDateIncludingText ? new Date(billResponse.data.bill.updateDateIncludingText).toISOString() : null,
          pdf_url: content.pdfUrl
        };

        // Update the bill
        const { error: upsertError } = await supabase
          .from('bills')
          .upsert(billRecord);

        if (upsertError) {
          throw upsertError;
        }

        // If successful, remove from failed_bills
        const { error: deleteError } = await supabase
          .from('failed_bills')
          .delete()
          .match({ 
            congress: bill.congress, 
            bill_type: bill.bill_type, 
            bill_number: bill.bill_number 
          });

        if (deleteError) {
          console.error("Error removing from failed_bills:", deleteError);
        }

        console.log("Successfully processed bill");
        successCount++;
      } catch (error) {
        console.error(`Error processing bill ${bill.bill_type}${bill.bill_number}:`, error.message);
        
        // Update retry count and last retry timestamp
        const { error: updateError } = await supabase
          .from('failed_bills')
          .update({ 
            retry_count: (bill.retry_count || 0) + 1,
            last_retry: new Date().toISOString(),
            error_message: error.message || 'Unknown error'
          })
          .match({ 
            congress: bill.congress, 
            bill_type: bill.bill_type, 
            bill_number: bill.bill_number 
          });

        if (updateError) {
          console.error("Error updating failed_bills:", updateError);
        }

        failureCount++;
      }

      // Add a small delay between bills
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("\nRetry process complete!");
    console.log(`Successfully processed: ${successCount} bills`);
    console.log(`Failed to process: ${failureCount} bills`);

  } catch (error) {
    console.error("Error in retry process:", error);
  }
}

// Run the retry process
retryFailedBills().catch(console.error); 