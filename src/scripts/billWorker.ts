// Worker thread code
import { parentPort, workerData } from 'worker_threads';
import { envLoader } from './loadEnv.js';
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase.js";
import { PDFExtract } from "pdf.js-extract";
import axios from "axios";
import { v5 as uuidv5 } from 'uuid';

// Load environment based on worker data
const { mode, url } = workerData.env;
console.log(`\nWorker environment setup: ${mode.toUpperCase()}`);
await envLoader.load(mode);

const { bills, congressApiKey, supabaseServiceRoleKey, savePdfs } = workerData;

const supabase = createClient<Database>(
  url,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const pdfExtract = new PDFExtract();

async function extractTextFromPDF(pdfBuffer: Buffer) {
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

async function fetchBillPDF(congress: string, type: string, number: string) {
  try {
    const url = `https://api.congress.gov/v3/bill/${congress}/${type}/${number}/text?format=json&api_key=${congressApiKey}`;
    const response = await axios.get(url);
    if (!response.data?.textVersions?.length) {
      return { url: null, buffer: null };
    }

    const pdfVersions = response.data.textVersions
      .filter((version: any) => version.formats.some((format: any) => format.type === 'PDF'));

    if (!pdfVersions.length) {
      return { url: null, buffer: null };
    }

    const latestVersion = pdfVersions[pdfVersions.length - 1];
    const pdfFormat = latestVersion.formats.find((format: any) => format.type === 'PDF');
    
    if (!pdfFormat) {
      return { url: null, buffer: null };
    }

    const pdfUrl = pdfFormat.url;

    if (savePdfs) {
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
    }

    return { url: pdfUrl, buffer: null };
  } catch (error) {
    console.error('Error fetching PDF:', error);
    return { url: null, buffer: null };
  }
}

function determineBillStatus(billData: any): string {
  const actions = billData.bill.actions?.items || [];
  const laws = billData.bill.laws || [];
  const latestAction = billData.bill.latestAction?.text?.toLowerCase() || '';

  const sortedActions = [...actions].sort((a: any, b: any) => {
    const dateA = new Date(a.actionDate).getTime();
    const dateB = new Date(b.actionDate).getTime();
    return dateA - dateB;
  });
  const lastActionText = sortedActions.length > 0 ? sortedActions[sortedActions.length - 1].text.toLowerCase() : '';

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
  if (sortedActions.some((action: any) => action.text.toLowerCase().includes('passed house')) &&
      sortedActions.some((action: any) => action.text.toLowerCase().includes('passed senate'))) {
    return 'passed_both_chambers';
  }
  if (lastActionText.includes('passed house') || lastActionText.includes('passed senate')) {
    return 'passed_chamber';
  }
  if (lastActionText.includes('reported by')) {
    return 'reported_by_committee';
  }
  if (lastActionText.includes('referred to')) {
    return 'referred_to_committee';
  }
  if (lastActionText.includes('introduced')) {
    return 'introduced';
  }

  return 'introduced';
}

async function processBill(billData: any): Promise<void> {
  const billType = billData.bill.type.toLowerCase();
  const billNumber = billData.bill.number;
  const congress = billData.bill.congress;

  try {
    const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const billId = uuidv5(`${congress}_${billType}${billNumber}`, NAMESPACE);

    const pdfResult = await fetchBillPDF(congress, billType, billNumber);

    let textContent = '';
    let hasFullText = false;

    if (pdfResult.buffer && savePdfs) {
      try {
        textContent = await extractTextFromPDF(pdfResult.buffer);
        hasFullText = true;
      } catch (error) {
        console.error("Error extracting text from PDF:", error);
      }
    }

    const status = determineBillStatus(billData);

    const bill = {
      id: billId,
      bill_number: billNumber,
      congress: congress,
      title: billData.bill.title,
      introduction_date: billData.bill.introducedDate ? `${billData.bill.introducedDate}T00:00:00Z` : null,
      status: status,
      analysis_status: 'pending',
      key_points: [],
      analysis: null,
      sponsors: billData.bill.sponsors ? billData.bill.sponsors.map((sponsor: any) => sponsor.fullName) : [],
      committee: billData.bill.committees?.count > 0 ? billData.bill.committees.url : null,
      full_text: hasFullText ? textContent : null,
      has_full_text: hasFullText,
      bill_type: billType,
      origin_chamber: billData.bill.originChamber || null,
      origin_chamber_code: billData.bill.originChamberCode || null,
      latest_action_date: billData.bill.latestAction?.actionDate ? `${billData.bill.latestAction.actionDate}T00:00:00Z` : null,
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

    if (pdfResult.buffer && savePdfs) {
      const { error: storageError } = await supabase
        .storage
        .from("bill_pdfs")
        .upload(`${billId}.pdf`, pdfResult.buffer, {
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
        `https://api.congress.gov/v3/bill/${bill.congress}/${bill.type}/${bill.number}?format=json&api_key=${congressApiKey}`
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