import { config } from 'dotenv';
import fetch from 'node-fetch';
import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Constants
const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const GEMINI_EMBEDDING_MODEL = 'embedding-004';
const MAX_TEXT_LENGTH = 8000; // Limit text length for embeddings
const EMBEDDING_VERSION = 1;
const API_CALL_DELAY = 1000; // Delay between API calls
const DEFAULT_CONCURRENCY = Math.max(1, os.cpus().length - 1); // Default to number of CPU cores minus 1

// Type definitions
interface BillEmbedding {
  id: string;
  embedding?: number[];
  embedding_model?: string;
  embedding_version?: number;
  text_processed?: string;
  similarity_threshold?: number;
  match_count?: number;
  updated_at?: string;
}

interface Bill {
  id: string;
  bill_number?: string;
  congress?: string;
  title?: string;
  full_text?: string;
  has_full_text?: boolean;
}

// Define Gemini API response type
interface GeminiEmbeddingResponse {
  embedding: {
    values: number[];
  };
}

// Command line options
interface Options {
  limit?: number;
  offset?: number;
  concurrency: number;
  force: boolean;
  threshold: string;
  matchCount: string;
  production: boolean;
  staging: boolean;
  verbose: boolean;
  env: string;
  provider: 'openai' | 'gemini';
}

// Parse command-line arguments
const program = new Command();
program
  .option('--limit <number>', 'Number of bills to process')
  .option('--offset <number>', 'Offset for bills to process', '0')
  .option('--concurrency <number>', 'Number of concurrent requests', String(DEFAULT_CONCURRENCY))
  .option('--staging', 'Use staging environment')
  .option('--production', 'Use production environment')
  .option('--force', 'Force regeneration of embeddings even if they already exist')
  .option('--threshold <number>', 'Similarity threshold for search (0-1)', '0.7')
  .option('--match-count <number>', 'Number of results to return in searches', '5')
  .option('--verbose', 'Enable verbose logging')
  .option('--provider <string>', 'Embedding provider (openai or gemini)', 'openai')
  .parse(process.argv);

const options: Options = {
  limit: program.opts().limit ? parseInt(program.opts().limit) : undefined,
  offset: parseInt(program.opts().offset),
  concurrency: parseInt(program.opts().concurrency),
  force: program.opts().force || false,
  threshold: program.opts().threshold,
  matchCount: program.opts().matchCount,
  production: program.opts().production || false,
  staging: program.opts().staging || true,
  verbose: program.opts().verbose || false,
  env: program.opts().production ? 'production' : 'staging',
  provider: (program.opts().provider === 'gemini' ? 'gemini' : 'openai') as 'openai' | 'gemini'
};

// Global variables
const DEFAULT_SAFETY_THRESHOLD = 0.7;
const DEFAULT_MATCH_COUNT = 5;
let supabaseUrl: string = '';
let supabaseKey: string = '';
let openaiApiKey: string = '';
let geminiApiKey: string = '';
let similarityThreshold: number = DEFAULT_SAFETY_THRESHOLD;
let matchCount: number = DEFAULT_MATCH_COUNT;

// Stats tracking
const stats = {
  total: 0,
  processed: 0,
  successful: 0,
  failed: 0,
  inProgress: 0,
  lastDisplayUpdate: 0 // Track last update time
};

// Load environment variables
const loadEnv = () => {
  try {
    // First try loading from explicit environment file
    const envFile = `.env.${options.env}`;
    if (fs.existsSync(envFile)) {
      config({ path: envFile });
      console.log(`Loaded environment from ${envFile}`);
    } else {
      // Otherwise just load from any .env file
      config();
      console.log(`Loaded environment from .env file`);
    }

    // Get environment variables
    supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    openaiApiKey = process.env.OPENAI_API_KEY || '';
    geminiApiKey = process.env.GEMINI_API_KEY || '';
    
    similarityThreshold = parseFloat(options.threshold);
    matchCount = parseInt(options.matchCount);
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    if (options.provider === 'openai' && !openaiApiKey) {
      throw new Error('Missing OpenAI API key');
    }
    
    if (options.provider === 'gemini' && !geminiApiKey) {
      throw new Error('Missing Gemini API key');
    }
    
    console.log('Environment variables:');
    console.log(`- Supabase URL: ${supabaseUrl ? '✅' : '❌'}`);
    console.log(`- Supabase Service Key: ${supabaseKey ? '✅' : '❌'}`);
    
    if (options.provider === 'openai') {
      console.log(`- OpenAI API Key: ${openaiApiKey ? '✅' : '❌'}`);
    } else if (options.provider === 'gemini') {
      console.log(`- Gemini API Key: ${geminiApiKey ? '✅' : '❌'}`);
    }
    
  } catch (error) {
    console.error('Error loading environment variables:', error);
    process.exit(1);
  }
};

// Function to count total bills and embeddings in the database
async function countRecords(): Promise<{ totalBills: number, totalEmbeddings: number }> {
  console.log('Counting records in database...');
  
  try {
    // Count bills
    const billsCountResponse = await fetch(`${supabaseUrl}/rest/v1/bills?select=count`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'count=exact'
      }
    });
    
    if (!billsCountResponse.ok) {
      throw new Error(`Failed to count bills: ${billsCountResponse.status} ${billsCountResponse.statusText}`);
    }
    
    const billsCount = parseInt(billsCountResponse.headers.get('content-range')?.split('/')[1] || '0');
    
    // Count embeddings
    const embeddingsCountResponse = await fetch(`${supabaseUrl}/rest/v1/bill_embeddings?select=count`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'count=exact'
      }
    });
    
    if (!embeddingsCountResponse.ok) {
      throw new Error(`Failed to count embeddings: ${embeddingsCountResponse.status} ${embeddingsCountResponse.statusText}`);
    }
    
    const embeddingsCount = parseInt(embeddingsCountResponse.headers.get('content-range')?.split('/')[1] || '0');
    
    console.log(`Total bills in database: ${billsCount}`);
    console.log(`Total embeddings in database: ${embeddingsCount}`);
    console.log(`Bills without embeddings: ${billsCount - embeddingsCount}`);
    
    return { totalBills: billsCount, totalEmbeddings: embeddingsCount };
  } catch (error) {
    console.error('Error counting records:', error);
    return { totalBills: 0, totalEmbeddings: 0 };
  }
}

// Simpler approach to fetch bills without embeddings
async function fetchBillsWithoutEmbeddings(limit?: number, offset?: number): Promise<Bill[]> {
  console.log('Fetching bills without embeddings...');
  console.log(`limit: ${limit || 'none'}, offset: ${offset || 0}`);
  
  try {
    // Use a different approach for Supabase - get bills that don't have embeddings
    // This query uses a left join and WHERE clause with IS NULL to find bills without embeddings
    
    // Build the query carefully
    let apiUrl = `${supabaseUrl}/rest/v1/rpc/get_bills_without_embeddings`;
    
    // Create body for the RPC call
    const body = {
      p_limit: limit || null,
      p_offset: offset || 0
    };
    
    console.log(`Using RPC endpoint: ${apiUrl}`);
    console.log(`With params: ${JSON.stringify(body)}`);
    
    // First try to create the function if it doesn't exist
    await createBillsWithoutEmbeddingsFunction();
    
    // Call the RPC function
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch bills without embeddings via RPC: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const bills = await response.json() as Bill[];
    console.log(`Fetched ${bills.length} bills without embeddings`);
    
    return bills;
  } catch (error) {
    console.error('Error fetching bills without embeddings:', error);
    
    // Fallback to the original method if the NOT IN approach fails
    console.log('Falling back to pagination method...');
    return fetchBillsForEmbeddingsFallback(limit, offset);
  }
}

// Helper function to create the SQL function in Supabase
async function createBillsWithoutEmbeddingsFunction(): Promise<void> {
  const sql = `
  CREATE OR REPLACE FUNCTION get_bills_without_embeddings(p_limit integer DEFAULT NULL, p_offset integer DEFAULT 0)
  RETURNS SETOF bills
  LANGUAGE sql
  SECURITY DEFINER
  AS $$
    SELECT b.*
    FROM bills b
    LEFT JOIN bill_embeddings e ON b.id = e.id
    WHERE e.id IS NULL AND b.has_full_text = true
    ORDER BY b.updated_at DESC
    LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit END
    OFFSET p_offset;
  $$;
  `;
  
  try {
    console.log('Creating/updating RPC function for fetching bills without embeddings...');
    
    const response = await fetch(`${supabaseUrl}/rest/v1/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        query: sql
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to create function: ${response.status} ${errorText}`);
      // We'll continue anyway and fall back to the manual approach if needed
    } else {
      console.log('Successfully created RPC function');
    }
  } catch (error) {
    console.error('Error creating RPC function:', error);
    // Continue anyway
  }
}

// Fallback function that uses pagination and manual filtering
async function fetchBillsForEmbeddingsFallback(limit?: number, offset?: number): Promise<Bill[]> {
  console.log('Using fallback method to fetch bills without embeddings...');
  
  // Set a reasonable batch size for processing
  const batchSize = 100;
  let allBills: Bill[] = [];
  let currentOffset = offset || 0;
  let hasMore = true;
  const targetLimit = limit || 1000000; // Large number if no limit specified
  
  // First, get all existing embedding IDs - more efficient to get these once
  console.log('Fetching all existing embedding IDs...');
  const existingIds = new Set<string>();
  let embeddingOffset = 0;
  let hasMoreEmbeddings = true;
  
  while (hasMoreEmbeddings) {
    const embeddingsUrl = `${supabaseUrl}/rest/v1/bill_embeddings?select=id&limit=1000&offset=${embeddingOffset}`;
    const embeddingsResponse = await fetch(embeddingsUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (!embeddingsResponse.ok) {
      console.error(`Failed to fetch embedding IDs: ${embeddingsResponse.status}`);
      break;
    }
    
    const embeddings = await embeddingsResponse.json() as { id: string }[];
    if (embeddings.length === 0) {
      hasMoreEmbeddings = false;
    } else {
      embeddings.forEach(e => existingIds.add(e.id));
      embeddingOffset += embeddings.length;
      console.log(`Fetched ${existingIds.size} embedding IDs so far...`);
    }
  }
  
  console.log(`Total existing embeddings: ${existingIds.size}`);
  
  // Now fetch bills in batches and filter out those that already have embeddings
  while (hasMore && allBills.length < targetLimit) {
    const billsUrl = `${supabaseUrl}/rest/v1/bills?select=id,bill_number,congress,title,full_text&has_full_text=eq.true&limit=${batchSize}&offset=${currentOffset}`;
    const billsResponse = await fetch(billsUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (!billsResponse.ok) {
      console.error(`Failed to fetch bills: ${billsResponse.status}`);
      break;
    }
    
    const bills = await billsResponse.json() as Bill[];
    if (bills.length === 0) {
      hasMore = false;
    } else {
      // Filter out bills that already have embeddings
      const filteredBills = bills.filter(bill => !existingIds.has(bill.id));
      allBills = allBills.concat(filteredBills);
      currentOffset += bills.length;
      
      console.log(`Batch: ${bills.length} bills, ${filteredBills.length} need embeddings. Total: ${allBills.length} bills without embeddings so far.`);
      
      // If we got fewer bills than requested, we've reached the end
      if (bills.length < batchSize) {
        hasMore = false;
      }
      
      // If we've reached the requested limit, stop
      if (allBills.length >= targetLimit) {
        allBills = allBills.slice(0, targetLimit);
        break;
      }
    }
  }
  
  return allBills;
}

// Function to clean and prepare bill text for embedding
function prepareTextForEmbedding(text: string): string {
  if (!text) return '';
  
  // Remove excessive whitespace and normalize
  let cleanedText = text.replace(/\s+/g, ' ').trim();
  
  // Limit text length to prevent token limit issues
  if (cleanedText.length > MAX_TEXT_LENGTH) {
    cleanedText = cleanedText.substring(0, MAX_TEXT_LENGTH);
  }
  
  return cleanedText;
}

// Function to generate OpenAI embedding
async function generateOpenAIEmbedding(text: string, verbose: boolean = false): Promise<number[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input: text
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }
    
    const responseData = await response.json();
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY));
    
    return responseData.data[0].embedding;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\nOpenAI embedding error: ${errorMessage}`);
    
    // Retry with shorter text if it's too long
    if (text.length > 4000) {
      const shorterText = text.substring(0, 4000);
      return generateOpenAIEmbedding(shorterText, verbose);
    }
    
    throw error;
  }
}

// Function to generate Gemini embedding
async function generateGeminiEmbedding(text: string, verbose: boolean = false): Promise<number[]> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: {
          parts: [
            { text: text }
          ]
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }
    
    const responseData = await response.json() as GeminiEmbeddingResponse;
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY));
    
    return responseData.embedding.values;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\nGemini embedding error: ${errorMessage}`);
    
    // Retry with shorter text if it's too long
    if (text.length > 4000) {
      const shorterText = text.substring(0, 4000);
      return generateGeminiEmbedding(shorterText, verbose);
    }
    
    throw error;
  }
}

// Function to generate embedding based on provider
async function generateEmbedding(text: string, verbose: boolean = false): Promise<number[]> {
  if (options.provider === 'openai') {
    return generateOpenAIEmbedding(text, verbose);
  } else if (options.provider === 'gemini') {
    return generateGeminiEmbedding(text, verbose);
  } else {
    throw new Error(`Unknown provider: ${options.provider}`);
  }
}

// Function to save embedding to Supabase
async function saveEmbedding(embeddingObject: BillEmbedding, verbose: boolean = false): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/bill_embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(embeddingObject)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to save embedding: ${response.status} ${errorText}`);
  }
}

// Function to process a single bill
async function processBill(bill: Bill, verbose: boolean = false): Promise<void> {
  try {
    stats.inProgress++;
    
    // Only update display for first few bills and then periodically
    if (stats.processed < 5 || stats.processed % 10 === 0) {
      updateDisplay();
    }
    
    const billId = bill.bill_number || bill.id;
    
    // Skip if no text
    if (!bill.full_text) {
      stats.failed++;
      return;
    }
    
    // Process text
    const processedText = prepareTextForEmbedding(bill.full_text);
    
    // Generate embedding
    const embedding = await generateEmbedding(processedText, false); // Always disable verbose for embedding
    
    // Create embedding object
    const embeddingObject: BillEmbedding = {
      id: bill.id,
      embedding: embedding,
      embedding_model: options.provider === 'openai' ? OPENAI_EMBEDDING_MODEL : GEMINI_EMBEDDING_MODEL,
      embedding_version: EMBEDDING_VERSION,
      text_processed: processedText.substring(0, 1000), // Store a sample of processed text
      similarity_threshold: similarityThreshold,
      match_count: matchCount,
      updated_at: new Date().toISOString()
    };
    
    // Save embedding
    await saveEmbedding(embeddingObject, false); // Always disable verbose for saving
    
    stats.successful++;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\nError processing bill ${bill.bill_number || bill.id}: ${errorMessage}`);
    stats.failed++;
  } finally {
    stats.processed++;
    stats.inProgress--;
    
    // Only update display periodically to avoid excessive refreshing
    if (stats.processed % 5 === 0 || stats.processed === stats.total) {
      updateDisplay();
    }
  }
}

// Function to process bills in parallel
async function processBillsInParallel(bills: Bill[]): Promise<void> {
  stats.total = bills.length;
  
  // Create a queue of bills to process
  const queue = [...bills];
  
  // Initial display
  updateDisplay();
  
  // Process queue with concurrency limit
  const runQueue = async () => {
    while (queue.length > 0) {
      if (stats.inProgress < options.concurrency) {
        const bill = queue.shift();
        if (bill) {
          // Process bill without awaiting to allow concurrency
          processBill(bill, options.verbose).catch(error => {
            console.error(`\nError in processBill: ${error}`);
          });
        }
      } else {
        // Wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Update display while waiting
        updateDisplay();
      }
    }
  };
  
  // Start the queue
  await runQueue();
  
  // Wait for all in-progress tasks to complete
  while (stats.inProgress > 0) {
    await new Promise(resolve => setTimeout(resolve, 100));
    updateDisplay();
  }
  
  // Final update
  updateDisplay();
}

// Update display with progress information - minimal version to prevent scrolling
function updateDisplay(): void {
  // Only update display every 500ms to reduce flickering
  const now = Date.now();
  if (now - stats.lastDisplayUpdate < 500 && stats.processed < stats.total) {
    return;
  }
  stats.lastDisplayUpdate = now;

  // Clear line and move cursor to beginning
  process.stdout.write('\r\x1b[K');
  
  // Calculate progress percentage
  const progress = stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;
  
  // Super minimal display
  process.stdout.write(
    `Progress: ${progress}% (${stats.processed}/${stats.total}) | ` +
    `Success: ${stats.successful} | Failed: ${stats.failed} | Active: ${stats.inProgress}`
  );
}

// Main function
async function main() {
  try {
    console.log('\n=== Parallel Embedding Generation ===');
    console.log(`Using ${options.concurrency} concurrent requests`);
    console.log(`Provider: ${options.provider.toUpperCase()}`);
    console.log(`Environment: ${options.env.toUpperCase()}`);
    
    // Load environment variables
    loadEnv();
    
    // First, get the count of records to understand the scope
    await countRecords();
    
    // Create the SQL function for efficient querying
    await createBillsWithoutEmbeddingsFunction();
    
    // Now fetch bills that need embeddings using the more efficient approach
    let billsToProcess;
    if (options.force) {
      // If forcing, use the original function to get all bills
      billsToProcess = await fetchBillsForEmbeddingsFallback(options.limit, options.offset);
    } else {
      // Otherwise, use the more efficient approach
      billsToProcess = await fetchBillsWithoutEmbeddings(options.limit, options.offset);
    }
    
    if (billsToProcess.length === 0) {
      console.log('No bills to process. Exiting.');
      return;
    }
    
    console.log(`Processing ${billsToProcess.length} bills with ${options.concurrency} concurrent requests`);
    console.log(); // Add an empty line before progress bar
    
    // Disable verbose mode regardless of command line option
    options.verbose = false;
    
    // Process bills in parallel
    await processBillsInParallel(billsToProcess);
    
    // Move to a new line after progress display
    console.log('\n');
    
    // Calculate total cost
    const totalTokens = billsToProcess.reduce((total, bill) => {
      if (bill.full_text) {
        return total + (bill.full_text.length / 4); // Rough estimate of tokens
      }
      return total;
    }, 0);
    
    // Print summary
    console.log('=== Embedding Generation Complete ===');
    console.log(`Total Bills Processed: ${billsToProcess.length}`);
    console.log(`Successfully Processed: ${stats.successful}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Provider: ${options.provider.toUpperCase()}`);
    console.log(`Embedding Model: ${options.provider === 'openai' ? OPENAI_EMBEDDING_MODEL : GEMINI_EMBEDDING_MODEL}`);
    console.log(`Estimated Total Tokens: ${Math.round(totalTokens).toLocaleString()}`);
    
    // Estimate cost based on provider
    if (options.provider === 'openai') {
      console.log(`Approximate Cost: $${(totalTokens / 1000 * 0.0001).toFixed(4)}`);
    } else { // gemini
      console.log(`Approximate Cost: $${(totalTokens / 1000 * 0.00002).toFixed(4)}`); // Lower cost for Gemini
    }
    
    // Get final counts to confirm progress
    await countRecords();
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 