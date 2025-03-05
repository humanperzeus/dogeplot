import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs';

async function testIndexPerformance() {
  console.log('=== Testing has_full_text Index Performance ===');
  
  // Determine environment
  const envFiles = ['.env.production', '.env.staging', '.env'];
  let envFile = null;
  
  for (const file of envFiles) {
    if (fs.existsSync(file)) {
      envFile = file;
      break;
    }
  }
  
  if (!envFile) {
    console.error('❌ No environment file found');
    process.exit(1);
  }
  
  console.log(`📂 Using environment file: ${envFile}`);
  
  // Load environment variables
  config({ path: envFile });
  
  // Get Supabase credentials
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }
  
  console.log(`📡 Connecting to Supabase: ${SUPABASE_URL}`);
  
  try {
    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Count total bills
    console.log('\n📊 Counting total bills...');
    const { count: totalBills, error: countError } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true });
      
    if (countError) {
      console.error('❌ Error counting bills:', countError.message);
      process.exit(1);
    }
    
    console.log(`📊 Total bills in database: ${totalBills}`);
    
    // Test 1: Filter bills with text (should use index)
    console.log('\n🧪 Test 1: Filter bills with text (should use index)');
    const withTextStart = Date.now();
    const { count: withTextCount, error: withTextError } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('has_full_text', true);
    const withTextDuration = Date.now() - withTextStart;
    
    if (withTextError) {
      console.error('❌ Error querying bills with text:', withTextError.message);
    } else {
      console.log(`✅ Query completed in ${withTextDuration}ms`);
      console.log(`📊 Found ${withTextCount} bills with text (${((withTextCount / totalBills) * 100).toFixed(2)}% of total)`);
    }
    
    // Test 2: Filter bills without text (should use index)
    console.log('\n🧪 Test 2: Filter bills without text (should use index)');
    const withoutTextStart = Date.now();
    const { count: withoutTextCount, error: withoutTextError } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('has_full_text', false);
    const withoutTextDuration = Date.now() - withoutTextStart;
    
    if (withoutTextError) {
      console.error('❌ Error querying bills without text:', withoutTextError.message);
    } else {
      console.log(`✅ Query completed in ${withoutTextDuration}ms`);
      console.log(`📊 Found ${withoutTextCount} bills without text (${((withoutTextCount / totalBills) * 100).toFixed(2)}% of total)`);
    }
    
    // Test 3: Get all bills (should not use index)
    console.log('\n🧪 Test 3: Get all bills (baseline, should not use index)');
    const allBillsStart = Date.now();
    const { data: allBills, error: allBillsError } = await supabase
      .from('bills')
      .select('id')
      .limit(10);
    const allBillsDuration = Date.now() - allBillsStart;
    
    if (allBillsError) {
      console.error('❌ Error querying all bills:', allBillsError.message);
    } else {
      console.log(`✅ Query completed in ${allBillsDuration}ms`);
    }
    
    // Performance summary
    console.log('\n📈 Performance Summary:');
    console.log(`Bills with text query: ${withTextDuration}ms`);
    console.log(`Bills without text query: ${withoutTextDuration}ms`);
    console.log(`Baseline query: ${allBillsDuration}ms`);
    
    if (withTextDuration < 500) {
      console.log('\n✅ GREAT SUCCESS! The index is working effectively.');
      console.log('Your "bills with text only" filter should now be significantly faster.');
    } else if (withTextDuration < 1000) {
      console.log('\n✅ SUCCESS! The index appears to be working.');
      console.log('Performance is improved but not optimal. You might want to analyze query execution plans.');
    } else {
      console.log('\n⚠️ The query is still taking longer than expected.');
      console.log('The index might not be being used effectively. Consider checking:');
      console.log('1. If the index was created correctly');
      console.log('2. If the query is written to use the index');
      console.log('3. The database statistics and query execution plan');
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error:', errorMessage);
    process.exit(1);
  }
}

// Execute the function
testIndexPerformance().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 