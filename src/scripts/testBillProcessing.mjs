import axios from 'axios';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { createClient } from "@supabase/supabase-js";
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

async function testBillProcessing() {
  if (!congressApiKey) {
    throw new Error("Congress API key not found in environment");
  }

  try {
    // 1. First get the bill details
    console.log("1. Fetching bill details...");
    const billUrl = `https://api.congress.gov/v3/bill/119/s/260?format=json&api_key=${congressApiKey}`;
    const billResponse = await axios.get(billUrl);
    console.log("\nBill basic info:");
    console.log({
      congress: billResponse.data.bill.congress,
      number: billResponse.data.bill.number,
      type: billResponse.data.bill.type,
      title: billResponse.data.bill.title
    });

    // 2. Get the text versions
    console.log("\n2. Fetching text versions...");
    const textUrl = `https://api.congress.gov/v3/bill/119/s/260/text?format=json&api_key=${congressApiKey}`;
    const textResponse = await axios.get(textUrl);
    
    if (!textResponse.data?.textVersions?.length) {
      console.log("No text versions available");
      return;
    }

    // Get the latest version
    const latestVersion = textResponse.data.textVersions[textResponse.data.textVersions.length - 1];
    console.log("\nAvailable formats:", latestVersion.formats.map(f => f.type));

    // 3. Try to get text content in order of preference
    console.log("\n3. Attempting to fetch text content...");
    let textContent = null;
    let textSource = null;
    let pdfUrl = null;

    // Try formats in order: TXT -> XML -> HTML -> PDF
    const textFormat = latestVersion.formats.find(f => f.type === 'TXT');
    const xmlFormat = latestVersion.formats.find(f => f.type === 'Formatted XML');
    const htmlFormat = latestVersion.formats.find(f => f.type === 'Formatted Text');
    const pdfFormat = latestVersion.formats.find(f => f.type === 'PDF');

    if (textFormat) {
      try {
        console.log("Trying TXT format...");
        const response = await axios.get(textFormat.url);
        textContent = response.data;
        textSource = 'api';
      } catch (error) {
        console.log("Failed to fetch TXT:", error.message);
      }
    }

    if (!textContent && xmlFormat) {
      try {
        console.log("Trying XML format...");
        const response = await axios.get(xmlFormat.url);
        textContent = response.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        textSource = 'api';
      } catch (error) {
        console.log("Failed to fetch XML:", error.message);
      }
    }

    if (!textContent && htmlFormat) {
      try {
        console.log("Trying HTML format...");
        const response = await axios.get(htmlFormat.url);
        textContent = response.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        textSource = 'api';
      } catch (error) {
        console.log("Failed to fetch HTML:", error.message);
      }
    }

    if (pdfFormat) {
      pdfUrl = pdfFormat.url;
      if (!textContent) {
        console.log("Would fall back to PDF processing");
        textSource = 'pdf';
      }
    }

    // 4. Generate the database record
    const billId = uuidv5(`119_s260`, NAMESPACE);
    const billRecord = {
      id: billId,
      bill_number: "260",
      congress: "119",
      title: billResponse.data.bill.title,
      introduction_date: billResponse.data.bill.introducedDate ? `${billResponse.data.bill.introducedDate}T00:00:00Z` : null,
      status: 'referred_to_committee',
      analysis_status: 'pending',
      key_points: [],
      analysis: null,
      sponsors: billResponse.data.bill.sponsors ? billResponse.data.bill.sponsors.map(sponsor => sponsor.fullName) : [],
      committee: billResponse.data.bill.committees?.count > 0 ? billResponse.data.bill.committees.url : null,
      full_text: textContent,
      has_full_text: !!textContent,
      text_source: textSource,
      bill_type: "s",
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
      pdf_url: pdfUrl
    };

    console.log("\n4. Database record that would be created:");
    console.log(JSON.stringify(billRecord, null, 2));

    // 5. Show key statistics
    console.log("\n5. Key Statistics:");
    console.log({
      hasText: !!textContent,
      textSource: textSource,
      textLength: textContent ? textContent.length : 0,
      hasPdfUrl: !!pdfUrl
    });

  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

testBillProcessing().catch(console.error); 