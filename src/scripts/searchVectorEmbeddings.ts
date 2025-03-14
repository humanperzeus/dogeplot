import { createClient } from '@supabase/supabase-js';
import { envLoader } from './loadEnv.ts';
import { Command } from 'commander';
import chalk from 'chalk';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Parse command line arguments
const program = new Command();
program
  .option('-q, --query <query>', 'Search query')
  .option('-s, --similar <billId>', 'Find bills similar to this bill ID (UUID)')
  .option('-b, --bill <billNumber>', 'Find bills similar to this bill number (e.g., hr1740, s123)')
  .option('-l, --limit <number>', 'Maximum number of results to return', '5')
  .option('-t, --threshold <number>', 'Similarity threshold (0-1)', '0.5')
  .option('-m, --model <string>', 'Embedding model to use', 'text-embedding-3-small')
  .option('-v, --version <number>', 'Embedding version to search', '1')
  .option('--modelFilter <string>', 'Filter results by specific embedding model')
  .option('--versionFilter <number>', 'Filter results by specific embedding version')
  .option('--staging', 'Use staging environment')
  .option('--production', 'Use production environment')
  .parse(process.argv);

const options = program.opts();

// Determine environment and load appropriate env variables
const mode = options.production ? 'production' : 'staging';
console.log(`Using ${mode.toUpperCase()} environment`);

// Try loading directly from .env.staging or .env.production
try {
  const envFile = `.env.${mode}`;
  console.log(`Loading environment from ${envFile}...`);
  
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
    console.log('Environment file loaded directly');
  } else {
    console.log(`${envFile} not found, trying envLoader`);
    
    try {
      // Try using envLoader
      await envLoader.load(mode);
      console.log('Environment loaded using envLoader');
    } catch (error) {
      console.error('Error loading environment with envLoader:', error);
    }
  }
} catch (error) {
  console.error('Error loading environment:', error);
}

// Get Supabase credentials from environment
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log('Environment variables:');
console.log('- SUPABASE_URL:', SUPABASE_URL ? '✅' : '❌');
console.log('- SUPABASE_KEY:', SUPABASE_KEY ? '✅' : '❌');
console.log('- OPENAI_API_KEY:', OPENAI_API_KEY ? '✅' : '❌');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(`Error: Missing Supabase credentials for ${mode} environment. Please check your .env.${mode} file.`);
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error(`Error: Missing OpenAI API key for ${mode} environment. Please add OPENAI_API_KEY to your .env.${mode} file.`);
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Validate options
if (!options.query && !options.similar && !options.bill) {
  console.error('Error: Please provide either a search query (-q, --query), a bill ID to find similar bills (-s, --similar), or a bill number (-b, --bill)');
  process.exit(1);
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: options.model,
    input: text,
  });

  return response.data[0].embedding;
}

async function searchBills(embedding: number[]): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc('search_bills_by_embedding', {
      input_embedding: embedding,
      input_match_threshold: parseFloat(options.threshold),
      input_match_count: parseInt(options.limit),
      input_model_filter: options.modelFilter || options.model,
      input_version_filter: options.versionFilter ? parseInt(options.versionFilter) : parseInt(options.version)
    });

    if (error) {
      console.error('Error searching bills:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception searching bills:', error);
    return [];
  }
}

async function searchSimilarBills(billId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc('find_similar_bills', {
      input_bill_id: billId,
      input_match_threshold: parseFloat(options.threshold),
      input_match_count: parseInt(options.limit),
      input_model_filter: options.modelFilter || options.model,
      input_version_filter: options.versionFilter ? parseInt(options.versionFilter) : parseInt(options.version)
    });

    if (error) {
      console.error('Error finding similar bills:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception finding similar bills:', error);
    return [];
  }
}

async function displayBillInfo(bill: any): Promise<void> {
  // Get the full bill text from the database to display a summary
  const { data, error } = await supabase
    .from('bills')
    .select('congress, bill_number, bill_type, title, summary, introduction_date')
    .eq('id', bill.id)
    .single();

  if (error) {
    console.error(`Error fetching details for bill ${bill.id}:`, error);
    return;
  }

  if (!data) {
    console.log(`No details found for bill ${bill.id}`);
    return;
  }

  console.log(chalk.green(`\n${data.congress} ${data.bill_type}${data.bill_number}: ${data.title}`));
  console.log(chalk.yellow(`Similarity score: ${bill.similarity.toFixed(4)}`));
  console.log(chalk.blue(`Introduced: ${new Date(data.introduction_date).toLocaleDateString()}`));
  console.log(chalk.gray(`Bill ID: ${bill.id}`));
  
  if (bill.embedding_model && bill.embedding_version) {
    console.log(chalk.cyan(`Embedding: ${bill.embedding_model} v${bill.embedding_version}`));
  }
  
  if (data.summary) {
    console.log(chalk.white('\nSummary:'));
    console.log(data.summary.substring(0, 300) + (data.summary.length > 300 ? '...' : ''));
  }
}

async function searchByQuery() {
  console.log(chalk.blue(`Searching for bills similar to: "${options.query}"`));
  console.log(chalk.gray(`Using embedding model: ${options.model} v${options.version}`));
  console.log(chalk.gray(`Similarity threshold: ${options.threshold}, Limit: ${options.limit} results`));

  // Generate embedding for the query
  console.log(chalk.gray('\nGenerating embedding for query...'));
  const embedding = await generateEmbedding(options.query);

  // Search bills by embedding
  console.log(chalk.gray('Searching bills in vector database...'));
  const results = await searchBills(embedding);

  if (results.length === 0) {
    console.log(chalk.yellow('\nNo bills found matching your query.'));
    return;
  }

  console.log(chalk.green(`\nFound ${results.length} matching bills:`));
  
  // Display results
  for (const bill of results) {
    await displayBillInfo(bill);
  }

  // If there's at least one result, offer to search for similar bills
  if (results.length > 0) {
    console.log(chalk.blue('\nTo find bills similar to one of these results, run:'));
    console.log(`npx tsx src/scripts/searchVectorEmbeddings.ts --similar ${results[0].id}`);
  }
}

async function searchBySimilarBill() {
  console.log(chalk.blue(`Searching for bills similar to bill ID: ${options.similar}`));
  console.log(chalk.gray(`Using embedding model: ${options.model} v${options.version}`));
  console.log(chalk.gray(`Similarity threshold: ${options.threshold}, Limit: ${options.limit} results`));

  // Search for similar bills
  console.log(chalk.gray('\nSearching for similar bills...'));
  const results = await searchSimilarBills(options.similar);

  if (results.length === 0) {
    console.log(chalk.yellow('\nNo similar bills found.'));
    return;
  }

  console.log(chalk.green(`\nFound ${results.length} similar bills:`));
  
  // Display results
  for (const bill of results) {
    await displayBillInfo(bill);
  }
}

// This function looks up a bill UUID based on bill number
async function getBillIdFromNumber(billNumber: string): Promise<string | null> {
  try {
    // Normalize the bill number
    let normalizedBillNumber = billNumber.toLowerCase().trim();
    
    // Handle various formats like "h.r. 1234", "hr1234", "s 123", etc.
    // Remove spaces, dots and extra characters
    normalizedBillNumber = normalizedBillNumber.replace(/\s+/g, '');
    normalizedBillNumber = normalizedBillNumber.replace(/\./g, '');
    
    // Separate the bill type and number
    let billType, billNumberOnly;
    
    // Common formats: hr1234, s123, hjres123, sconres123
    const typeMatch = normalizedBillNumber.match(/^([a-z]+)(\d+)$/);
    if (typeMatch) {
      billType = typeMatch[1];
      billNumberOnly = typeMatch[2];
    } else {
      console.error('Invalid bill number format. Examples of valid formats: hr1234, s123, hjres45');
      return null;
    }
    
    // Map common abbreviations to proper bill_type values
    const typeMap: {[key: string]: string} = {
      'hr': 'hr',
      'h': 'hr',
      's': 's',
      'hjres': 'hjres',
      'sjres': 'sjres',
      'hconres': 'hconres',
      'sconres': 'sconres',
      'hres': 'hres',
      'sres': 'sres'
    };
    
    if (!typeMap[billType]) {
      console.error(`Unknown bill type: ${billType}`);
      console.error('Valid bill types: hr, s, hjres, sjres, hconres, sconres, hres, sres');
      return null;
    }
    
    const mappedBillType = typeMap[billType];
    
    console.log(`Looking up bill: ${mappedBillType}${billNumberOnly}`);
    
    // Query the database for this bill
    const { data, error } = await supabase
      .from('bills')
      .select('id, bill_number, congress, title')
      .eq('bill_type', mappedBillType)
      .eq('bill_number', billNumberOnly)
      .order('congress', { ascending: false }) // Get most recent congress first
      .limit(1);
    
    if (error) {
      console.error('Error looking up bill:', error);
      return null;
    }
    
    if (!data || data.length === 0) {
      console.error(`No bill found matching ${mappedBillType}${billNumberOnly}`);
      return null;
    }
    
    // Display the bill we found
    console.log(`Found bill: ${data[0].congress} ${mappedBillType}${billNumberOnly}: ${data[0].title?.substring(0, 100)}...`);
    console.log(`Bill ID: ${data[0].id}`);
    
    return data[0].id;
  } catch (error) {
    console.error('Error in bill lookup:', error);
    return null;
  }
}

async function main() {
  if (options.query) {
    await searchByQuery();
  } else if (options.similar) {
    await searchBySimilarBill();
  } else if (options.bill) {
    // First look up the bill ID based on the bill number
    const billId = await getBillIdFromNumber(options.bill);
    if (billId) {
      // Now search for similar bills using the ID
      options.similar = billId;
      await searchBySimilarBill();
    }
  } else {
    console.error('Please provide either a search query (-q, --query), a bill ID to find similar bills (-s, --similar), or a bill number (-b, --bill)');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
}); 