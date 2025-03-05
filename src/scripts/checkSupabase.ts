import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

async function checkSupabaseConnection() {
  console.log('=== Checking Supabase Connection ===');
  
  // Load environment variables
  config({ path: '.env.production' });
  
  // Get Supabase credentials
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log('Environment variables:');
  console.log('- VITE_SUPABASE_URL:', SUPABASE_URL ? '✅ Found' : '❌ Missing');
  console.log('- SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_KEY ? '✅ Found' : '❌ Missing');
  
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Error: Missing Supabase credentials');
    process.exit(1);
  }
  
  console.log(`\nTrying to connect to Supabase: ${SUPABASE_URL}`);
  
  try {
    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Test connection by fetching a single row from bills table
    console.log('Testing connection by fetching a single bill...');
    const { data, error } = await supabase
      .from('bills')
      .select('id, bill_number')
      .limit(1);
    
    if (error) {
      console.error('❌ Connection test failed:', error.message);
      process.exit(1);
    }
    
    console.log('✅ Connection successful!');
    console.log('Data received:', data);
    
    // Check bill_embeddings table
    console.log('\nChecking bill_embeddings table...');
    const { data: embeddingsData, error: embeddingsError } = await supabase
      .from('bill_embeddings')
      .select('id')
      .limit(1);
    
    if (embeddingsError) {
      console.error('❌ Error accessing bill_embeddings table:', embeddingsError.message);
    } else {
      console.log('✅ bill_embeddings table accessible');
      console.log('Sample embedding ID:', embeddingsData[0]?.id || 'No embeddings found');
    }
    
    // Count bills and embeddings
    console.log('\nCounting bills and embeddings...');
    
    const { count: billCount, error: billCountError } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true });
    
    if (billCountError) {
      console.error('❌ Error counting bills:', billCountError.message);
    } else {
      console.log(`Total bills: ${billCount}`);
    }
    
    const { count: embeddingCount, error: embeddingCountError } = await supabase
      .from('bill_embeddings')
      .select('*', { count: 'exact', head: true });
    
    if (embeddingCountError) {
      console.error('❌ Error counting embeddings:', embeddingCountError.message);
    } else {
      console.log(`Total embeddings: ${embeddingCount}`);
      if (billCount) {
        console.log(`Embedding coverage: ${((embeddingCount / billCount) * 100).toFixed(2)}%`);
      }
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error connecting to Supabase:', errorMessage);
    process.exit(1);
  }
}

checkSupabaseConnection().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 