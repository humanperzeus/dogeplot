import { createClient } from "@supabase/supabase-js";
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

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

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkBills() {
  const billsToCheck = [
    { congress: '119', type: 'hres', number: '9' },
    { congress: '119', type: 's', number: '141' },
    { congress: '119', type: 's', number: '273' },
    { congress: '119', type: 's', number: '298' },
    { congress: '119', type: 's', number: '300' }
  ];

  for (const bill of billsToCheck) {
    console.log(`\nChecking ${bill.type}${bill.number} from congress ${bill.congress}...`);
    
    const { data, error } = await supabase
      .from('bills')
      .select('has_full_text, text_source, full_text')
      .eq('congress', bill.congress)
      .eq('bill_type', bill.type)
      .eq('bill_number', bill.number)
      .single();

    if (error) {
      console.error(`Error fetching bill: ${error.message}`);
      continue;
    }

    console.log('Status:');
    console.log(`- Has full text: ${data.has_full_text}`);
    console.log(`- Text source: ${data.text_source || 'none'}`);
    console.log(`- Text length: ${data.full_text ? data.full_text.length : 0} characters`);
    
    if (data.full_text) {
      console.log('\nFirst 200 characters of text:');
      console.log(data.full_text.substring(0, 200));
    }
  }
}

// Run the script
checkBills().catch(console.error); 