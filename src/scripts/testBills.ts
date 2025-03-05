// Load environment variables first
import './loadEnv.js';
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase.js";
import axios from "axios";
import { v5 as uuidv5 } from 'uuid';
import { PDFExtract } from "pdf.js-extract";

// Load environment variables
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const congressApiKey = process.env.VITE_CONGRESS_API_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey || !congressApiKey) {
  throw new Error("Required environment variables not found");
}

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const pdfExtract = new PDFExtract();

const BASE_API_URL = "https://api.congress.gov/v3";
const DEFAULT_FORMAT = "json";

// Test bills to fetch from 118th Congress with known statuses
const testBills = [
  // Very Recent Bills (Last Few Days)
  { type: 'hr', number: '7444', congress: '118' }, // Rural Partnership Act
  { type: 'hr', number: '7445', congress: '118' }, // Recent Bill
  { type: 'hr', number: '7446', congress: '118' }, // Recent Bill
  { type: 'hr', number: '7447', congress: '118' }, // Recent Bill
  { type: 'hr', number: '7448', congress: '118' }, // Recent Bill
  { type: 'hr', number: '7449', congress: '118' }, // Recent Bill
  { type: 'hr', number: '7450', congress: '118' }, // Recent Bill
  { type: 'hr', number: '7451', congress: '118' }, // Recent Bill
  { type: 'hr', number: '7452', congress: '118' }, // Recent Bill
  { type: 'hr', number: '7453', congress: '118' }  // Recent Bill
];

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
    // First try to get the PDF URL from the Congress.gov API
    const url = `${BASE_API_URL}/bill/${congress}/${type}/${number}/text?format=${DEFAULT_FORMAT}&api_key=${congressApiKey}`;
    console.log('Fetching PDF URL from:', url);
    
    const response = await axios.get(url);
    if (!response.data?.textVersions?.length) {
      console.log('No text versions found');
      return { url: null, buffer: null };
    }

    // Get the most recent PDF version
    const pdfVersions = response.data.textVersions
      .filter((version: any) => version.formats.some((format: any) => format.type === 'PDF'));

    if (!pdfVersions.length) {
      console.log('No PDF versions found');
      return { url: null, buffer: null };
    }

    const latestVersion = pdfVersions[pdfVersions.length - 1];
    const pdfFormat = latestVersion.formats.find((format: any) => format.type === 'PDF');
    
    if (!pdfFormat) {
      console.log('No PDF format found in latest version');
      return { url: null, buffer: null };
    }

    const pdfUrl = pdfFormat.url;
    console.log('Found PDF URL:', pdfUrl);

    // Fetch the actual PDF content
    console.log('Fetching PDF content...');
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
    console.error('Error fetching PDF:', error);
    return { url: null, buffer: null };
  }
}

// Function to determine bill status based on Congress.gov API actions
function determineBillStatus(billData: any): string {
  const actions = billData.bill.actions?.items || [];
  const laws = billData.bill.laws || [];
  const latestAction = billData.bill.latestAction?.text?.toLowerCase() || '';

  // Sort actions by date to ensure chronological order
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

  return 'introduced'; // Fallback for new bills with minimal action
}

async function processBill(billData: any): Promise<void> {
  const billType = billData.bill.type.toLowerCase();
  const billNumber = billData.bill.number;
  const congress = billData.bill.congress;

  try {
    console.log(`Processing bill ${billType}${billNumber} from congress ${congress}`);

    // Generate deterministic UUID
    const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const billId = uuidv5(`${congress}_${billType}${billNumber}`, NAMESPACE);

    // Fetch PDF and extract text
    console.log("Fetching PDF...");
    const pdfResult = await fetchBillPDF(congress, billType, billNumber);

    let textContent = '';
    let hasFullText = false;

    // Process PDF content if available
    if (pdfResult.buffer) {
      console.log("PDF fetched successfully");
      // Extract text from PDF
      try {
        console.log("Extracting text from PDF...");
        textContent = await extractTextFromPDF(pdfResult.buffer);
        hasFullText = true;
        console.log("Text extracted successfully");
      } catch (error) {
        console.error("Error extracting text from PDF:", error);
      }
    } else if (pdfResult.url) {
      console.log("Using PDF URL without storing file:", pdfResult.url);
    }

    // Determine status
    const status = determineBillStatus(billData);

    // Prepare bill data
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

    // Save to database
    const { error: upsertError } = await supabase
      .from("bills")
      .upsert(bill);

    if (upsertError) {
      throw upsertError;
    }

    // Save PDF to storage if we have it
    if (pdfResult.buffer) {
      console.log("Saving PDF to Supabase storage...");
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

    console.log(`Successfully processed bill ${billType}${billNumber} with status: ${status}`);
    console.log('Bill Details:', {
      title: bill.title,
      status: bill.status,
      latest_action: bill.latest_action_text,
      sponsors_count: bill.cosponsors_count,
      actions_count: bill.actions_count,
      policy_area: bill.policy_area,
      has_pdf: !!pdfResult.url,
      has_text: hasFullText,
      pdf_url: pdfResult.url
    });
  } catch (error) {
    console.error(`Error processing bill ${billType}${billNumber}:`, error);
  }
}

async function main() {
  console.log("\n=== Starting Real Bills Processing ===\n");

  for (const testBill of testBills) {
    try {
      const url = `${BASE_API_URL}/bill/${testBill.congress}/${testBill.type}/${testBill.number}?format=${DEFAULT_FORMAT}&api_key=${congressApiKey}`;
      console.log(`\nFetching bill ${testBill.type}${testBill.number}...`);
      
      const response = await axios.get(url);
      await processBill(response.data);
      
      // Add a delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error fetching bill ${testBill.type}${testBill.number}:`, error);
    }
  }

  console.log("\n=== Real Bills Processing Complete ===\n");
}

// Run the script
main().catch(console.error); 