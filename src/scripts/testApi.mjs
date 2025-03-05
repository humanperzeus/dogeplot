import axios from 'axios';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

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

async function testCongressApi() {
  if (!congressApiKey) {
    throw new Error("Congress API key not found in environment");
  }

  try {
    // First get the bill details
    console.log("Fetching bill details...");
    const billUrl = `https://api.congress.gov/v3/bill/119/s/260?format=json&api_key=${congressApiKey}`;
    const billResponse = await axios.get(billUrl);
    console.log("\nBill Response:");
    console.log(JSON.stringify(billResponse.data, null, 2));

    // Then get the text versions
    console.log("\nFetching text versions...");
    const textUrl = `https://api.congress.gov/v3/bill/119/s/260/text?format=json&api_key=${congressApiKey}`;
    const textResponse = await axios.get(textUrl);
    console.log("\nText Response:");
    console.log(JSON.stringify(textResponse.data, null, 2));

    // If we have text versions, try to get the actual text
    if (textResponse.data?.textVersions?.length > 0) {
      const latestVersion = textResponse.data.textVersions[textResponse.data.textVersions.length - 1];
      const textFormat = latestVersion.formats.find(f => f.type === 'TXT');
      
      if (textFormat) {
        console.log("\nFetching actual text content...");
        const textContentResponse = await axios.get(textFormat.url);
        console.log("\nText Content (first 500 chars):");
        console.log(textContentResponse.data.substring(0, 500));
      } else {
        console.log("\nNo TXT format found. Available formats:");
        console.log(latestVersion.formats);
      }
    }
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

testCongressApi().catch(console.error); 