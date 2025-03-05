import { createClient } from '@supabase/supabase-js';
import './loadEnv.js';
import { analyzeBill } from '../services/aiAnalysis.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Supabase credentials not found in environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Parse command line arguments
const args = process.argv.slice(2);
const forceReanalyze = args.includes('--force') || args.includes('-f');

async function main() {
  try {
    // Modify query based on force flag
    let query = supabase
      .from('bills')
      .select('id, bill_type, bill_number, full_text, analysis_status')
      .not('full_text', 'is', null);
    
    // Only filter by status if not forcing reanalysis
    if (!forceReanalyze) {
      query = query.in('analysis_status', ['pending', 'failed']);
    }

    const { data: bills, error } = await query;

    if (error) throw error;

    console.log(`Mode: ${forceReanalyze ? 'Force reanalyze all bills' : 'Analyze pending/failed bills only'}`);
    console.log('Bills to analyze:', bills.map(b => ({
      id: b.id,
      bill: `${b.bill_type}${b.bill_number}`,
      status: b.analysis_status
    })));

    if (bills && bills.length > 0) {
      console.log(`\nStarting analysis of ${bills.length} bills...`);
      
      let successCount = 0;
      let failureCount = 0;
      
      // Process bills sequentially to avoid rate limits
      for (const bill of bills) {
        try {
          console.log(`\nAnalyzing bill ${bill.bill_type}${bill.bill_number} (current status: ${bill.analysis_status})...`);
          await analyzeBill(bill.id, bill.full_text!);
          console.log(`✓ Successfully analyzed bill ${bill.bill_type}${bill.bill_number}`);
          successCount++;
          
          // Add a small delay between requests to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`✗ Error analyzing bill ${bill.bill_type}${bill.bill_number}:`, error);
          failureCount++;
          // Continue with next bill even if one fails
          continue;
        }
      }
      
      console.log('\nAnalysis process completed:');
      console.log(`- Successfully analyzed: ${successCount} bills`);
      console.log(`- Failed to analyze: ${failureCount} bills`);
    } else {
      console.log('\nNo bills found needing analysis');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main(); 