import axios from 'axios';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the appropriate .env file
const envPath = join(__dirname, '../../.env.staging');
console.log(`Loading environment from: ${envPath}`);
config({ path: envPath });

// Check if we have the required environment variables
if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables. Please check your .env.staging file.');
  process.exit(1);
}

const congressApiKey = process.env.VITE_CONGRESS_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function fetchBillText(congress, billType, billNumber) {
  try {
    // First get the text versions
    const textUrl = `https://api.congress.gov/v3/bill/${congress}/${billType}/${billNumber}/text?format=json&api_key=${congressApiKey}`;
    const textResponse = await axios.get(textUrl);
    
    if (!textResponse.data?.textVersions?.length) {
      console.log("No text versions available");
      return { text: null, source: null };
    }

    // Get the latest version
    const latestVersion = textResponse.data.textVersions[textResponse.data.textVersions.length - 1];
    console.log("Available formats:", latestVersion.formats.map(f => f.type));

    // Try formats in order: XML -> HTML -> PDF
    const xmlFormat = latestVersion.formats.find(f => f.type === 'Formatted XML');
    const htmlFormat = latestVersion.formats.find(f => f.type === 'Formatted Text');

    if (xmlFormat) {
      try {
        console.log("Trying XML format...");
        const response = await axios.get(xmlFormat.url);
        const text = response.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return { text, source: 'api' };
      } catch (error) {
        console.log("Failed to fetch XML:", error.message);
      }
    }

    if (htmlFormat) {
      try {
        console.log("Trying HTML format...");
        const response = await axios.get(htmlFormat.url);
        const text = response.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return { text, source: 'api' };
      } catch (error) {
        console.log("Failed to fetch HTML:", error.message);
      }
    }

    return { text: null, source: null };
  } catch (error) {
    console.error("Error fetching bill text:", error.message);
    return { text: null, source: null };
  }
}

async function processBillsWithoutText() {
  try {
    // Get all bills without text
    const { data: bills, error } = await supabase
      .from('bills')
      .select('id, congress, bill_type, bill_number')
      .is('full_text', null)
      .order('congress', { ascending: true })
      .order('bill_type', { ascending: true })
      .order('bill_number', { ascending: true });

    if (error) {
      throw error;
    }

    console.log(`Found ${bills.length} bills without text`);

    let successCount = 0;
    let failureCount = 0;

    for (const bill of bills) {
      console.log(`\nProcessing ${bill.bill_type}${bill.bill_number} from congress ${bill.congress}...`);
      
      const { text, source } = await fetchBillText(bill.congress, bill.bill_type, bill.bill_number);
      
      if (text) {
        // Update the bill with the text
        const { error: updateError } = await supabase
          .from('bills')
          .update({
            full_text: text,
            has_full_text: true,
            text_source: source
          })
          .eq('id', bill.id);

        if (updateError) {
          console.error("Error updating bill:", updateError);
          failureCount++;
        } else {
          console.log("Successfully updated bill with text");
          successCount++;
        }
      } else {
        console.log("Could not fetch text for bill");
        failureCount++;
      }

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("\nProcessing complete!");
    console.log(`Successfully updated ${successCount} bills`);
    console.log(`Failed to update ${failureCount} bills`);

  } catch (error) {
    console.error("Error processing bills:", error);
  }
}

// Run the script
processBillsWithoutText().catch(console.error); 