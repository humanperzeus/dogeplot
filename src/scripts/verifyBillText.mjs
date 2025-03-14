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

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function verifyBill() {
  try {
    const { data: bill, error } = await supabase
      .from('bills')
      .select('*')
      .eq('congress', '119')
      .eq('bill_type', 's')
      .eq('bill_number', '300')
      .single();

    if (error) {
      throw error;
    }

    console.log('\nBill Status:');
    console.log('------------');
    console.log('Has full text:', bill.has_full_text);
    console.log('Text source:', bill.text_source);
    console.log('Text length:', bill.full_text?.length || 0);
    
    if (bill.full_text) {
      console.log('\nFirst 500 characters:');
      console.log('-------------------');
      console.log(bill.full_text.substring(0, 500));
    }

  } catch (error) {
    console.error("Error verifying bill:", error);
  }
}

// Run the verification
verifyBill().catch(console.error); 