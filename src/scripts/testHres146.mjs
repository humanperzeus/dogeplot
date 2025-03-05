import axios from 'axios';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the appropriate .env file
const envPath = join(__dirname, '../../.env.production');
if (fs.existsSync(envPath)) {
  config({ path: envPath });
} else {
  config(); // fallback to default .env
}

const congressApiKey = process.env.VITE_CONGRESS_API_KEY;

async function testHres146() {
  try {
    console.log('Fetching HRES 146 text versions...');
    const url = `https://api.congress.gov/v3/bill/119/hres/146/text?format=json&api_key=${congressApiKey}`;
    const response = await axios.get(url);
    
    if (!response.data?.textVersions?.length) {
      console.log('No text versions available');
      return;
    }

    const latestVersion = response.data.textVersions[response.data.textVersions.length - 1];
    console.log('\nAvailable formats:', latestVersion.formats.map(f => f.type));

    const xmlFormat = latestVersion.formats.find(f => f.type === 'Formatted XML');
    if (xmlFormat) {
      console.log('\nFetching XML content...');
      const xmlResponse = await axios.get(xmlFormat.url);
      console.log('\nRaw XML content:');
      console.log(xmlResponse.data);

      // Test our XML processing
      const processedText = xmlResponse.data
        .replace(/&#x2019;/g, "'")
        .replace(/&#x201[CD]/g, '"')
        .replace(/&#x2013;/g, '-')
        .replace(/&#x2014;/g, '--')
        .replace(/&#xA0;/g, ' ')
        .replace(/&#x[A-F0-9]{4};/g, function(match) {
          return String.fromCharCode(parseInt(match.slice(3, -1), 16));
        })
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      console.log('\nProcessed text:');
      console.log(processedText.substring(0, 500) + '...');  // Show first 500 chars

      // Test different malformed patterns
      console.log('\nDetailed malformed checks:');
      
      // 1. Double spaces
      const doubleSpaces = processedText.includes('  ');
      console.log('Has double spaces:', doubleSpaces);
      
      // 2. Basic single letter check
      const basicSingleLetters = processedText.match(/[A-Za-z]\s[A-Za-z]/g) || [];
      console.log('Basic single letters found:', basicSingleLetters.length);
      
      // 3. Test our new pattern
      const suspiciousPattern = /(?<!Mr|Ms|Mrs|Dr|Jr|Sr|[A-Z]\.)[A-Za-z]\s[A-Za-z](?!\.)/;
      const suspiciousMatches = processedText.match(new RegExp(suspiciousPattern, 'g')) || [];
      console.log('Suspicious matches found:', suspiciousMatches.length);

      // 4. Show context for suspicious matches
      if (suspiciousMatches.length > 0) {
        console.log('\nSuspicious matches with context:');
        suspiciousMatches.slice(0, 10).forEach(match => {
          const index = processedText.indexOf(match);
          const context = processedText.substring(Math.max(0, index - 30), Math.min(processedText.length, index + 30));
          console.log(`"${context}" -> "${match}"`);
        });
      }

      // 5. Check for common legitimate patterns we might be missing
      console.log('\nCommon patterns check:');
      const titleMatches = processedText.match(/(?:Mr|Ms|Mrs|Dr)\.\s[A-Z]/g) || [];
      console.log('Title matches:', titleMatches);
      
      const initialMatches = processedText.match(/[A-Z]\.\s[A-Z]/g) || [];
      console.log('Initial matches:', initialMatches);
      
      const suffixMatches = processedText.match(/[A-Z][a-z]+\s(?:Jr|Sr)\./g) || [];
      console.log('Suffix matches:', suffixMatches);
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testHres146().catch(console.error); 