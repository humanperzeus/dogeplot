import { config } from 'dotenv';
import { Command } from 'commander';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import { performance } from 'perf_hooks';

// Constants
const EMBEDDING_MODEL = 'text-embedding-3-small';
const TEST_LIMIT = 3; // Number of bills to test with
const API_CALL_DELAY = 1000; // Delay between API calls in ms

// Type definitions
interface Bill {
  id: string;
  bill_number?: string;
  congress?: string;
  title?: string;
  full_text?: string;
}

interface TestResult {
  method: string;
  billId: string;
  billNumber: string;
  success: boolean;
  error?: string;
  duration: number; // in milliseconds
  embeddingLength?: number;
}

// Function to clean and prepare bill text for embedding
function prepareTextForEmbedding(text: string): string {
  if (!text) return '';
  
  // Remove excessive whitespace and normalize
  let cleanedText = text.replace(/\s+/g, ' ').trim();
  
  // Limit text length to prevent token limit issues
  if (cleanedText.length > 8000) {
    cleanedText = cleanedText.substring(0, 8000);
  }
  
  return cleanedText;
}

// Function to generate embedding using OpenAI
async function generateEmbedding(openai: OpenAI, text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  
  // Add delay to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY));
  
  return response.data[0].embedding;
}

// Test Supabase client method
async function testSupabaseClientMethod(
  supabase: SupabaseClient,
  openai: OpenAI,
  bill: Bill
): Promise<TestResult> {
  const startTime = performance.now();
  let result: TestResult = {
    method: 'Supabase Client',
    billId: bill.id,
    billNumber: bill.bill_number || 'unknown',
    success: false,
    duration: 0
  };
  
  try {
    // Process text
    const processedText = prepareTextForEmbedding(bill.full_text || '');
    if (!processedText) {
      throw new Error('No text to process');
    }
    
    // Generate embedding
    const embedding = await generateEmbedding(openai, processedText);
    
    // Save embedding using Supabase client
    const { error } = await supabase
      .from('bill_embeddings')
      .upsert({
        id: bill.id,
        embedding: embedding,
        embedding_model: EMBEDDING_MODEL,
        embedding_version: 1,
        text_processed: processedText.substring(0, 1000),
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }
    
    result.success = true;
    result.embeddingLength = embedding.length;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  
  result.duration = performance.now() - startTime;
  return result;
}

// Test REST API method
async function testRestApiMethod(
  supabaseUrl: string,
  supabaseKey: string,
  openai: OpenAI,
  bill: Bill
): Promise<TestResult> {
  const startTime = performance.now();
  let result: TestResult = {
    method: 'REST API',
    billId: bill.id,
    billNumber: bill.bill_number || 'unknown',
    success: false,
    duration: 0
  };
  
  try {
    // Process text
    const processedText = prepareTextForEmbedding(bill.full_text || '');
    if (!processedText) {
      throw new Error('No text to process');
    }
    
    // Generate embedding
    const embedding = await generateEmbedding(openai, processedText);
    
    // Save embedding using REST API
    const saveUrl = `${supabaseUrl}/rest/v1/bill_embeddings`;
    const saveResponse = await fetch(saveUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id: bill.id,
        embedding: embedding,
        embedding_model: EMBEDDING_MODEL,
        embedding_version: 1,
        text_processed: processedText.substring(0, 1000),
        updated_at: new Date().toISOString()
      })
    });
    
    if (!saveResponse.ok) {
      const errorText = await saveResponse.text();
      throw new Error(`REST API error: ${saveResponse.status} ${saveResponse.statusText} - ${errorText}`);
    }
    
    result.success = true;
    result.embeddingLength = embedding.length;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  
  result.duration = performance.now() - startTime;
  return result;
}

// Main function to run tests
async function runTests(options: {
  production?: boolean;
  staging?: boolean;
  verbose?: boolean;
}) {
  console.log('\n=== Testing Embedding Methods ===\n');
  
  const verbose = options.verbose || false;
  
  // Determine environment
  const mode = options.production ? 'production' : 'staging';
  console.log(`🌍 Using ${mode.toUpperCase()} environment`);
  
  // Load environment variables
  config({ path: `.env.${mode}` });
  
  // Get credentials
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  console.log('Environment variables:');
  console.log('- VITE_SUPABASE_URL:', SUPABASE_URL ? '✅ Found' : '❌ Missing');
  console.log('- SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_KEY ? '✅ Found' : '❌ Missing');
  console.log('- OPENAI_API_KEY:', OPENAI_API_KEY ? '✅ Found' : '❌ Missing');
  
  if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_API_KEY) {
    console.error('Error: Missing required credentials');
    process.exit(1);
  }
  
  try {
    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Fetch test bills
    console.log(`\nFetching ${TEST_LIMIT} bills for testing...`);
    
    // Method 1: Using Supabase client
    const { data: clientBills, error: clientError } = await supabase
      .from('bills')
      .select('id, bill_number, congress, title, full_text')
      .eq('has_full_text', true)
      .limit(TEST_LIMIT);
    
    if (clientError) {
      console.error(`❌ Error fetching bills with Supabase client: ${clientError.message}`);
      process.exit(1);
    }
    
    if (!clientBills || clientBills.length === 0) {
      console.error('❌ No bills found with Supabase client');
      process.exit(1);
    }
    
    // Method 2: Using REST API
    const billsUrl = `${SUPABASE_URL}/rest/v1/bills?select=id,bill_number,congress,title,full_text&has_full_text=eq.true&full_text=not.is.null&limit=${TEST_LIMIT}`;
    const billsResponse = await fetch(billsUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!billsResponse.ok) {
      console.error(`❌ Error fetching bills with REST API: ${billsResponse.status} ${billsResponse.statusText}`);
      process.exit(1);
    }
    
    const restBills = await billsResponse.json() as Bill[];
    
    if (!restBills || restBills.length === 0) {
      console.error('❌ No bills found with REST API');
      process.exit(1);
    }
    
    // Verify we got the same bills with both methods
    const clientBillIds = clientBills.map(bill => bill.id).sort();
    const restBillIds = restBills.map(bill => bill.id).sort();
    
    const billsMatch = JSON.stringify(clientBillIds) === JSON.stringify(restBillIds);
    console.log(`Bills fetched with both methods ${billsMatch ? 'match ✅' : 'do not match ❌'}`);
    
    // Use client bills for testing both methods
    const testBills = clientBills as Bill[];
    
    console.log(`\nTesting with ${testBills.length} bills:`);
    testBills.forEach((bill, index) => {
      console.log(`${index + 1}. ${bill.bill_number || bill.id} - ${bill.title?.substring(0, 50)}...`);
    });
    
    // Run tests
    console.log('\n=== Running Tests ===\n');
    
    const results: TestResult[] = [];
    
    for (const bill of testBills) {
      console.log(`\nTesting bill: ${bill.bill_number || bill.id}`);
      
      // Test Supabase client method
      console.log('  • Testing Supabase client method...');
      const clientResult = await testSupabaseClientMethod(supabase, openai, bill);
      results.push(clientResult);
      
      console.log(`    ${clientResult.success ? '✅ Success' : '❌ Failed'}: ${Math.round(clientResult.duration)}ms`);
      if (clientResult.error && verbose) {
        console.log(`    Error: ${clientResult.error}`);
      }
      
      // Test REST API method
      console.log('  • Testing REST API method...');
      const restResult = await testRestApiMethod(SUPABASE_URL, SUPABASE_KEY, openai, bill);
      results.push(restResult);
      
      console.log(`    ${restResult.success ? '✅ Success' : '❌ Failed'}: ${Math.round(restResult.duration)}ms`);
      if (restResult.error && verbose) {
        console.log(`    Error: ${restResult.error}`);
      }
      
      // Add a delay between bills
      if (testBills.indexOf(bill) < testBills.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Analyze results
    console.log('\n=== Test Results ===\n');
    
    const clientResults = results.filter(r => r.method === 'Supabase Client');
    const restResults = results.filter(r => r.method === 'REST API');
    
    const clientSuccessRate = (clientResults.filter(r => r.success).length / clientResults.length) * 100;
    const restSuccessRate = (restResults.filter(r => r.success).length / restResults.length) * 100;
    
    const clientAvgDuration = clientResults.reduce((sum, r) => sum + r.duration, 0) / clientResults.length;
    const restAvgDuration = restResults.reduce((sum, r) => sum + r.duration, 0) / restResults.length;
    
    console.log('Supabase Client Method:');
    console.log(`  • Success Rate: ${clientSuccessRate.toFixed(1)}%`);
    console.log(`  • Average Duration: ${Math.round(clientAvgDuration)}ms`);
    console.log(`  • Successful: ${clientResults.filter(r => r.success).length}/${clientResults.length}`);
    
    console.log('\nREST API Method:');
    console.log(`  • Success Rate: ${restSuccessRate.toFixed(1)}%`);
    console.log(`  • Average Duration: ${Math.round(restAvgDuration)}ms`);
    console.log(`  • Successful: ${restResults.filter(r => r.success).length}/${restResults.length}`);
    
    // Determine winner
    console.log('\n=== Conclusion ===\n');
    
    if (clientSuccessRate > restSuccessRate) {
      console.log('🏆 Supabase Client method is more reliable');
    } else if (restSuccessRate > clientSuccessRate) {
      console.log('🏆 REST API method is more reliable');
    } else {
      console.log('🤝 Both methods have equal reliability');
      
      if (clientAvgDuration < restAvgDuration) {
        console.log('⚡ Supabase Client method is faster');
      } else if (restAvgDuration < clientAvgDuration) {
        console.log('⚡ REST API method is faster');
      } else {
        console.log('⏱️ Both methods have similar performance');
      }
    }
    
    console.log('\nRecommendation:');
    if (clientSuccessRate >= restSuccessRate && clientAvgDuration <= restAvgDuration) {
      console.log('👉 Use the Supabase Client method');
    } else if (restSuccessRate >= clientSuccessRate && restAvgDuration <= clientAvgDuration) {
      console.log('👉 Use the REST API method');
    } else {
      if (clientSuccessRate > restSuccessRate) {
        console.log('👉 Use the Supabase Client method for better reliability');
      } else if (restAvgDuration < clientAvgDuration) {
        console.log('👉 Use the REST API method for better performance');
      } else {
        console.log('👉 Either method should work fine');
      }
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Error running tests: ${errorMessage}`);
    
    if (error instanceof Error) {
      console.error('Error details:', error);
    }
  }
}

async function main() {
  try {
    // Parse command-line arguments
    const program = new Command();
    program
      .option('--staging', 'Use staging environment')
      .option('--production', 'Use production environment')
      .option('--verbose', 'Enable verbose logging')
      .parse(process.argv);

    const options = program.opts();

    // Run tests
    await runTests({
      production: options.production,
      staging: options.staging,
      verbose: options.verbose
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error running script:', errorMessage);
    process.exit(1);
  }
}

main().catch(error => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error('Error running script:', errorMessage);
  process.exit(1);
}); 