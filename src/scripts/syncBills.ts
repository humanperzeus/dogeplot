// Load environment variables first
import './loadEnv.js';
import { config } from "dotenv";
import { envLoader } from './loadEnv.js';

// Get environment from VITE_MODE
const mode = process.env.VITE_MODE || 'staging';
await envLoader.load(mode);

// Now load other imports after environment is set
import { fetchRecentBills, fetchBillPDF } from "../lib/congress.js";
import { createClient } from "@supabase/supabase-js";
import { PDFExtract } from "pdf.js-extract";
import { v5 as uuidv5 } from 'uuid';
import type { Database } from "../types/supabase.js";

// Load environment variables
config();

// Get environment variables after environment is properly loaded
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const congressApiKey = process.env.VITE_CONGRESS_API_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey || !congressApiKey) {
  throw new Error("Required environment variables not found");
}

console.log(`\n=== Bill Synchronization ===`);
console.log(`Environment: ${mode.toUpperCase()}`);
console.log(`Database URL: ${supabaseUrl}`);

const pdfExtract = new PDFExtract();

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

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

  // Final statuses first
  if (laws.length > 0 || 
      lastActionText.includes('became public law') ||
      lastActionText.includes('became private law') ||
      lastActionText.includes('public law no:') ||
      lastActionText.includes('private law no:') ||
      lastActionText.includes('enacted') ||
      lastActionText.includes('enacted into law')) {
    return 'signed_into_law';
  }

  if (lastActionText.includes('veto message received') ||
      lastActionText.includes('vetoed by president') ||
      lastActionText.includes('presidential veto') ||
      lastActionText.includes('received veto message')) {
    return 'vetoed';
  }

  if (lastActionText.includes('passed over president') || 
      lastActionText.includes('veto overridden') ||
      lastActionText.includes('override the veto') ||
      lastActionText.includes('overriding the veto')) {
    return 'veto_overridden';
  }

  if (lastActionText.includes('failed') || 
      lastActionText.includes('rejected') ||
      lastActionText.includes('withdrawn by sponsor') ||
      lastActionText.includes('motion to proceed rejected') ||
      lastActionText.includes('motion to table agreed to') ||
      lastActionText.includes('motion to reconsider laid on table') ||
      lastActionText.includes('failed of passage') ||
      lastActionText.includes('failed to pass')) {
    return 'failed';
  }

  // Presented to President
  if (lastActionText.includes('presented to president') ||
      lastActionText.includes('sent to president') ||
      lastActionText.includes('received by president') ||
      lastActionText.includes('transmitted to president')) {
    return 'presented_to_president';
  }

  // Passage through chambers
  if ((lastActionText.includes('passed house') && lastActionText.includes('passed senate')) ||
      (lastActionText.includes('agreed to in house') && lastActionText.includes('agreed to in senate')) ||
      lastActionText.includes('cleared for president') ||
      lastActionText.includes('cleared for white house') ||
      lastActionText.includes('passed both chambers') ||
      // Check historical actions for passage through both chambers
      (sortedActions.some(action => action.text.toLowerCase().includes('passed house')) &&
       sortedActions.some(action => action.text.toLowerCase().includes('passed senate')))) {
    return 'passed_both_chambers';
  }

  if (lastActionText.includes('passed house') || 
      lastActionText.includes('passed senate') ||
      lastActionText.includes('agreed to in house') ||
      lastActionText.includes('agreed to in senate') ||
      lastActionText.includes('passed/agreed to in house') ||
      lastActionText.includes('passed/agreed to in senate') ||
      lastActionText.includes('resolution agreed to in house') ||
      lastActionText.includes('resolution agreed to in senate') ||
      lastActionText.includes('passed by recorded vote') ||
      lastActionText.includes('passed by yea-nay vote') ||
      // Add patterns for Senate resolutions
      (lastActionText.includes('submitted in the senate') && 
       lastActionText.includes('agreed to') &&
       lastActionText.includes('unanimous consent')) ||
      lastActionText.includes('resolution agreed to in senate') ||
      // Add pattern for messages between chambers
      lastActionText.includes('message on senate action sent to the house') ||
      lastActionText.includes('message on house action sent to the senate')) {
    return 'passed_chamber';
  }

  // Committee actions
  if ((lastActionText.includes('reported by') && 
       (lastActionText.includes('committee') || lastActionText.includes('comm.'))) ||
      lastActionText.includes('ordered to be reported') ||
      lastActionText.includes('committee reports') ||
      lastActionText.includes('reported with amendment') ||
      lastActionText.includes('reported without amendment') ||
      lastActionText.includes('reported favorably') ||
      (lastActionText.includes('placed on') && 
       (lastActionText.includes('calendar') || lastActionText.includes('legislative calendar'))) ||
      // Add pattern for bills held at desk after committee
      (lastActionText.includes('held at the desk') && 
       lastActionText.includes('committee'))) {
    return 'reported_by_committee';
  }

  if ((lastActionText.includes('referred to') && 
       (lastActionText.includes('committee') || lastActionText.includes('comm.'))) ||
      lastActionText.includes('committee referral') ||
      lastActionText.includes('sequential referral') ||
      lastActionText.includes('referred to subcommittee') ||
      lastActionText.includes('referred to the subcommittee') ||
      lastActionText.includes('referred to the committee') ||
      // Add pattern for bills held at desk before committee
      (lastActionText.includes('held at the desk') && 
       !lastActionText.includes('committee'))) {
    return 'referred_to_committee';
  }

  // Default to introduced for new bills
  if (lastActionText.includes('introduced') ||
      lastActionText.includes('read first time') ||
      lastActionText.includes('read twice') ||
      lastActionText.includes('sponsor introductory remarks')) {
    return 'introduced';
  }

  return 'introduced'; // Fallback for new bills with minimal action
}

async function processBill(billData: any, forceSync: boolean, savePdfs: boolean): Promise<'processed' | 'failed' | 'skipped'> {
  const billType = billData.bill.type.toLowerCase();
  const billNumber = billData.bill.number;
  const congress = billData.bill.congress;

  try {
    console.log(`Starting to process bill ${billType}${billNumber} from congress ${congress}`);

    // Generate a deterministic UUID for the bill using uuidv5
    const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const billId = uuidv5(`${congress}_${billType}${billNumber}`, NAMESPACE);

    // Check if bill already exists and get its current status
    const { data: existingBill, error: lookupError } = await supabase
      .from('bills')
      .select('id, status, has_full_text')
      .eq('id', billId)
      .single();

    if (!lookupError && existingBill && !forceSync && existingBill.has_full_text) {
      console.log(`Bill ${billType}${billNumber} already exists with full text, skipping...`);
      return 'skipped';
    }

    // Always try to fetch PDF for text extraction
    console.log("Fetching PDF...");
    const pdfResult = await fetchBillPDF(congress, billType, billNumber);

    let textContent = '';
    let hasFullText = false;

    // Try to extract text if we have a PDF buffer
    if (pdfResult.buffer) {
      console.log("PDF fetched successfully");
      try {
        console.log("Extracting text from PDF...");
        textContent = await extractTextFromPDF(pdfResult.buffer);
        hasFullText = true;
        console.log("Text extracted successfully");
      } catch (error) {
        console.error("Error extracting text from PDF:", error);
      }
    } else if (pdfResult.url) {
      console.log("PDF URL available but buffer not fetched:", pdfResult.url);
      // Optionally retry with direct PDF download if needed
    }

    // Determine the new status
    const newStatus = determineBillStatus(billData);

    // Log status change to history if different
    if (existingBill && existingBill.status !== newStatus) {
      console.log(`Status changed from '${existingBill.status}' to '${newStatus}'`);
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

    // Prepare bill data for database with all available fields
    const bill = {
      id: billId,
      bill_number: billNumber,
      congress: congress,
      title: billData.bill.title,
      introduction_date: billData.bill.introducedDate ? `${billData.bill.introducedDate}T00:00:00Z` : null,
      status: newStatus,
      analysis_status: 'pending',
      key_points: [],
      analysis: null,
      sponsors: billData.bill.sponsors ? billData.bill.sponsors.map((sponsor: any) => sponsor.fullName) : [],
      committee: billData.bill.committees?.count > 0 ? billData.bill.committees.url : null,
      full_text: hasFullText ? textContent : null,
      has_full_text: hasFullText,
      related_bills: JSON.stringify(billData.bill.relatedBills?.count > 0 ? billData.bill.relatedBills : []),
      bill_type: billType,
      origin_chamber: billData.bill.originChamber || null,
      origin_chamber_code: billData.bill.originChamberCode || null,
      latest_action_date: billData.bill.latestAction?.actionDate ? `${billData.bill.latestAction.actionDate}T00:00:00Z` : null,
      latest_action_text: billData.bill.latestAction?.text || null,
      constitutional_authority_text: billData.bill.constitutionalAuthorityStatementText || null,
      policy_area: billData.bill.policyArea?.name || null,
      subjects: billData.bill.subjects?.count > 0 ? [billData.bill.subjects.url] : [],
      summary: null, // We'll need to fetch this separately if needed
      cbo_cost_estimates: JSON.stringify(billData.bill.cboCostEstimates || []),
      laws: JSON.stringify(billData.bill.laws || []),
      committees_count: billData.bill.committees?.count || 0,
      cosponsors_count: billData.bill.cosponsors?.count || 0,
      withdrawn_cosponsors_count: billData.bill.cosponsors?.countIncludingWithdrawnCosponsors || 0,
      actions_count: billData.bill.actions?.count || 0,
      update_date: billData.bill.updateDate ? new Date(billData.bill.updateDate).toISOString() : null,
      update_date_including_text: billData.bill.updateDateIncludingText ? new Date(billData.bill.updateDateIncludingText).toISOString() : null,
      pdf_url: pdfResult.url // Add PDF URL to the bill data
    };

    // Save bill to database
    console.log("Saving bill to Supabase...");
    const { error: upsertError } = await supabase
      .from("bills")
      .upsert(bill);

    if (upsertError) {
      console.error("Error saving bill metadata to Supabase:", upsertError);
      throw upsertError;
    }

    // Only save PDF to storage if we have it AND saving is enabled
    if (pdfResult.buffer && savePdfs) {
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
        throw storageError;
      }
    }

    console.log("Successfully processed bill:", `${billType}${billNumber}`);

    // Remove from failed_bills if it was there
    await supabase
      .from('failed_bills')
      .delete()
      .match({
        congress: congress,
        bill_type: billType,
        bill_number: billNumber
      });

    return 'processed';
  } catch (error) {
    console.error(`Error processing bill ${billData.bill.number}:`, error);

    // Add to failed_bills table
    const failedBill = {
      congress: congress,
      bill_type: billType,
      bill_number: billNumber,
      title: billData.bill.title,
      error_message: error.message || 'Unknown error',
      retry_count: 0,
      status: 'failed'
    };

    const { error: insertError } = await supabase
      .from('failed_bills')
      .upsert(failedBill, {
        onConflict: 'congress,bill_type,bill_number'
      });

    if (insertError) {
      console.error('Error recording failed bill:', insertError);
    }

    return 'failed';
  }
}

async function main() {
  try {
    console.log("Starting bill synchronization...");

    // Parse CLI arguments
    let cliLimit: number | null = null;
    let cliCongress: number | null = null;
    let cliOffset: number | null = null;
    let forceSync = false;
    let savePdfs = false;

    process.argv.forEach(arg => {
      if (arg.startsWith('--limit=')) {
        const limitValue = arg.split('=')[1];
        cliLimit = parseInt(limitValue);
        if (isNaN(cliLimit)) {
          console.warn(`Invalid limit value '${limitValue}', using default`);
          cliLimit = null;
        }
      }
      if (arg.startsWith('--congress=')) {
        const congressValue = arg.split('=')[1];
        cliCongress = parseInt(congressValue);
        if (isNaN(cliCongress)) {
          console.warn(`Invalid congress value '${congressValue}', using current`);
          cliCongress = null;
        }
      }
      if (arg.startsWith('--offset=')) {
        const offsetValue = arg.split('=')[1];
        cliOffset = parseInt(offsetValue);
        if (isNaN(cliOffset)) {
          console.warn(`Invalid offset value '${offsetValue}', using default (0)`);
          cliOffset = null;
        }
      }
      if (arg === '--force') {
        forceSync = true;
        console.log('Force sync enabled - will reprocess existing bills');
      }
      if (arg === '--save-pdfs') {
        savePdfs = true;
        console.log('PDF saving enabled - will store PDFs in Supabase storage');
      }
    });

    const envLimit = process.env.BILL_LIMIT ? parseInt(process.env.BILL_LIMIT) : 25;
    const billLimit = cliLimit ?? envLimit;
    const offset = cliOffset ?? 0;

    const limitSource = cliLimit ? 'CLI (--limit)' : '.env';
    console.log(`Bill processing limit set to ${billLimit} (${limitSource})`);
    console.log(`Starting from offset: ${offset}`);

    if (cliCongress) {
      console.log(`Using specified Congress: ${cliCongress}`);
    }

    // Fetch recent bills with the specified limit, offset, and Congress
    console.log("\n=== Fetching Bills ===");
    const bills = await fetchRecentBills({ 
      limit: billLimit,
      offset: offset,
      congress: cliCongress || undefined 
    });

    if (bills.length === 0) {
      console.log("No bills found to process");
      return;
    }

    console.log("\n=== Processing Bills ===");
    console.log(`Found ${bills.length} bills to process`);

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process each bill
    for (const initialBill of bills) {
      try {
        console.log(`\nProcessing bill ${initialBill.type}${initialBill.number} (${processedCount + 1}/${bills.length})`);

        // Fetch detailed bill data
        const detailedBillResponse = await fetch(
          `https://api.congress.gov/v3/bill/${initialBill.congress}/${initialBill.type.toLowerCase()}/${initialBill.number}?format=json&api_key=${congressApiKey}`
        );

        if (!detailedBillResponse.ok) {
          console.error(`Failed to fetch detailed data for bill ${initialBill.type}${initialBill.number}:`, {
            status: detailedBillResponse.status,
            statusText: detailedBillResponse.statusText
          });
          errorCount++;
          continue;
        }

        const detailedBillData = await detailedBillResponse.json();

        const result = await processBill(detailedBillData, forceSync, savePdfs);
        if (result === 'skipped') {
          skippedCount++;
        } else {
          processedCount++;
        }
      } catch (error) {
        console.error(`Failed to process bill ${initialBill.type}${initialBill.number}:`, error);
        errorCount++;
        // Continue with next bill instead of stopping the entire process
        continue;
      }
    }

    console.log("\n=== Synchronization Complete ===");
    console.log(`Total bills found: ${bills.length}`);
    console.log(`Successfully processed: ${processedCount}`);
    console.log(`Skipped (already exists): ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);

  } catch (error) {
    console.error("Fatal error during bill synchronization:", error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});