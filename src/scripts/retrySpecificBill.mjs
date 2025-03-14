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
if (fs.existsSync(envPath)) {
  config({ path: envPath });
} else {
  config(); // fallback to default .env
}

const congressApiKey = process.env.VITE_CONGRESS_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt} of ${maxRetries}...`);
      const response = await axios.get(url, {
        timeout: 30000, // 30 second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9'
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

async function fetchBillText(congress, billType, billNumber) {
  try {
    console.log('\nFetching text versions...');
    const textUrl = `https://api.congress.gov/v3/bill/${congress}/${billType}/${billNumber}/text?format=json&api_key=${congressApiKey}`;
    const textResponse = await fetchWithRetry(textUrl);
    
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
        console.log("\nTrying XML format...");
        const response = await fetchWithRetry(xmlFormat.url);
        console.log("Successfully fetched XML");
        const text = response.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return { text, source: 'api' };
      } catch (error) {
        console.log("Failed to fetch XML:", error.message);
      }
    }

    if (htmlFormat) {
      try {
        console.log("\nTrying HTML format...");
        const response = await fetchWithRetry(htmlFormat.url);
        console.log("Successfully fetched HTML");
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

async function retryBill() {
  const bill = {
    congress: '119',
    type: 's',
    number: '300'
  };

  try {
    console.log(`Processing ${bill.type}${bill.number} from congress ${bill.congress}...`);
    
    // Get bill ID first
    const { data: billData, error: billError } = await supabase
      .from('bills')
      .select('id')
      .eq('congress', bill.congress)
      .eq('bill_type', bill.type)
      .eq('bill_number', bill.number)
      .single();

    if (billError) {
      throw billError;
    }

    const { text, source } = await fetchBillText(bill.congress, bill.type, bill.number);
    
    if (text) {
      console.log("\nSuccessfully fetched text. Updating database...");
      console.log("Text length:", text.length);
      console.log("First 200 characters:", text.substring(0, 200));
      
      const { error: updateError } = await supabase
        .from('bills')
        .update({
          full_text: text,
          has_full_text: true,
          text_source: source
        })
        .eq('id', billData.id);

      if (updateError) {
        console.error("Error updating bill:", updateError);
      } else {
        console.log("Successfully updated bill in database");
      }
    } else {
      console.log("\nCould not fetch text for bill");
    }

  } catch (error) {
    console.error("Error processing bill:", error);
  }
}

// Run the script
retryBill().catch(console.error); 