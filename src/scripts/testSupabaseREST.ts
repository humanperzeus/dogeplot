import { config } from 'dotenv';
import fetch from 'node-fetch';

async function testSupabaseREST() {
  console.log('=== Testing Supabase REST API ===');
  
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
  
  try {
    // Test fetching a single bill
    console.log('\nFetching a single bill...');
    
    const billsUrl = `${SUPABASE_URL}/rest/v1/bills?limit=1`;
    console.log(`URL: ${billsUrl}`);
    
    const response = await fetch(billsUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`❌ Error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Response:', errorText);
      process.exit(1);
    }
    
    const data = await response.json();
    console.log('✅ Successfully fetched bill:');
    console.log(JSON.stringify(data, null, 2));
    
    // Test fetching bill embeddings
    console.log('\nFetching a single bill embedding...');
    
    const embeddingsUrl = `${SUPABASE_URL}/rest/v1/bill_embeddings?limit=1`;
    console.log(`URL: ${embeddingsUrl}`);
    
    const embeddingsResponse = await fetch(embeddingsUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!embeddingsResponse.ok) {
      console.error(`❌ Error: ${embeddingsResponse.status} ${embeddingsResponse.statusText}`);
      const errorText = await embeddingsResponse.text();
      console.error('Response:', errorText);
    } else {
      const embeddingsData = await embeddingsResponse.json();
      console.log('✅ Successfully fetched bill embedding:');
      console.log(JSON.stringify({
        id: embeddingsData[0].id,
        embedding_model: embeddingsData[0].embedding_model,
        embedding_version: embeddingsData[0].embedding_version,
        embedding_length: embeddingsData[0].embedding?.length || 0
      }, null, 2));
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error testing Supabase REST API:', errorMessage);
    
    if (error instanceof Error) {
      console.error('Error details:', error);
    }
  }
}

testSupabaseREST().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 