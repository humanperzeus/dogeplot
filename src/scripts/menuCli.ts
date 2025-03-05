// Load environment variables first
import { envLoader } from './loadEnv.js';
import { config } from "dotenv";
import { createInterface } from 'readline';
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase.js";
import { filesize } from "filesize";
import axios from "axios";
import fs from 'fs';  // Change to synchronous fs
import fsPromises from 'fs/promises';  // Keep promises version for other uses
import path from 'path';
import { format } from 'date-fns';
import { execSync } from 'child_process';

// Import PDFExtract with type assertion
const { PDFExtract } = await import('pdf.js-extract') as { PDFExtract: any };

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

// Initialize environment
await envLoader.load();
const envConfig = envLoader.getCurrentConfig();

if (!envConfig) {
  throw new Error("Failed to load environment configuration");
}

const supabaseUrl = envConfig.variables.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = envConfig.variables.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Supabase URL or service role key not found in environment variables");
}

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const pdfExtract = new PDFExtract();

// Environment Manager for robust environment handling
class EnvironmentManager {
  private static instance: EnvironmentManager;
  private currentEnvironment: 'staging' | 'production' = 'staging';

  private constructor() {}

  static getInstance(): EnvironmentManager {
    if (!this.instance) {
      this.instance = new EnvironmentManager();
    }
    return this.instance;
  }

  getCurrentEnvironment(): 'staging' | 'production' {
    return this.currentEnvironment;
  }

  async switchEnvironment(env: 'staging' | 'production'): Promise<void> {
    this.currentEnvironment = env;
    await envLoader.clearConfig();
    await envLoader.load(env);
    
    const envConfig = envLoader.getCurrentConfig();
    if (!envConfig) {
      throw new Error(`Failed to load environment configuration for ${env}`);
    }
    
    // Reinitialize Supabase client with new environment
    const supabaseUrl = envConfig.variables.VITE_SUPABASE_URL;
    const supabaseServiceRoleKey = envConfig.variables.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error(`Missing Supabase credentials for ${env} environment`);
    }

    global.supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  getAllEnvVars(): Map<string, string> {
    const envConfig = envLoader.getCurrentConfig();
    if (!envConfig) {
      throw new Error('No environment configuration loaded');
    }
    return new Map(Object.entries(envConfig.variables));
  }

  getEnvFile(mode: string): string {
    return envLoader.getCurrentConfig()?.envFile || '.env.staging';
  }

  async loadEnvironment(mode: string): Promise<void> {
    await envLoader.load(mode);
  }

  getEnvVar(key: string): string | undefined {
    return envLoader.getVariable(key);
  }

  clearCache(): void {
    envLoader.clearConfig();
  }
}

// Command Factory for professional command execution
class CommandFactory {
  private static instance: CommandFactory;
  private envManager: EnvironmentManager;

  private constructor() {
    this.envManager = EnvironmentManager.getInstance();
  }

  static getInstance(): CommandFactory {
    if (!this.instance) {
      this.instance = new CommandFactory();
    }
    return this.instance;
  }

  async createDevCommand(mode: string, useProxy: boolean): Promise<string> {
    await this.envManager.loadEnvironment(mode);
    
    // Get all environment variables
    const envVars = {
      VITE_MODE: mode,
      NODE_ENV: mode.includes('production') ? 'production' : 'development',
      ...Object.fromEntries(
        Array.from(this.envManager.getAllEnvVars().entries())
          .filter(([key]) => key.startsWith('VITE_'))
          .map(([key, value]) => [key, value.split('#')[0].trim()]) // Remove comments from env values
      )
    };
    
    // Create the environment variables string
    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    
    if (useProxy) {
      // For proxy mode, we need to run both the Vite server and the proxy server
      return `cross-env ${envString} concurrently "vite --mode ${mode}" "cd src/server && cross-env ${envString} npm run dev"`;
    } else {
      // For non-proxy mode, just run the Vite server
      return `cross-env ${envString} vite --mode ${mode}`;
    }
  }
}

async function runCommand(
  command: string, 
  options: { returnOutput?: boolean } = {}
): Promise<string | void> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execPromise = promisify(exec);
  
  // Create a clean environment that inherits from process.env
  const cleanEnv = { ...process.env };

  // Parse environment variables from the command
  const envVars = {};
  const commandParts = command.split(' ');
  let actualCommand = '';
  
  // Extract environment variables from the command
  for (let i = 0; i < commandParts.length; i++) {
    const part = commandParts[i];
    if (part.includes('=')) {
      const [key, value] = part.split('=');
      envVars[key] = value;
    } else {
      actualCommand = commandParts.slice(i).join(' ');
      break;
    }
  }

  // Clear any existing VITE_ variables
  Object.keys(cleanEnv).forEach(key => {
    if (key.startsWith('VITE_')) {
      delete cleanEnv[key];
    }
  });

  // Merge in the new environment variables
  Object.assign(cleanEnv, envVars);
  
  console.log('\n🚀 Executing command:', actualCommand);
  console.log('📝 With environment variables:', Object.keys(envVars).join(', '));
  
  try {
    // If we need to return the output, use exec
    if (options.returnOutput) {
      const { stdout } = await execPromise(actualCommand, { env: cleanEnv });
      return stdout;
    } else {
      // Otherwise, use spawn for better interaction
      return new Promise<void>((resolve, reject) => {
        const { spawn } = require('child_process');
        const proc = spawn(actualCommand, {
          shell: true,
          stdio: 'inherit',
          env: cleanEnv
        });
  
        let isTerminated = false;
  
        proc.on('exit', (code) => {
          if (!isTerminated) {
            if (code === 0 || code === null) {
              resolve();
            } else {
              reject(new Error(`Process exited with code ${code}`));
            }
          }
        });
  
        proc.on('error', (err) => {
          if (!isTerminated) {
            reject(err);
          }
        });
  
        const handleSigInt = () => {
          isTerminated = true;
          proc.kill('SIGINT');
          process.off('SIGINT', handleSigInt);
          resolve();
        };
  
        process.on('SIGINT', handleSigInt);
        proc.on('close', () => {
          process.off('SIGINT', handleSigInt);
        });
      });
    }
  } catch (error) {
    console.error('Command execution failed:', error);
    throw error;
  }
}

async function showMenu() {
  const envManager = EnvironmentManager.getInstance();
  const currentEnv = envManager.getCurrentEnvironment();
  const envColor = currentEnv === 'production' ? '\x1b[31m' : '\x1b[32m';
  const resetColor = '\x1b[0m';

  console.log('\n═══════════════════════════════');
  console.log(`🏛️  Congress Bills Management CLI ${envColor}[${currentEnv.toUpperCase()}]${resetColor}`);
  console.log('═══════════════════════════════\n');
  
  // Environment-aware operations (1-6)
  console.log('Environment Control:');
  console.log(`S) Switch to ${currentEnv === 'production' ? 'Staging' : '\x1b[2mStaging (Current)\x1b[0m'}`);
  console.log(`P) Switch to ${currentEnv === 'staging' ? 'Production' : '\x1b[2mProduction (Current)\x1b[0m'}`);
  
  console.log('\n=== Environment-Aware Operations ===');
  console.log('These operations will run in the current environment:', envColor + currentEnv.toUpperCase() + resetColor);
  
  console.log('\n1. Bills Sync');
  console.log('   a) Normal Sync (--limit=25)');
  console.log('   b) Force Sync (reprocess existing)');
  console.log('   c) Force Sync with PDF Storage');
  console.log('   d) Custom Sync (specify limit/offset)');
  console.log('   e) Sync PDF Links for Existing Bills');
  console.log('   f) List Failed Bills');
  console.log('   g) Retry Failed Bills');
  
  console.log('\n2. OCR Operations');
  console.log('   a) Run OCR on bills without text');
  console.log('   b) Force OCR on specific bill');
  console.log('   c) Batch OCR Processing');
  
  console.log('\n3. Analysis');
  console.log('   a) Analyze Bills');
  console.log('   b) Force Analysis');
  
  console.log('\n4. Database');
  console.log('   a) Reset Database (Complete Reset)');
  console.log('   b) Update Database (Apply Updates)');
  console.log('   c) Backup Database');
  console.log('   d) Clean Orphaned PDFs');
  console.log('   e) Restore Database');
  
  console.log('\n5. Statistics');
  console.log('   a) Show Database Stats');
  console.log('   b) Storage Usage');
  console.log('   c) Bills Without Text');
  console.log('   d) Verify PDF Links');
  
  console.log('\n6. Search & Debug');
  console.log('   a) Search Bill by ID/Number');
  console.log('   b) Test PDF Download');
  console.log('   c) Advanced Search');
  console.log('   d) Export Search Results');
  
  console.log('\n7. Vector & Semantic Search');
  console.log('   a) Setup Vector Tables');
  console.log('   b) Generate Embeddings for All Bills');
  console.log('   c) Generate Embeddings for Recent Bills');
  console.log('   d) Check Vector Database Stats');  
  console.log('   e) Semantic Search');
  console.log('   f) Find Similar Bills');
  
  console.log('\n8. Server Operations');
  console.log('   a) Run Server (Regular Mode - ' + envColor + currentEnv + resetColor + ')');
  console.log('   b) Run Server with Inngest (' + envColor + currentEnv + resetColor + ')');
  console.log('   c) Run Inngest Dev Server (Local)');
  console.log('   d) Run Server Legacy Mode (Pre-Hybrid)');
  console.log('   e) Install Inngest Dependencies');
  console.log('   f) Run Complete Local Dev Environment (Frontend + Server)');
  console.log('   g) Debug Server (with --inspect flag)');
  console.log('   h) Run COMPLETELY in Legacy Mode (Without Hybrid Approach)');
  
  console.log('\n9. Deployment');
  console.log('   a) Deploy Frontend & Server to Staging');
  console.log('   b) Deploy Frontend & Server to Production');
  console.log('   c) Deploy with App Engine (Alternative)');
  console.log('   d) Simple Staging Deployment (Without Docker)');
  console.log('   e) Simple Production Deployment (Without Docker)');
  console.log('   f) LEGACY Deployment (Original Method, NO Hybrid)');
  console.log('0. Exit\n');
}

async function handleCustomSync() {
  const envManager = EnvironmentManager.getInstance();
  
  console.log("\n=== Custom Bill Sync ===");
  console.log("1. Normal sync (latest bills)");
  console.log("2. Force sync (reprocess existing)");
  console.log("3. Force sync with PDFs");
  console.log("4. Parallel sync (multi-threaded)");
  console.log("5. Back to main menu");

  const choice = await question("\nSelect an option: ");

  let command = '';
  switch (choice) {
    case '1':
      const limit = await question("Enter number of bills to sync (default: 25): ");
      const congress = await question("Enter congress number (empty for latest): ");
      const env = envManager.getCurrentEnvironment();
      command = `npm run sync:bills:congressapi:${env === 'production' ? 'prod' : 'staging'}` +
        `${limit ? ` -- --limit=${limit}` : ''}${congress ? ` -- --congress=${congress}` : ''}`;
      break;
    case '2':
      const forceLimit = await question("Enter number of bills to sync (default: 25): ");
      const forceCongress = await question("Enter congress number (empty for latest): ");
      const forceEnv = envManager.getCurrentEnvironment();
      command = `npm run sync:bills:congressapi:force:${forceEnv === 'production' ? 'prod' : 'staging'}` +
        `${forceLimit ? ` -- --limit=${forceLimit}` : ''}${forceCongress ? ` -- --congress=${forceCongress}` : ''}`;
      break;
    case '3':
      const pdfLimit = await question("Enter number of bills to sync (default: 25): ");
      const pdfCongress = await question("Enter congress number (empty for latest): ");
      const pdfEnv = envManager.getCurrentEnvironment();
      command = `npm run sync:bills:congressapi:force:save-pdfs:${pdfEnv === 'production' ? 'prod' : 'staging'}` +
        `${pdfLimit ? ` -- --limit=${pdfLimit}` : ''}${pdfCongress ? ` -- --congress=${pdfCongress}` : ''}`;
      break;
    case '4':
      const parallelLimit = await question("Enter number of bills to sync (default: 100): ");
      const parallelCongress = await question("Enter congress number (empty for latest): ");
      const threads = await question("Enter number of threads (default: 4): ");
      const offset = await question("Enter offset (default: 0): ");
      const savePdfs = await question("Save PDFs? (y/N): ");
      const parallelEnv = envManager.getCurrentEnvironment();

      command = `npm run sync:bills:parallel:${parallelEnv === 'production' ? 'prod' : 'staging'} -- ` +
        `${parallelLimit ? `--limit=${parallelLimit} ` : ''}` +
        `${parallelCongress ? `--congress=${parallelCongress} ` : ''}` +
        `${threads ? `--threads=${threads} ` : ''}` +
        `${offset ? `--offset=${offset} ` : ''}` +
        `${savePdfs.toLowerCase() === 'y' ? '--save-pdfs' : ''}`;
      break;
    case '5':
      return;
    default:
      console.log("Invalid option");
      return;
  }

  if (command) {
    console.log(`\n🚀 Executing command: ${command}`);
    console.log(`📝 With environment: ${envManager.getCurrentEnvironment().toUpperCase()}\n`);
  await runCommand(command);
  }
}

async function handleForceOCR() {
  const billType = await question('Enter bill type (e.g., hr, s, hjres): ');
  const billNumber = await question('Enter bill number: ');
  const congress = await question('Enter congress number: ');

  if (!billType || !billNumber || !congress) {
    console.log('All fields are required!');
    return;
  }

  // TODO: Implement specific bill OCR
  console.log('This feature is coming soon!');
  await question('\nPress Enter to continue...');
}

async function showDatabaseStats() {
  console.log('\nFetching database statistics...');
  
  // Get total bills count
  const { count: totalBills } = await supabase
    .from('bills')
    .select('*', { count: 'exact', head: true });
    
  // Get bills by status
  const { data: statusCounts } = await supabase
    .from('bills')
    .select('status')
    .then(result => {
      const counts = {};
      result.data?.forEach(bill => {
        counts[bill.status] = (counts[bill.status] || 0) + 1;
      });
      return { data: counts };
    });
    
  // Get bills with/without text
  const { count: withText } = await supabase
    .from('bills')
    .select('*', { count: 'exact', head: true })
    .not('full_text', 'is', null);
    
  console.log('\n=== Database Statistics ===');
  console.log(`Total Bills: ${totalBills}`);
  console.log('\nStatus Distribution:');
  Object.entries(statusCounts || {}).forEach(([status, count]) => {
    console.log(`${status}: ${count}`);
  });
  console.log('\nText Content:');
  console.log(`With Text: ${withText}`);
  console.log(`Without Text: ${totalBills - withText}`);
  
  await question('\nPress Enter to continue...');
}

async function showStorageUsage() {
  console.log('\nCalculating storage usage...');
  
  const { data: pdfs } = await supabase
    .storage
    .from('bill_pdfs')
    .list();
    
  const totalSize = pdfs?.reduce((acc, file) => acc + (file.metadata?.size || 0), 0) || 0;
  
  console.log('\n=== Storage Statistics ===');
  console.log(`Total PDFs: ${pdfs?.length || 0}`);
  console.log(`Total Size: ${filesize(totalSize)}`);
  console.log(`Average Size: ${filesize(totalSize / (pdfs?.length || 1))}`);
  
  await question('\nPress Enter to continue...');
}

async function showBillsWithoutText() {
  console.log('\nFetching bills without text...');
  
  const { data: bills } = await supabase
    .from('bills')
    .select('*')
    .is('full_text', null)
    .order('congress', { ascending: false })
    .order('bill_number', { ascending: true })
    .limit(10);
    
  console.log('\n=== Recent Bills Without Text ===');
  console.log('(Showing latest 10)');
  bills?.forEach(bill => {
    console.log(`\n${bill.bill_type}${bill.bill_number} (Congress ${bill.congress})`);
    console.log(`Title: ${bill.title.substring(0, 100)}...`);
    console.log(`PDF URL: ${bill.pdf_url || 'None'}`);
  });
  
  await question('\nPress Enter to continue...');
}

async function searchBill() {
  const searchType = await question('\nSearch by (1) Bill Number or (2) Congress+Type+Number?: ');
  
  let bill;
  
  if (searchType === '1') {
    const billNumber = await question('Enter bill number (e.g., hr1, s42, hjres5): ');
    const { data } = await supabase
      .from('bills')
      .select('*')
      .ilike('bill_type', billNumber.replace(/[0-9]/g, '') + '%')
      .eq('bill_number', billNumber.replace(/[^0-9]/g, ''))
      .limit(1)
      .single();
    bill = data;
  } else {
    const congress = await question('Enter Congress number: ');
    const billType = await question('Enter bill type (hr, s, hjres, etc): ');
    const billNumber = await question('Enter bill number: ');
    const { data } = await supabase
      .from('bills')
      .select('*')
      .eq('congress', congress)
      .eq('bill_type', billType)
      .eq('bill_number', billNumber)
      .limit(1)
      .single();
    bill = data;
  }
  
  if (!bill) {
    console.log('\nBill not found!');
    await question('\nPress Enter to continue...');
    return;
  }
  
  console.log('\n=== Bill Details ===');
  console.log(`ID: ${bill.id}`);
  console.log(`Bill: ${bill.bill_type}${bill.bill_number} (Congress ${bill.congress})`);
  console.log(`Title: ${bill.title}`);
  console.log(`Status: ${bill.status}`);
  console.log(`Introduction Date: ${bill.introduction_date}`);
  console.log(`Has Full Text: ${bill.has_full_text}`);
  console.log(`PDF URL: ${bill.pdf_url || 'None'}`);
  
  if (bill.pdf_url) {
    const testPdf = await question('\nTest PDF download? (y/N): ');
    if (testPdf.toLowerCase() === 'y') {
      await testPdfDownload(bill.pdf_url);
    }
  }
  
  await question('\nPress Enter to continue...');
}

async function testPdfDownload(url?: string) {
  if (!url) {
    url = await question('\nEnter PDF URL to test: ');
  }
  
  console.log('\nTesting PDF download...');
  try {
    const start = Date.now();
    const response = await axios.get(url, {
      responseType: 'arraybuffer'
    });
    const duration = Date.now() - start;
    
    console.log('\n=== PDF Download Test ===');
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Size: ${filesize(response.data.length)}`);
    console.log(`Duration: ${duration}ms`);
    console.log('Download successful!');
  } catch (error) {
    console.error('\nError downloading PDF:', error.message);
  }
  
  await question('\nPress Enter to continue...');
}

async function cleanOrphanedPDFs() {
  console.log('\nChecking for orphaned PDFs...');
  
  // Get all PDFs in storage
  const { data: pdfs } = await supabase
    .storage
    .from('bill_pdfs')
    .list();
    
  if (!pdfs?.length) {
    console.log('No PDFs found in storage.');
    return;
  }
  
  console.log(`Found ${pdfs.length} PDFs in storage`);
  
  let orphanedCount = 0;
  let deletedCount = 0;
  
  for (const pdf of pdfs) {
    const billId = pdf.name.replace('.pdf', '');
    
    // Check if bill exists
    const { data: bill } = await supabase
      .from('bills')
      .select('id')
      .eq('id', billId)
      .single();
      
    if (!bill) {
      orphanedCount++;
      console.log(`Orphaned PDF found: ${pdf.name}`);
      
      const shouldDelete = (await question('Delete this PDF? (y/N): ')).toLowerCase() === 'y';
      if (shouldDelete) {
        const { error } = await supabase
          .storage
          .from('bill_pdfs')
          .remove([pdf.name]);
          
        if (!error) {
          deletedCount++;
          console.log('PDF deleted successfully');
        } else {
          console.error('Error deleting PDF:', error.message);
        }
      }
    }
  }
  
  console.log('\n=== Cleanup Summary ===');
  console.log(`Total PDFs checked: ${pdfs.length}`);
  console.log(`Orphaned PDFs found: ${orphanedCount}`);
  console.log(`PDFs deleted: ${deletedCount}`);
  
  await question('\nPress Enter to continue...');
}

async function backupDatabase() {
  console.log('\nStarting database backup...');
  
  // Create backups directory if it doesn't exist
  const backupDir = 'backups';
  await fsPromises.mkdir(backupDir, { recursive: true });
  
  // Get all bills
  const { data: bills, error } = await supabase
    .from('bills')
    .select('*');
    
  if (error) {
    console.error('Error fetching bills:', error.message);
    return;
  }
  
  const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
  const backupFile = path.join(backupDir, `bills_backup_${timestamp}.json`);
  
  await fsPromises.writeFile(backupFile, JSON.stringify(bills, null, 2));
  
  console.log(`\nBackup saved to: ${backupFile}`);
  console.log(`Total bills backed up: ${bills.length}`);
  
  await question('\nPress Enter to continue...');
}

async function verifyPdfLinks() {
  console.log('\nVerifying PDF links...');
  
  const { data: bills } = await supabase
    .from('bills')
    .select('*')
    .not('pdf_url', 'is', null);
    
  if (!bills?.length) {
    console.log('No bills with PDF URLs found.');
    return;
  }
  
  console.log(`Found ${bills.length} bills with PDF URLs`);
  
  let checkedCount = 0;
  let validCount = 0;
  let invalidCount = 0;
  const invalidUrls = [];
  
  for (const bill of bills) {
    process.stdout.write(`\rChecking bill ${++checkedCount}/${bills.length}...`);
    
    try {
      const response = await axios.head(bill.pdf_url);
      if (response.status === 200) {
        validCount++;
      } else {
        invalidCount++;
        invalidUrls.push({ bill: `${bill.bill_type}${bill.bill_number}`, url: bill.pdf_url });
      }
    } catch (error) {
      invalidCount++;
      invalidUrls.push({ bill: `${bill.bill_type}${bill.bill_number}`, url: bill.pdf_url });
    }
  }
  
  console.log('\n\n=== PDF Link Verification Results ===');
  console.log(`Total URLs checked: ${checkedCount}`);
  console.log(`Valid URLs: ${validCount}`);
  console.log(`Invalid URLs: ${invalidCount}`);
  
  if (invalidUrls.length > 0) {
    console.log('\nInvalid URLs:');
    invalidUrls.forEach(({ bill, url }) => {
      console.log(`${bill}: ${url}`);
    });
    
    const exportList = await question('\nExport list of invalid URLs? (y/N): ');
    if (exportList.toLowerCase() === 'y') {
      const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
      const exportFile = `invalid_urls_${timestamp}.json`;
      await fsPromises.writeFile(exportFile, JSON.stringify(invalidUrls, null, 2));
      console.log(`\nExported to: ${exportFile}`);
    }
  }
  
  await question('\nPress Enter to continue...');
}

async function advancedSearch() {
  console.log('\n=== Advanced Search ===');
  console.log('1. Search by Title');
  console.log('2. Search by Date Range');
  console.log('3. Search by Status');
  console.log('4. Search by Multiple Criteria');
  console.log('0. Back to Main Menu\n');
  
  const choice = await question('Enter your choice: ');
  
  let query = supabase.from('bills').select('*');
  let results;
  
  switch (choice) {
    case '1':
      const title = await question('Enter search term: ');
      results = await query
        .ilike('title', `%${title}%`)
        .order('congress', { ascending: false })
        .limit(20);
      break;
      
    case '2':
      const startDate = await question('Enter start date (YYYY-MM-DD): ');
      const endDate = await question('Enter end date (YYYY-MM-DD): ');
      results = await query
        .gte('introduction_date', startDate)
        .lte('introduction_date', endDate)
        .order('introduction_date', { ascending: false });
      break;
      
    case '3':
      const status = await question('Enter status (introduced/active/passed/law): ');
      results = await query
        .eq('status', status)
        .order('congress', { ascending: false });
      break;
      
    case '4':
      const congress = await question('Congress number (optional): ');
      const billType = await question('Bill type (optional): ');
      const searchStatus = await question('Status (optional): ');
      const hasText = await question('Has full text? (y/n/any): ');
      
      if (congress) query = query.eq('congress', congress);
      if (billType) query = query.eq('bill_type', billType);
      if (searchStatus) query = query.eq('status', searchStatus);
      if (hasText === 'y') query = query.eq('has_full_text', true);
      if (hasText === 'n') query = query.eq('has_full_text', false);
      
      results = await query.order('congress', { ascending: false });
      break;
      
    case '0':
      return;
  }
  
  if (results?.error) {
    console.error('Error performing search:', results.error.message);
    return;
  }
  
  if (!results?.data?.length) {
    console.log('\nNo results found.');
    await question('\nPress Enter to continue...');
    return;
  }
  
  console.log(`\nFound ${results.data.length} results:`);
  results.data.forEach(bill => {
    console.log(`\n${bill.bill_type}${bill.bill_number} (Congress ${bill.congress})`);
    console.log(`Title: ${bill.title.substring(0, 100)}...`);
    console.log(`Status: ${bill.status}`);
    console.log(`Introduced: ${bill.introduction_date}`);
  });
  
  const exportResults = await question('\nExport results? (y/N): ');
  if (exportResults.toLowerCase() === 'y') {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const exportFile = `search_results_${timestamp}.json`;
    await fsPromises.writeFile(exportFile, JSON.stringify(results.data, null, 2));
    console.log(`\nExported to: ${exportFile}`);
  }
  
  await question('\nPress Enter to continue...');
}

async function batchOcrProcessing() {
  console.log('\n=== Batch OCR Processing ===');
  
  const limit = parseInt(await question('How many bills to process (default 10): ') || '10');
  const processAll = (await question('Process all matching bills? (y/N): ')).toLowerCase() === 'y';
  
  console.log('\nFetching bills without text...');
  
  let query = supabase
    .from('bills')
    .select('*')
    .is('full_text', null)
    .not('pdf_url', 'is', null)
    .order('congress', { ascending: false });
    
  if (!processAll) {
    query = query.limit(limit);
  }
  
  const { data: bills } = await query;
  
  if (!bills?.length) {
    console.log('No bills found that need OCR processing.');
    await question('\nPress Enter to continue...');
    return;
  }
  
  console.log(`\nFound ${bills.length} bills to process`);
  const proceed = await question('Proceed with OCR processing? (y/N): ');
  
  if (proceed.toLowerCase() !== 'y') {
    return;
  }
  
  let processedCount = 0;
  let errorCount = 0;
  
  for (const bill of bills) {
    try {
      console.log(`\nProcessing ${bill.bill_type}${bill.bill_number} (${++processedCount}/${bills.length})`);
      
      // Download PDF
      const response = await axios.get(bill.pdf_url, {
        responseType: 'arraybuffer'
      });
      
      const pdfBuffer = Buffer.from(response.data);
      
      // Extract text
      const data = await pdfExtract.extractBuffer(pdfBuffer);
      const textContent = data.pages
        .map(page => page.content.map(item => item.str).join(" "))
        .join("\n");
      
      // Update database
      const { error: updateError } = await supabase
        .from('bills')
        .update({
          full_text: textContent,
          has_full_text: true
        })
        .eq('id', bill.id);
        
      if (updateError) throw updateError;
      
      console.log('Successfully processed');
      
    } catch (error) {
      console.error('Error processing bill:', error.message);
      errorCount++;
    }
  }
  
  console.log('\n=== Batch Processing Complete ===');
  console.log(`Successfully processed: ${processedCount - errorCount}`);
  console.log(`Errors: ${errorCount}`);
  
  await question('\nPress Enter to continue...');
}

async function restoreDatabase() {
  console.log('\nStarting database restore...');
  
  // List available backups
  const backupDir = 'backups';
  let backupFiles;
  try {
    backupFiles = await fsPromises.readdir(backupDir);
    backupFiles = backupFiles.filter(file => file.endsWith('.json'));
  } catch (error) {
    console.error('Error reading backup directory:', error.message);
    return;
  }
  
  if (!backupFiles.length) {
    console.log('No backup files found in the backups directory.');
    await question('\nPress Enter to continue...');
    return;
  }
  
  // Show available backups
  console.log('\nAvailable backups:');
  backupFiles.forEach((file, index) => {
    console.log(`${index + 1}. ${file}`);
  });
  
  // Let user select a backup
  const selection = await question('\nSelect backup to restore (number) or 0 to cancel: ');
  const selectedIndex = parseInt(selection) - 1;
  
  if (selectedIndex === -1 || selection === '0') {
    console.log('Restore cancelled.');
    await question('\nPress Enter to continue...');
    return;
  }
  
  if (selectedIndex < 0 || selectedIndex >= backupFiles.length) {
    console.log('Invalid selection.');
    await question('\nPress Enter to continue...');
    return;
  }
  
  const selectedFile = backupFiles[selectedIndex];
  const confirm = await question(`\nWARNING: This will overwrite existing data with backup from ${selectedFile}. Continue? (yes/NO): `);
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log('Restore cancelled.');
    await question('\nPress Enter to continue...');
    return;
  }
  
  try {
    // Read backup file
    console.log(`\nReading backup file: ${selectedFile}`);
    const backupData = JSON.parse(await fsPromises.readFile(path.join(backupDir, selectedFile), 'utf-8'));
    
    if (!Array.isArray(backupData)) {
      throw new Error('Invalid backup file format: expected an array of bills');
    }
    
    // Clear existing data
    console.log('Clearing existing bills...');
    const { error: deleteError } = await supabase
      .from('bills')
      .delete()
      .neq('id', 'dummy'); // Delete all records
      
    if (deleteError) {
      throw new Error(`Error clearing existing data: ${deleteError.message}`);
    }
    
    // Restore bills in batches
    const batchSize = 100;
    let restoredCount = 0;
    let errorCount = 0;
    
    console.log(`\nRestoring ${backupData.length} bills in batches of ${batchSize}...`);
    
    for (let i = 0; i < backupData.length; i += batchSize) {
      const batch = backupData.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('bills')
        .upsert(batch);
        
      if (insertError) {
        console.error(`Error restoring batch ${i / batchSize + 1}:`, insertError.message);
        errorCount += batch.length;
      } else {
        restoredCount += batch.length;
      }
      
      // Show progress
      process.stdout.write(`\rProgress: ${restoredCount}/${backupData.length} bills restored...`);
    }
    
    console.log('\n\n=== Restore Complete ===');
    console.log(`Successfully restored: ${restoredCount} bills`);
    console.log(`Failed to restore: ${errorCount} bills`);
    
  } catch (error) {
    console.error('\nError during restore:', error.message);
  }
  
  await question('\nPress Enter to continue...');
}

interface TierConfig {
  memory: string;
  cpu: string;
  minInstances: number;
  maxInstances: number;
  concurrency: number;
  description: string;
  estimatedCost: string;
}

const TIERS: Record<string, TierConfig> = {
  xxs: {
    memory: "512Mi",
    cpu: "0.5",
    minInstances: 0,
    maxInstances: 2,
    concurrency: 50,
    description: "Minimal setup for testing and development",
    estimatedCost: "~$15/month if running continuously"
  },
  s: {
    memory: "1Gi",
    cpu: "1",
    minInstances: 0,
    maxInstances: 4,
    concurrency: 80,
    description: "Standard setup for small applications",
    estimatedCost: "~$30/month if running continuously"
  },
  m: {
    memory: "2Gi",
    cpu: "2",
    minInstances: 1,
    maxInstances: 8,
    concurrency: 100,
    description: "Enhanced setup for medium traffic",
    estimatedCost: "~$75/month with minimum 1 instance"
  },
  l: {
    memory: "4Gi",
    cpu: "4",
    minInstances: 2,
    maxInstances: 16,
    concurrency: 200,
    description: "Production setup for high traffic",
    estimatedCost: "~$200/month with minimum 2 instances"
  }
};

interface DeploymentHistory {
  version: string;
  customName?: string;
  timestamp: string;
  environment: 'staging' | 'production';
  imageTag: string;
  proxyEnabled: boolean;
  tier: string;
  serviceUrl: string;
  gitCommit?: string;
  description?: string;
  projectId: string;
}

// Function to save deployment history
async function saveDeploymentHistory(history: DeploymentHistory) {
  const historyDir = 'deployments';
  await fsPromises.mkdir(historyDir, { recursive: true });
  
  const historyFile = path.join(historyDir, 'history.json');
  let histories: DeploymentHistory[] = [];
  
  try {
    const existingData = await fsPromises.readFile(historyFile, 'utf-8');
    histories = JSON.parse(existingData);
  } catch (error) {
    // File doesn't exist yet, start with empty array
  }
  
  histories.unshift(history); // Add new deployment at the start
  await fsPromises.writeFile(historyFile, JSON.stringify(histories, null, 2));
}

// Function to get current git commit
async function getCurrentGitCommit(): Promise<string> {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch (error) {
    return 'unknown';
  }
}

// Function to list deployment history
async function listDeploymentHistory() {
  console.log('\n=== 📜 Deployment History ===');
  
  const historyFile = path.join('deployments', 'history.json');
  try {
    const data = await fsPromises.readFile(historyFile, 'utf-8');
    const histories: DeploymentHistory[] = JSON.parse(data);
    
    histories.forEach((history, index) => {
      console.log(`\n${index + 1}. Deployment from ${history.timestamp}`);
      console.log(`   Version: ${history.version}`);
      if (history.customName) console.log(`   Custom Name: ${history.customName}`);
      console.log(`   Environment: ${history.environment === 'production' ? '🚀 PROD' : '🔧 STAGING'}`);
      console.log(`   Image: ${history.imageTag}`);
      console.log(`   Proxy: ${history.proxyEnabled ? '✓' : '✗'}`);
      console.log(`   Tier: ${history.tier.toUpperCase()}`);
      console.log(`   URL: ${history.serviceUrl}`);
      if (history.gitCommit) {
        console.log(`   Commit: ${history.gitCommit.substring(0, 7)}`);
      }
      if (history.description) {
        console.log(`   Description: ${history.description}`);
      }
    });
    
    return histories;
  } catch (error) {
    console.log('No deployment history found.');
    return [];
  }
}

// Function to rollback to a previous deployment
async function rollbackDeployment() {
  console.log('\n=== 🔄 Rollback Deployment ===');
  
  // List available deployments
  const histories = await listDeploymentHistory();
  
  if (histories.length === 0) {
    console.log('\nNo previous deployments available for rollback.');
    await question('\nPress Enter to continue...');
    return;
  }
  
  const selection = await question('\nSelect deployment number to rollback to (or 0 to cancel): ');
  const index = parseInt(selection) - 1;
  
  if (selection === '0' || index < 0 || index >= histories.length) {
    console.log('Rollback cancelled.');
    await question('\nPress Enter to continue...');
    return;
  }
  
  const targetDeployment = histories[index];
  
  console.log('\n=== Rollback Summary ===');
  console.log('═══════════════════════════════');
  console.log(`Environment: ${targetDeployment.environment.toUpperCase()}`);
  console.log(`Version: ${targetDeployment.version}`);
  console.log(`Image: ${targetDeployment.imageTag}`);
  console.log(`Proxy: ${targetDeployment.proxyEnabled ? 'Enabled ✓' : 'Disabled ✗'}`);
  console.log(`Tier: ${targetDeployment.tier.toUpperCase()}`);
  console.log('═══════════════════════════════');
  
  const confirm = await question(`\n🚨 Are you sure you want to rollback to this version? (yes/NO): `);
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log('Rollback cancelled.');
    await question('\nPress Enter to continue...');
    return;
  }
  
  try {
    console.log('\n🔄 Initiating rollback...');
    
    // Deploy the previous version
    const tierConfig = TIERS[targetDeployment.tier];
    await runCommand(
      `gcloud run deploy ${targetDeployment.environment === 'production' ? 'dogeplot' : 'staging-dogeplot'} ` +
      `--image ${targetDeployment.imageTag} ` +
      `--platform managed ` +
      `--region asia-southeast1 ` +
      `--allow-unauthenticated ` +
      `--port 8080 ` +
      `--memory ${tierConfig.memory} ` +
      `--cpu ${tierConfig.cpu} ` +
      `--min-instances ${tierConfig.minInstances} ` +
      `--max-instances ${tierConfig.maxInstances} ` +
      `--concurrency ${tierConfig.concurrency}`
    );
    
    console.log('\n✅ Rollback completed successfully!');
    console.log(`\n🌎 Service URL: ${targetDeployment.serviceUrl}`);
    
  } catch (error) {
    console.error('\n❌ Rollback failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
  }
  
  await question('\nPress Enter to continue...');
}

// Add this before the deployToGCloud function:
interface Region {
  id: string;
  name: string;
  location: string;
  tier1: boolean;
}

const CLOUD_RUN_REGIONS: Region[] = [
  { id: 'asia-southeast1', name: 'Singapore', location: 'Singapore', tier1: true },
  { id: 'asia-northeast1', name: 'Tokyo', location: 'Japan', tier1: true },
  { id: 'europe-west6', name: 'Zurich', location: 'Switzerland', tier1: true },
  { id: 'us-central1', name: 'Iowa', location: 'United States', tier1: true },
  { id: 'us-east1', name: 'South Carolina', location: 'United States', tier1: true },
  { id: 'us-west1', name: 'Oregon', location: 'United States', tier1: true }
];

async function loadProjectConfig() {
  try {
    const configData = await fsPromises.readFile('project.config.json', 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Error loading project configuration:', error);
    throw new Error('Failed to load project configuration. Please ensure project.config.json exists.');
  }
}

async function updateProjectConfig(updates: Partial<any>) {
  try {
    const config = await loadProjectConfig();
    const updatedConfig = { ...config, ...updates };
    await fsPromises.writeFile('project.config.json', JSON.stringify(updatedConfig, null, 2));
    return updatedConfig;
  } catch (error) {
    console.error('Error updating project configuration:', error);
    throw new Error('Failed to update project configuration.');
  }
}

async function deployToGCloud() {
  console.log('\n=== 🚀 DOGEPLOT Deployment System ===');

  try {
    // Load project configuration
    const config = await loadProjectConfig();
    
    // Get current project from gcloud
    const { stdout: currentProject } = await import('child_process').then(({ execSync }) => ({
      stdout: execSync('gcloud config get-value project').toString().trim()
    }));

    // Update project ID if it has changed
    if (currentProject && currentProject !== config.project.id) {
      console.log(`\n⚠️ Project ID mismatch detected:`);
      console.log(`Current project: ${currentProject}`);
      console.log(`Configured project: ${config.project.id}`);
      
      const updateConfig = await question('\nUpdate project configuration with current project ID? (Y/n): ');
      if (updateConfig.toLowerCase() !== 'n') {
        await updateProjectConfig({
          project: {
            ...config.project,
            id: currentProject
          }
        });
        console.log('✅ Project configuration updated');
        config.project.id = currentProject;
      }
    }

    // Get current region
    const { stdout: currentRegion } = await import('child_process').then(({ execSync }) => ({
      stdout: execSync('gcloud config get-value compute/region || echo "asia-southeast1"').toString().trim()
    }));

    // 1. Environment Selection
  console.log('\n📍 Step 1: Select Deployment Environment');
    console.log('1. Staging');
    console.log('2. Production');
  const envChoice = await question('\nEnter choice (1/2): ');

  if (!['1', '2'].includes(envChoice)) {
    console.log('❌ Invalid choice. Deployment cancelled.');
    await question('\nPress Enter to continue...');
    return;
  }

  const isStaging = envChoice === '1';
    const serviceName = config.deployment.services[isStaging ? 'staging' : 'production'];

    // 2. Region Selection/Confirmation
    console.log('\n📍 Step 2: Region Configuration');
    console.log(`Current region: ${currentRegion}`);
    
    let deployRegion = currentRegion;
    const changeRegion = await question('Would you like to change the region? (y/N): ');

    if (changeRegion.toLowerCase() === 'y') {
      console.log('\nAvailable regions:');
      CLOUD_RUN_REGIONS.forEach((region, index) => {
        console.log(`${index + 1}. ${region.name} (${region.location})${region.tier1 ? ' - Tier 1' : ''}`);
      });

      const regionChoice = await question('\nSelect region number (1-6): ');
      const regionIndex = parseInt(regionChoice) - 1;

      if (regionIndex >= 0 && regionIndex < CLOUD_RUN_REGIONS.length) {
        deployRegion = CLOUD_RUN_REGIONS[regionIndex].id;
        
        // Update gcloud config
        await runCommand(`gcloud config set compute/region ${deployRegion}`);
        
        // Update project config
        await updateProjectConfig({
          project: {
            ...config.project,
            region: deployRegion
          }
        });
        
        // Update cloudbuild.yaml
        console.log('\nUpdating build configuration...');
        const buildConfigPath = 'cloudbuild.yaml';
        try {
          let buildConfig = await fsPromises.readFile(buildConfigPath, 'utf-8');
          buildConfig = buildConfig.replace(
            /CLOUDSDK_COMPUTE_REGION=.+/g,
            `CLOUDSDK_COMPUTE_REGION=${deployRegion}`
          );
          await fsPromises.writeFile(buildConfigPath, buildConfig);
          console.log('✅ Build configuration updated');
        } catch (error) {
          console.error('❌ Error updating build configuration:', error);
        }
      }
    }

    const selectedRegion = CLOUD_RUN_REGIONS.find(r => r.id === deployRegion) || CLOUD_RUN_REGIONS[0];
    console.log(`\nSelected region: ${selectedRegion.name} (${deployRegion})`);

  // 3. Version Information
    console.log('\n📍 Step 3: Version Information');
  const timestamp = format(new Date(), 'yyyyMMdd-HHmmss');
  const defaultVersion = `v${timestamp}`;
  
  console.log(`Default version: ${defaultVersion}`);
  const customName = await question('Enter custom version name (or press Enter for default): ');
  const version = customName || defaultVersion;
  
  const description = await question('Enter version description (optional): ');
  
  // 4. PDF Proxy Configuration
    console.log('\n📍 Step 4: PDF Proxy Configuration');
  console.log('1. Enable PDF Proxy (recommended for CORS handling)');
  console.log('2. Disable PDF Proxy (direct PDF access)');
  const proxyChoice = await question('\nEnter choice (1/2): ');
  
  if (!['1', '2'].includes(proxyChoice)) {
    console.log('❌ Invalid choice. Deployment cancelled.');
    await question('\nPress Enter to continue...');
    return;
  }

  const enableProxy = proxyChoice === '1';

  // 5. Tier Selection
    console.log('\n📍 Step 5: Select Deployment Tier');
  console.log('\nAvailable Tiers:');
  Object.entries(TIERS).forEach(([key, tier]) => {
    console.log(`\n${key.toUpperCase()}:`);
    console.log(`├─ Memory: ${tier.memory}`);
    console.log(`├─ CPU: ${tier.cpu}`);
    console.log(`├─ Instances: ${tier.minInstances}-${tier.maxInstances}`);
    console.log(`├─ Concurrency: ${tier.concurrency}`);
    console.log(`├─ ${tier.description}`);
    console.log(`└─ ${tier.estimatedCost}`);
  });

  const tierResponse = await question('\nSelect tier (xxs/s/m/l): ');
  const tier = tierResponse.toLowerCase();
  
  if (!TIERS[tier]) {
    console.log('❌ Invalid tier. Deployment cancelled.');
    await question('\nPress Enter to continue...');
    return;
  }

  // 6. Confirmation with deployment summary
    console.log('\n📍 Step 6: Deployment Summary');
  console.log('═══════════════════════════════');
  console.log(`Environment: ${isStaging ? 'STAGING 🔧' : 'PRODUCTION 🚀'}`);
  console.log(`Service Name: ${serviceName}`);
    console.log(`Region: ${selectedRegion.name} (${deployRegion})`);
  console.log(`Version: ${version}`);
  if (customName) console.log(`Custom Name: ${customName}`);
  if (description) console.log(`Description: ${description}`);
  console.log(`PDF Proxy: ${enableProxy ? 'Enabled ✓' : 'Disabled ✗'}`);
  console.log(`Tier: ${tier.toUpperCase()}`);
  console.log(`Memory: ${TIERS[tier].memory}`);
  console.log(`CPU: ${TIERS[tier].cpu}`);
  console.log(`Instances: ${TIERS[tier].minInstances}-${TIERS[tier].maxInstances}`);
  console.log(`Estimated Cost: ${TIERS[tier].estimatedCost}`);
  console.log('═══════════════════════════════');

  if (isStaging) {
    console.log('\n⚠️  Note: This will replace any existing staging deployment');
  } else {
    console.log('\n⚠️  WARNING: This will replace the production deployment!');
  }

  const confirm = await question(`\n🚨 Are you absolutely sure you want to proceed? (yes/NO): `);

  if (confirm.toLowerCase() !== 'yes') {
    console.log('Deployment cancelled.');
    await question('\nPress Enter to continue...');
    return;
  }

    console.log(`\n🚀 Initiating deployment process...`);

    // Use project configuration for image tag
    const imageTag = `${config.deployment.registry}/${config.project.id}/${serviceName}:${version}`;
    const buildMode = enableProxy ? `${isStaging ? 'staging' : 'production'}.proxy` : isStaging ? 'staging' : 'production';

    // 1. Clean up
    console.log('\n🧹 Step 1: Cleaning up...');
    await runCommand('rm -rf dist src/server/dist');

    // 2. Build with appropriate environment variables
    console.log('\n📦 Step 2: Building application...');
    await runCommand(`npm run build:${buildMode}`);

    // 3. Build server
    console.log('\n📦 Step 3: Building server...');
    await runCommand('cd src/server && npm run build');

    // 4. Build and push Docker image with version tag
    console.log('\n🐳 Step 4: Building and pushing Docker image...');
    console.log('\nExecuting build command:');
    console.log(`gcloud builds submit \\`);
    console.log(`  --config=cloudbuild.yaml \\`);
    console.log(`  --substitutions=_BUILD_MODE=${buildMode},_RUNTIME_MODE=${buildMode},_IMAGE_NAME=${imageTag}`);
    
    await runCommand(
      `gcloud builds submit ` +
      `--config=cloudbuild.yaml ` +
      `--substitutions=_BUILD_MODE=${buildMode},_RUNTIME_MODE=${buildMode},_IMAGE_NAME=${imageTag}`
    );

    // 5. Deploy to Cloud Run
    console.log('\n🚀 Step 5: Deploying to Cloud Run...');
    const tierConfig = TIERS[tier];
    
    const deployCommand = 
      `gcloud run deploy ${serviceName} ` +
      `--image ${imageTag} ` +
      `--platform managed ` +
      `--region ${deployRegion} ` +
      `--allow-unauthenticated ` +
      `--port 8080 ` +
      `--memory ${tierConfig.memory} ` +
      `--cpu ${tierConfig.cpu} ` +
      `--min-instances ${tierConfig.minInstances} ` +
      `--max-instances ${tierConfig.maxInstances} ` +
      `--concurrency ${tierConfig.concurrency} ` +
      `--set-env-vars VITE_MODE=${buildMode}`;

    console.log('\nExecuting deploy command:');
    console.log(deployCommand.replace(/ /g, ' \\\n  '));
    
    await runCommand(deployCommand);

    // 6. Get and display the service URL
    const { stdout: serviceUrl } = await import('child_process').then(({ execSync }) => ({
      stdout: execSync(
        `gcloud run services describe ${serviceName} --platform managed --region ${deployRegion} --format='get(status.url)'`
      ).toString().trim()
    }));

    // Save deployment history with project info
    const gitCommit = await getCurrentGitCommit();
    await saveDeploymentHistory({
      version,
      customName: customName || undefined,
      timestamp: new Date().toISOString(),
      environment: isStaging ? 'staging' : 'production',
      imageTag,
      proxyEnabled: enableProxy,
      tier,
      serviceUrl,
      gitCommit,
      description: description || undefined,
      projectId: config.project.id
    });

    console.log('\n✅ Deployment completed successfully!');
    console.log(`\n🌎 Service URL: ${serviceUrl}`);
    console.log(`\n🔖 Version: ${version}`);
    if (customName) console.log(`\n📝 Custom Name: ${customName}`);
    console.log(`\n🔧 Environment: ${isStaging ? 'STAGING' : 'PRODUCTION'}`);
    console.log(`\n📍 Region: ${selectedRegion.name} (${deployRegion})`);

    if (isStaging) {
      console.log('\n🧪 Testing Checklist:');
      console.log('1. Verify the application loads correctly');
      console.log('2. Test PDF proxy functionality');
      console.log('3. Check performance and memory usage');
      console.log('4. Verify all routes and features');
      console.log('5. Monitor error rates and latency');
      console.log('\nOnce satisfied, proceed with production deployment');
    }

  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
  }

  await question('\nPress Enter to continue...');
}

async function fixGCloudPermissions() {
  console.log('\n=== 🔧 Fixing Google Cloud Permissions ===');
  
  try {
    const { stdout: projectId } = await import('child_process').then(({ execSync }) => ({
      stdout: execSync('gcloud config get-value project').toString().trim()
    }));

    if (!projectId) {
      console.log('\n❌ No project selected. Please select a project first.');
    return;
  }

    // Get current region
    const { stdout: currentRegion } = await import('child_process').then(({ execSync }) => ({
      stdout: execSync('gcloud config get-value compute/region || echo "asia-southeast1"').toString().trim()
    }));

    console.log(`\nFixing permissions for project: ${projectId}`);
    console.log(`Current region: ${currentRegion}`);
    
    // Get project number for service account creation
    const { stdout: projectNumber } = await import('child_process').then(({ execSync }) => ({
      stdout: execSync('gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)"').toString().trim()
    }));

    const cloudBuildServiceAccount = `${projectNumber}@cloudbuild.gserviceaccount.com`;

    // Define all required roles with descriptions
    const roles = [
      { role: 'roles/run.admin', desc: 'Cloud Run Admin' },
      { role: 'roles/storage.admin', desc: 'Storage Admin' },
      { role: 'roles/containerregistry.ServiceAgent', desc: 'Container Registry Service Agent' },
      { role: 'roles/artifactregistry.admin', desc: 'Artifact Registry Admin' },
      { role: 'roles/artifactregistry.writer', desc: 'Artifact Registry Writer' },
      { role: 'roles/iam.serviceAccountUser', desc: 'Service Account User' },
      { role: 'roles/cloudbuild.builds.builder', desc: 'Cloud Build Builder' },
      { role: 'roles/cloudbuild.serviceAgent', desc: 'Cloud Build Service Agent' }
    ];

    // Grant each role
    console.log('\nGranting permissions...');
    for (const { role, desc } of roles) {
      try {
        process.stdout.write(`\nGranting ${desc}... `);
        await runCommand(
          `gcloud projects add-iam-policy-binding ${projectId} ` +
          `--member=serviceAccount:${cloudBuildServiceAccount} ` +
          `--role=${role}`
        );
        console.log('✅');
      } catch (error) {
        console.log('❌');
        console.error(`Error granting ${desc}:`, error);
      }
    }

    // Enable required APIs
    const apisToEnable = [
      { api: 'artifactregistry.googleapis.com', desc: 'Artifact Registry API' },
      { api: 'containerregistry.googleapis.com', desc: 'Container Registry API' },
      { api: 'cloudbuild.googleapis.com', desc: 'Cloud Build API' },
      { api: 'run.googleapis.com', desc: 'Cloud Run API' },
      { api: 'cloudresourcemanager.googleapis.com', desc: 'Cloud Resource Manager API' }
    ];

    console.log('\nEnabling required APIs...');
    for (const { api, desc } of apisToEnable) {
      try {
        process.stdout.write(`\nEnabling ${desc}... `);
        await runCommand(`gcloud services enable ${api}`);
        console.log('✅');
    } catch (error) {
        console.log('❌');
        console.error(`Error enabling ${desc}:`, error);
      }
    }

    // Configure Docker authentication
    console.log('\nConfiguring Docker authentication...');
    try {
      await runCommand('gcloud auth configure-docker');
      console.log('✅ Docker authentication configured');
  } catch (error) {
      console.error('❌ Error configuring Docker:', error);
    }

    // Update region configuration
    console.log('\n=== Region Configuration ===');
    console.log('Current region:', currentRegion);
    const changeRegion = await question('Would you like to change the region? (y/N): ');

    if (changeRegion.toLowerCase() === 'y') {
      console.log('\nAvailable regions:');
      CLOUD_RUN_REGIONS.forEach((region, index) => {
        console.log(`${index + 1}. ${region.name} (${region.location})${region.tier1 ? ' - Tier 1' : ''}`);
      });

      const regionChoice = await question('\nSelect region number (1-6): ');
      const regionIndex = parseInt(regionChoice) - 1;

      if (regionIndex >= 0 && regionIndex < CLOUD_RUN_REGIONS.length) {
        const newRegion = CLOUD_RUN_REGIONS[regionIndex].id;
        await runCommand(`gcloud config set compute/region ${newRegion}`);
        console.log(`\n✅ Region updated to: ${newRegion}`);

        // Update cloudbuild.yaml with new region
        console.log('\nUpdating build configuration...');
        const buildConfigPath = 'cloudbuild.yaml';
        try {
          let buildConfig = await fsPromises.readFile(buildConfigPath, 'utf-8');
          buildConfig = buildConfig.replace(
            /CLOUDSDK_COMPUTE_REGION=.+/g,
            `CLOUDSDK_COMPUTE_REGION=${newRegion}`
          );
          await fsPromises.writeFile(buildConfigPath, buildConfig);
          console.log('✅ Build configuration updated');
  } catch (error) {
          console.error('❌ Error updating build configuration:', error);
        }
      }
    }

    console.log('\n✅ Permission fixes and configuration completed!');
    console.log('\n📋 Next Steps:');
    console.log('1. Use the deployment menu (option 8) to deploy your application');
    console.log('2. Monitor the deployment in the Google Cloud Console');
    console.log(`3. Check Cloud Run logs in region: ${await import('child_process').then(({ execSync }) => 
      execSync('gcloud config get-value compute/region').toString().trim()
    )}`);
    
  } catch (error) {
    console.error('\n❌ Error fixing permissions:', error);
  }
  
  await question('\nPress Enter to continue...');
}

async function manageProjectConfig() {
  console.log('\n=== 🔧 Project Configuration Management ===');
  
  try {
    // Get current project from gcloud
    const { stdout: currentProject } = await import('child_process').then(({ execSync }) => ({
      stdout: execSync('gcloud config get-value project').toString().trim()
    }));

    // Get current region
    const { stdout: currentRegion } = await import('child_process').then(({ execSync }) => ({
      stdout: execSync('gcloud config get-value compute/region || echo "asia-southeast1"').toString().trim()
    }));

    // Load current configuration
    let config;
    try {
      config = await loadProjectConfig();
      console.log('\nCurrent Configuration:');
      console.log('═══════════════════════════════');
      console.log('Project:');
      console.log(`  ID: ${config.project.id}`);
      console.log(`  Name: ${config.project.name}`);
      console.log(`  Description: ${config.project.description}`);
      console.log(`  Region: ${config.project.region}`);
      console.log('\nDeployment:');
      console.log(`  Registry: ${config.deployment.registry}`);
      console.log(`  Staging Service: ${config.deployment.services.staging}`);
      console.log(`  Production Service: ${config.deployment.services.production}`);
  } catch (error) {
      console.log('\n⚠️ No existing configuration found. Creating new configuration...');
      config = {
        project: {
          id: currentProject || 'dogeplot-fun',
          name: 'DOGEPLOT',
          description: 'Department of Government Efficiency - Policy Lens of Truth',
          region: currentRegion
        },
        deployment: {
          registry: 'gcr.io',
          services: {
            staging: 'staging-dogeplot',
            production: 'dogeplot'
          }
        }
      };
    }

    console.log('\nCurrent GCloud Settings:');
    console.log(`Project: ${currentProject || 'Not set'}`);
    console.log(`Region: ${currentRegion || 'Not set'}`);

    if (currentProject && currentProject !== config.project.id) {
      console.log('\n⚠️ Warning: Current project differs from configuration');
    }
    if (currentRegion && currentRegion !== config.project.region) {
      console.log('\n⚠️ Warning: Current region differs from configuration');
    }

    console.log('\nOptions:');
    console.log('1. Update project ID');
    console.log('2. Update project name');
    console.log('3. Update project description');
    console.log('4. Update region');
    console.log('5. Update registry');
    console.log('6. Update service names');
    console.log('7. Sync with current GCloud settings');
    console.log('8. Save current configuration');
    console.log('0. Back to main menu');

    const choice = await question('\nEnter choice: ');

    switch (choice) {
      case '1':
        const newId = await question('Enter new project ID: ');
        config.project.id = newId;
        break;
      case '2':
        const newName = await question('Enter new project name: ');
        config.project.name = newName;
        break;
      case '3':
        const newDesc = await question('Enter new project description: ');
        config.project.description = newDesc;
        break;
      case '4':
        console.log('\nAvailable regions:');
        CLOUD_RUN_REGIONS.forEach((region, index) => {
          console.log(`${index + 1}. ${region.name} (${region.location})${region.tier1 ? ' - Tier 1' : ''}`);
        });
        const regionChoice = await question('\nSelect region number (1-6): ');
        const regionIndex = parseInt(regionChoice) - 1;
        if (regionIndex >= 0 && regionIndex < CLOUD_RUN_REGIONS.length) {
          config.project.region = CLOUD_RUN_REGIONS[regionIndex].id;
        }
        break;
      case '5':
        const newRegistry = await question('Enter new registry (default: gcr.io): ');
        config.deployment.registry = newRegistry || 'gcr.io';
        break;
      case '6':
        const newStaging = await question('Enter new staging service name: ');
        const newProd = await question('Enter new production service name: ');
        if (newStaging) config.deployment.services.staging = newStaging;
        if (newProd) config.deployment.services.production = newProd;
        break;
      case '7':
        if (currentProject) config.project.id = currentProject;
        if (currentRegion) config.project.region = currentRegion;
        console.log('\n✅ Configuration synced with GCloud settings');
        break;
      case '8':
        await updateProjectConfig(config);
        console.log('\n✅ Configuration saved successfully');
        break;
      case '0':
      return;
    }
    
    // Save changes if any were made
    if (choice !== '0') {
      await updateProjectConfig(config);
      console.log('\n✅ Configuration updated successfully');
    }

  } catch (error) {
    console.error('\n❌ Error managing project configuration:', error);
  }
  
  await question('\nPress Enter to continue...');
}

// Add global type declarations
declare global {
  var supabase: ReturnType<typeof createClient<Database>>;
}

async function main() {
  const envManager = EnvironmentManager.getInstance();
  
  while (true) {
    await showMenu();
    const choice = await question('Enter your choice: ');

    try {
      switch (choice.toLowerCase()) {
        case 's':
          if (envManager.getCurrentEnvironment() !== 'staging') {
            console.log('\nSwitching to Staging environment...');
            await envManager.switchEnvironment('staging');
            console.log('✅ Now using Staging environment');
          }
          break;

        case 'p':
          const confirmProd = await question('\n⚠️ Switch to Production environment? This affects real data! (yes/NO): ');
          if (confirmProd.toLowerCase() === 'yes' && envManager.getCurrentEnvironment() !== 'production') {
            console.log('\nSwitching to Production environment...');
            await envManager.switchEnvironment('production');
            console.log('🚨 Now using Production environment');
          }
          break;

        case '1a':
          console.log('\nRunning normal sync...');
          await runCommand(`cross-env VITE_MODE=${envManager.getCurrentEnvironment()} npm run sync:bills:congressapi`);
          break;

        case '1b':
          console.log('\nRunning force sync...');
          await runCommand(`cross-env VITE_MODE=${envManager.getCurrentEnvironment()} npm run sync:bills:congressapi:force`);
          break;

        case '1c':
          console.log('\nRunning force sync with PDF storage...');
          await runCommand(`cross-env VITE_MODE=${envManager.getCurrentEnvironment()} npm run sync:bills:congressapi:force:save-pdfs`);
          break;

        case '1d':
          await handleCustomSync();
          break;

        case '1e':
          await listFailedBills();
          break;

        case '1f':
          await retryFailedBills();
          break;

        case '2a':
          console.log('\nRunning OCR on bills without text...');
          await runCommand('npm run ocr:bills');
          break;

        case '2b':
          await handleForceOCR();
          break;

        case '2c':
          await batchOcrProcessing();
          break;

        case '3a':
          console.log('\nRunning bill analysis...');
          await runCommand('npm run analyze:bills');
          break;

        case '3b':
          console.log('\nRunning forced bill analysis...');
          await runCommand('npm run analyze:bills:force');
          break;

        case '4a':
          const confirmReset = await question(`\n⚠️ WARNING: This will completely reset the ${envManager.getCurrentEnvironment().toUpperCase()} database. All data will be lost. Are you sure? (yes/NO): `);
          if (confirmReset.toLowerCase() === 'yes') {
            console.log(`\nResetting ${envManager.getCurrentEnvironment().toUpperCase()} database...`);
            await runCommand(`cross-env VITE_MODE=${envManager.getCurrentEnvironment()} npm run db:new`);
          }
          break;

        case '4b':
          const confirmUpdate = await question(`\n⚠️ This will apply updates to the ${envManager.getCurrentEnvironment().toUpperCase()} database. Continue? (yes/NO): `);
          if (confirmUpdate.toLowerCase() === 'yes') {
            console.log(`\nUpdating ${envManager.getCurrentEnvironment().toUpperCase()} database...`);
            await runCommand(`cross-env VITE_MODE=${envManager.getCurrentEnvironment()} npm run db:update`);
          }
          break;
        
        case '4c':
          console.log(`\nBacking up ${envManager.getCurrentEnvironment().toUpperCase()} database...`);
          await backupDatabase();
          break;
        
        case '4d':
          console.log(`\nCleaning orphaned PDFs in ${envManager.getCurrentEnvironment().toUpperCase()} database...`);
          await cleanOrphanedPDFs();
          break;
        
        case '4e':
          console.log(`\nRestoring to ${envManager.getCurrentEnvironment().toUpperCase()} database...`);
          await restoreDatabase();
          break;
        
        case '5a':
          await showDatabaseStats();
          break;
        
        case '5b':
          await showStorageUsage();
          break;
        
        case '5c':
          await showBillsWithoutText();
          break;
        
        case '5d':
          await verifyPdfLinks();
          break;
        
        case '6a':
        case '6b':
        case '6c':
        case '6d':
          await handleSearchAndDebug();
          break;

        case '7a':
        case '7b':
        case '7c':
        case '7d':
        case '7e':
        case '7f':
          await handleVectorAndSemanticSearch();
          break;

        case '8a':
        case '8b':
        case '8c':
        case '8d':
        case '8e':
        case '8f':
        case '8g':
        case '8h':
          await handleServerOperations();
          break;

        case '9a':
        case '9b':
        case '9c':
          await handleDeployment();
          break;
          
        case '9d':
          await simpleStaging();
          break;
          
        case '9e':
          await simpleProduction();
          break;
          
        case '9f':
          await legacyDeployment();
          break;
          
        case '9g':
          await linkBillingAccount();
          break;
          
        case '9h':
          await setupProjectForDeployment();
          break;

        case '9i':
          await fixGCloudPermissions();
          break;

        case '9j':
          await manageProjectConfig();
          break;

        case '8i':
          await manageCustomDomain();
          break;

        case '0':
          await runBasicApp();
          break;

        case '6ia':
          await setupVectorTable();
          break;

        case '6ib':
          await generateAllEmbeddings();
          break;

        case '6ic':
          await generateRecentEmbeddings();
          break;

        case '6id':
          await checkVectorStats();
          break;

        case '6ie':
          await semanticSearch();
          break;

        case '6if':
          await findSimilarBills();
          break;

        case '6if':
          console.log('\nFinding similar bills...');
          await findSimilarBills();
          break;
          
        case '7a':
        case '7b':
        case '7c':
        case '7d':
        case '7e':
        case '7f':
        case '7g':
          await handleServerOperations();
          break;

        default:
          console.log('\nInvalid choice. Press Enter to continue...');
          await question('');
      }
    } catch (error) {
      if (error?.message?.includes('SIGINT')) {
        console.log('\nProcess interrupted');
      } else {
        console.error('\nError:', error);
      }
      await question('\nPress Enter to continue...');
    }
  }
}

async function syncBillsWithoutPdfLinks() {
  console.log('\nFetching bills without PDF links...');
  
  const { data: bills } = await supabase
    .from('bills')
    .select('*')
    .is('pdf_url', null)
    .order('congress', { ascending: false });
    
  if (!bills?.length) {
    console.log('No bills found without PDF links.');
    await question('\nPress Enter to continue...');
    return;
  }
  
  console.log(`Found ${bills.length} bills without PDF links`);
  const proceed = await question('Proceed with sync? (y/N): ');
  
  if (proceed.toLowerCase() !== 'y') return;
  
  let updatedCount = 0;
  let errorCount = 0;
  
  for (const bill of bills) {
    try {
      process.stdout.write(`\rProcessing bill ${++updatedCount}/${bills.length}...`);
      
      // Construct PDF URL based on bill info
      const pdfUrl = `https://www.congress.gov/117/bills/${bill.bill_type}${bill.bill_number}/${bill.bill_type}${bill.bill_number}.pdf`;
      
      // Verify PDF exists
      const response = await axios.head(pdfUrl);
      if (response.status === 200) {
        // Update bill with PDF URL
        await supabase
          .from('bills')
          .update({ pdf_url: pdfUrl })
          .eq('id', bill.id);
      }
    } catch (error) {
      errorCount++;
    }
  }
  
  console.log(`\n\nUpdated ${updatedCount - errorCount} bills`);
  console.log(`Failed: ${errorCount} bills`);
  
  await question('\nPress Enter to continue...');
}

// Cloud Run Service Management
async function listCloudRunServices() {
  console.log('\n=== Cloud Run Services ===');
  await runCommand('gcloud run services list');
  await question('\nPress Enter to continue...');
}

async function deleteCloudRunService() {
  console.log('\n=== Delete Cloud Run Service ===');
  const serviceName = await question('Enter service name to delete: ');
  const region = await question('Enter region (default: asia-southeast1): ') || 'asia-southeast1';
  
  const confirm = await question(`\n⚠️ Are you sure you want to delete ${serviceName}? (yes/NO): `);
  if (confirm.toLowerCase() !== 'yes') return;
  
  await runCommand(`gcloud run services delete ${serviceName} --region=${region} --platform=managed`);
}

async function deleteDeploymentHistoryEntry() {
  const histories = await listDeploymentHistory();
  
  if (histories.length === 0) {
    await question('\nPress Enter to continue...');
    return;
  }
  
  const selection = await question('\nEnter number to delete (or 0 to cancel): ');
  const index = parseInt(selection) - 1;
  
  if (selection === '0' || index < 0 || index >= histories.length) {
    console.log('Deletion cancelled.');
    return;
  }
  
  const confirm = await question(`\nAre you sure you want to delete this entry? (yes/NO): `);
  if (confirm.toLowerCase() !== 'yes') return;
  
  histories.splice(index, 1);
  await fsPromises.writeFile(
    path.join('deployments', 'history.json'),
    JSON.stringify(histories, null, 2)
  );
  
  console.log('Entry deleted successfully');
  await question('\nPress Enter to continue...');
}

// Docker Image Management
async function listDockerImages() {
  console.log('\n=== Docker Images ===');
  await runCommand('gcloud container images list');
  await question('\nPress Enter to continue...');
}

async function deleteDockerImage() {
  console.log('\n=== Delete Docker Image ===');
  const imageUrl = await question('Enter image URL to delete: ');
  
  const confirm = await question(`\n⚠️ Are you sure you want to delete ${imageUrl}? (yes/NO): `);
  if (confirm.toLowerCase() !== 'yes') return;
  
  await runCommand(`gcloud container images delete ${imageUrl} --force-delete-tags`);
}

// Google Cloud Account Management
async function switchGCloudAccount() {
  console.log('\n=== Switch Google Cloud Account ===');
  await runCommand('gcloud auth login');
}

async function showCurrentGCloudAccount() {
  console.log('\n=== Current Google Cloud Account ===');
  await runCommand('gcloud config get-value account');
  await question('\nPress Enter to continue...');
}

async function listGCloudAccounts() {
  console.log('\n=== Google Cloud Accounts ===');
  await runCommand('gcloud auth list');
  await question('\nPress Enter to continue...');
}

async function listGCloudProjects() {
  console.log('\n=== Google Cloud Projects ===');
  await runCommand('gcloud projects list');
  await question('\nPress Enter to continue...');
}

async function createGCloudProject() {
  console.log('\n=== Create Google Cloud Project ===');
  const projectId = await question('Enter new project ID: ');
  await runCommand(`gcloud projects create ${projectId}`);
}

async function deleteGCloudProject() {
  console.log('\n=== Delete Google Cloud Project ===');
  const projectId = await question('Enter project ID to delete: ');
  
  const confirm = await question(`\n⚠️ Are you sure you want to delete project ${projectId}? (yes/NO): `);
  if (confirm.toLowerCase() !== 'yes') return;
  
  await runCommand(`gcloud projects delete ${projectId}`);
}

async function linkBillingAccount() {
  console.log('\n=== Link Billing Account ===');
  
  // List available billing accounts
  console.log('\nAvailable billing accounts:');
  await runCommand('gcloud billing accounts list');
  
  const billingAccount = await question('\nEnter billing account ID: ');
  const projectId = await question('Enter project ID: ');
  
  await runCommand(
    `gcloud billing projects link ${projectId} --billing-account=${billingAccount}`
  );
}

async function setupProjectForDeployment() {
  console.log('\n=== Setup Project for Deployment ===');
  
  // Enable required APIs
  console.log('\nEnabling required APIs...');
  const apis = [
    'cloudbuild.googleapis.com',
    'run.googleapis.com',
    'containerregistry.googleapis.com'
  ];
  
  for (const api of apis) {
    await runCommand(`gcloud services enable ${api}`);
  }
  
  console.log('\n✅ Project setup complete');
  await question('\nPress Enter to continue...');
}

// Add these functions before the main() function:
async function listFailedBills() {
  console.log('\n=== Failed Bills ===');
  
  const { data: failedBills, error } = await supabase
    .from('failed_bills')
    .select('*')
    .order('last_retry', { ascending: false });
    
  if (error) {
    console.error('Error fetching failed bills:', error);
    return;
  }
  
  if (!failedBills?.length) {
    console.log('No failed bills found.');
    await question('\nPress Enter to continue...');
    return;
  }
  
  console.log(`\nFound ${failedBills.length} failed bills:`);
  failedBills.forEach((bill, index) => {
    console.log(`\n${index + 1}. ${bill.bill_type}${bill.bill_number} (Congress ${bill.congress})`);
    console.log(`   Failed: ${new Date(bill.created_at).toLocaleString()}`);
    console.log(`   Last Retry: ${bill.last_retry ? new Date(bill.last_retry).toLocaleString() : 'Never'}`);
    console.log(`   Retry Count: ${bill.retry_count}`);
    console.log(`   Error: ${bill.error_message}`);
  });
  
  await question('\nPress Enter to continue...');
}

async function retryFailedBills() {
  console.log('\n=== Retry Failed Bills ===');
  
  const { data: failedBills, error } = await supabase
    .from('failed_bills')
    .select('*')
    .order('last_retry', { ascending: true });
    
  if (error) {
    console.error('Error fetching failed bills:', error);
    return;
  }
  
  if (!failedBills?.length) {
    console.log('No failed bills to retry.');
    await question('\nPress Enter to continue...');
    return;
  }
  
  console.log(`Found ${failedBills.length} failed bills.`);
  const retryAll = await question('Retry all failed bills? (y/N): ');
  
  if (retryAll.toLowerCase() === 'y') {
    console.log('\nRetrying all failed bills...');
    for (const bill of failedBills) {
      try {
        console.log(`\nRetrying ${bill.bill_type}${bill.bill_number} (Congress ${bill.congress})...`);
        
        // Run sync command for this specific bill
        await runCommand(
          `npm run sync:bills:congressapi -- --congress=${bill.congress} ` +
          `--bill-type=${bill.bill_type} --bill-number=${bill.bill_number}`
        );
        
        // If successful, remove from failed_bills
        await supabase
          .from('failed_bills')
          .delete()
          .match({ id: bill.id });
          
        console.log('✅ Successfully processed');
        
      } catch (error) {
        console.error('❌ Failed to process:', error);
        
        // Update retry count and timestamp
        await supabase
          .from('failed_bills')
          .update({
            retry_count: bill.retry_count + 1,
            last_retry: new Date().toISOString(),
            error_message: error.message
          })
          .match({ id: bill.id });
      }
    }
  } else {
    // Show list and let user select which to retry
    failedBills.forEach((bill, index) => {
      console.log(`\n${index + 1}. ${bill.bill_type}${bill.bill_number} (Congress ${bill.congress})`);
      console.log(`   Failed: ${new Date(bill.created_at).toLocaleString()}`);
      console.log(`   Retry Count: ${bill.retry_count}`);
    });
    
    const selection = await question('\nEnter bill number to retry (or 0 to cancel): ');
    const index = parseInt(selection) - 1;
    
    if (selection === '0' || index < 0 || index >= failedBills.length) {
      console.log('Retry cancelled.');
      return;
    }
    
    const bill = failedBills[index];
    try {
      console.log(`\nRetrying ${bill.bill_type}${bill.bill_number}...`);
      
      // Run sync command for this specific bill
      await runCommand(
        `npm run sync:bills:congressapi -- --congress=${bill.congress} ` +
        `--bill-type=${bill.bill_type} --bill-number=${bill.bill_number}`
      );
      
      // If successful, remove from failed_bills
      await supabase
        .from('failed_bills')
        .delete()
        .match({ id: bill.id });
        
      console.log('✅ Successfully processed');
      
    } catch (error) {
      console.error('❌ Failed to process:', error);
      
      // Update retry count and timestamp
      await supabase
        .from('failed_bills')
        .update({
          retry_count: bill.retry_count + 1,
          last_retry: new Date().toISOString(),
          error_message: error.message
        })
        .match({ id: bill.id });
    }
  }
  
  await question('\nPress Enter to continue...');
}

async function manageCustomDomain() {
  console.log('\n=== 🌐 Advanced Domain Management System ===');
  
  // Load project configuration first
  const config = await loadProjectConfig();
  const region = config.project.region || 'asia-southeast1';

  console.log('\n📡 Available Domain Management Methods:');
  console.log('1) Global Load Balancer Setup (recommended for production)');
  console.log('   - SSL termination at the edge');
  console.log('   - Global CDN and caching');
  console.log('   - DDoS protection');
  console.log('   - Multi-region support');
  console.log('\n2) Direct Domain Mapping (simpler setup)');
  console.log('   - Single region');
  console.log('   - Managed SSL certificates');
  console.log('   - Quick setup');
  console.log('\n3) List Current Domain Configurations');
  console.log('4) Remove Domain Configuration');
  console.log('5) 🔧 Auto-Fix Domain Setup (Cloudflare + Google Cloud)');
  console.log('0) Back to main menu');

  const choice = await question('\n🔧 Select option (0-5): ');

  switch (choice) {
    case '1':
      await setupLoadBalancer(region);
      break;
    case '2':
      await setupDirectDomainMapping(region);
      break;
    case '3':
      await listAllDomainConfigs(region);
      break;
    case '4':
      await removeDomainConfig(region);
      break;
    case '5':
      await autoFixDomainSetup(region);
      break;
    case '0':
      return;
    default:
      console.log('Invalid option');
  }
}

async function autoFixDomainSetup(region: string) {
  console.log('\n=== 🔧 Automated Domain Setup and Fix ===');
  console.log('This will configure both Google Cloud and provide Cloudflare settings');

  // Get service and domain details
  console.log('\nAvailable services:');
  console.log('1) staging-dogeplot (Staging)');
  console.log('2) dogeplot (Production)');
  
  const serviceChoice = await question('\nSelect service (1/2): ');
  const service = serviceChoice === '1' ? 'staging-dogeplot' : 'dogeplot';
  const domain = await question('\nEnter your domain (e.g., dogeplot.fun): ');
  
  if (!domain) {
    console.log('Operation cancelled');
    return;
  }

  try {
    console.log('\n🔄 Step 1: Cleaning up existing configurations...');
    // Delete existing domain mapping if any
    try {
      await runCommand(
        `gcloud beta run domain-mappings delete ` +
        `--domain=${domain} ` +
        `--region=${region} ` +
        `--platform=managed ` +
        `--quiet`
      );
      console.log('✅ Existing domain mapping removed');
    } catch (error) {
      console.log('No existing domain mapping found');
    }

    // Delete existing certificate if any
    try {
      await runCommand(
        `gcloud certificate-manager certificates delete ${service}-cert ` +
        `--quiet`
      );
      console.log('✅ Existing certificate removed');
    } catch (error) {
      console.log('No existing certificate found');
    }

    console.log('\n🔄 Step 2: Creating DNS authorization...');
    await runCommand(
      `gcloud certificate-manager dns-authorizations create ${service}-auth ` +
      `--domain=${domain}`
    );

    // Get the DNS records
    const { stdout: dnsAuth } = await import('child_process').then(({ execSync }) => ({
      stdout: execSync(
        `gcloud certificate-manager dns-authorizations describe ${service}-auth ` +
        `--format="get(dnsResourceRecord)"`
      ).toString()
    }));

    const dnsRecords = JSON.parse(dnsAuth);

    console.log('\n📝 Required Cloudflare DNS Settings:');
    console.log('\n1. ACME Challenge Record (Important: Set to DNS only/gray cloud):');
    console.log(`Type: ${dnsRecords.type}`);
    console.log(`Name: ${dnsRecords.name.replace(`.${domain}.`, '')}`);
    console.log(`Content: ${dnsRecords.data}`);
    console.log('Proxy status: ❌ DNS only (gray cloud)');

    console.log('\n2. A Records (Set to Proxied/orange cloud):');
    const aRecords = [
      '216.239.32.21',
      '216.239.34.21',
      '216.239.36.21',
      '216.239.38.21'
    ];
    aRecords.forEach(ip => {
      console.log(`Type: A`);
      console.log(`Name: @ (or ${domain})`);
      console.log(`Content: ${ip}`);
      console.log('Proxy status: ✅ Proxied (orange cloud)');
      console.log('');
    });

    console.log('\n3. Cloudflare SSL/TLS Settings:');
    console.log('a) Set SSL/TLS encryption mode to "Full (strict)"');
    console.log('b) Disable Universal SSL');
    console.log('c) Under Edge Certificates:');
    console.log('   - Enable "Always Use HTTPS"');
    console.log('   - Enable "Automatic HTTPS Rewrites"');

    console.log('\n4. Cloudflare Page Rules:');
    console.log(`URL: ${domain}/*`);
    console.log('Settings:');
    console.log('- SSL: Full');
    console.log('- Always Use HTTPS: On');
    console.log('- Cache Level: Cache Everything');
    console.log('- Edge Cache TTL: 2 hours');

    const proceed = await question('\nHave you configured these DNS settings in Cloudflare? (yes/no): ');
    if (proceed.toLowerCase() !== 'yes') {
      console.log('Please configure the DNS settings and run this option again.');
      return;
    }

    console.log('\n🔄 Step 3: Creating managed certificate...');
    await runCommand(
      `gcloud certificate-manager certificates create ${service}-cert ` +
      `--domains=${domain}`
    );

    console.log('\n🔄 Step 4: Creating domain mapping...');
    await runCommand(
      `gcloud beta run domain-mappings create ` +
      `--service=${service} ` +
      `--domain=${domain} ` +
      `--region=${region} ` +
      `--platform=managed`
    );

    console.log('\n✅ Domain setup completed!');
    console.log('\n⏳ Next steps:');
    console.log('1. Wait for DNS propagation (5-10 minutes)');
    console.log('2. Wait for SSL certificate provisioning (15-30 minutes)');
    console.log('\n🔍 Monitor status with:');
    console.log(`gcloud beta run domain-mappings describe --domain=${domain} --region=${region} --platform=managed`);

    // Set up monitoring
    const monitor = await question('\nWould you like to monitor the status? (y/N): ');
    if (monitor.toLowerCase() === 'y') {
      console.log('\nMonitoring status (press Ctrl+C to stop)...');
      while (true) {
        console.clear();
        console.log(`\n=== Status Monitor for ${domain} ===`);
        
        // Check certificate status
        const { stdout: certStatus } = await import('child_process').then(({ execSync }) => ({
          stdout: execSync(
            `gcloud certificate-manager certificates describe ${service}-cert ` +
            `--format="get(managed.state)"`
          ).toString().trim()
        }));
        console.log(`\nCertificate Status: ${certStatus}`);

        // Check domain mapping status
        const { stdout: mappingStatus } = await import('child_process').then(({ execSync }) => ({
          stdout: execSync(
            `gcloud beta run domain-mappings describe ` +
            `--domain=${domain} ` +
            `--region=${region} ` +
            `--platform=managed ` +
            `--format="get(status.conditions[?(@.type=='Ready')].status)"`
          ).toString().trim()
        }));
        console.log(`Domain Mapping Status: ${mappingStatus}`);

        if (certStatus === 'ACTIVE' && mappingStatus === 'True') {
          console.log('\n✅ Setup completed successfully!');
          break;
        }

        console.log('\nChecking again in 30 seconds...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

  } catch (error) {
    console.error('\n❌ Error during domain setup:', error.message);
    console.log('\n🔧 Troubleshooting steps:');
    console.log('1. Verify Cloudflare DNS settings');
    console.log('2. Check Google Cloud permissions');
    console.log('3. Ensure domain ownership is verified');
    console.log('4. Try running the setup again');
  }

  await question('\nPress Enter to continue...');
}

async function setupLoadBalancer(region: string) {
  console.log('\n=== 🌍 Global Load Balancer Setup ===');
  
  // Get service details
  console.log('\nAvailable services:');
  console.log('1) staging-dogeplot (Staging)');
  console.log('2) dogeplot (Production)');
  
  const serviceChoice = await question('\nSelect service (1/2): ');
  const service = serviceChoice === '1' ? 'staging-dogeplot' : 'dogeplot';
  const domain = await question('\nEnter your domain (e.g., dogeplot.fun): ');
  
  if (!domain) {
    console.log('Operation cancelled');
    return;
  }

  console.log('\n🔄 Setting up Global Load Balancer...');
  console.log('This is a multi-step process. Please wait...\n');

  try {
    // Step 1: Create a serverless NEG
    console.log('Step 1/7: Creating serverless NEG...');
    await runCommand(
      `gcloud compute network-endpoint-groups create ${service}-neg ` +
      `--region=${region} ` +
      `--network-endpoint-type=serverless ` +
      `--cloud-run-service=${service}`
    );

    // Step 2: Create external IP address
    console.log('\nStep 2/7: Reserving external IP address...');
    await runCommand(
      `gcloud compute addresses create ${service}-ip ` +
      `--network-tier=PREMIUM ` +
      `--global`
    );

    // Get the reserved IP
    const { stdout: ipAddress } = await import('child_process').then(({ execSync }) => ({
      stdout: execSync(`gcloud compute addresses describe ${service}-ip --global --format="get(address)"`).toString().trim()
    }));

    // Step 3: Create backend service
    console.log('\nStep 3/7: Creating backend service...');
    await runCommand(
      `gcloud compute backend-services create ${service}-backend ` +
      `--global ` +
      `--enable-cdn ` +
      `--connection-draining-timeout=0`
    );

    // Step 4: Add NEG to backend service
    console.log('\nStep 4/7: Adding NEG to backend service...');
    await runCommand(
      `gcloud compute backend-services add-backend ${service}-backend ` +
      `--global ` +
      `--network-endpoint-group=${service}-neg ` +
      `--network-endpoint-group-region=${region}`
    );

    // Step 5: Create URL map
    console.log('\nStep 5/7: Creating URL map...');
    await runCommand(
      `gcloud compute url-maps create ${service}-urlmap ` +
      `--default-service=${service}-backend`
    );

    // Step 6: Create SSL certificate
    console.log('\nStep 6/7: Creating SSL certificate...');
    await runCommand(
      `gcloud compute ssl-certificates create ${service}-cert ` +
      `--domains=${domain} ` +
      `--global`
    );

    // Step 7: Create HTTPS proxy
    console.log('\nStep 7/7: Creating HTTPS proxy...');
    await runCommand(
      `gcloud compute target-https-proxies create ${service}-https-proxy ` +
      `--url-map=${service}-urlmap ` +
      `--ssl-certificates=${service}-cert`
    );

    // Final step: Create forwarding rule
    console.log('\nCreating forwarding rule...');
    await runCommand(
      `gcloud compute forwarding-rules create ${service}-https-forwarding-rule ` +
      `--address=${ipAddress} ` +
      `--global ` +
      `--target-https-proxy=${service}-https-proxy ` +
      `--ports=443`
    );

    console.log('\n✅ Load Balancer setup complete!');
    console.log('\n📝 DNS Configuration Required:');
    console.log(`1. Add an A record for ${domain} pointing to ${ipAddress}`);
    console.log('2. Add the following TXT record for domain verification:');
    console.log(`   Name: ${domain}`);
    console.log('   Type: TXT');
    console.log(`   Value: google-site-verification=[verification-code]`);
    console.log('\n⏳ Please note:');
    console.log('- DNS propagation may take 24-48 hours');
    console.log('- SSL certificate provisioning may take up to 60 minutes');
    console.log('- CDN configuration will optimize automatically based on traffic patterns');

  } catch (error) {
    console.error('\n❌ Error during Load Balancer setup:', error.message);
    console.log('\n🔧 Cleanup Instructions:');
    console.log(`1. gcloud compute forwarding-rules delete ${service}-https-forwarding-rule --global`);
    console.log(`2. gcloud compute target-https-proxies delete ${service}-https-proxy`);
    console.log(`3. gcloud compute ssl-certificates delete ${service}-cert`);
    console.log(`4. gcloud compute url-maps delete ${service}-urlmap`);
    console.log(`5. gcloud compute backend-services delete ${service}-backend --global`);
    console.log(`6. gcloud compute addresses delete ${service}-ip --global`);
    console.log(`7. gcloud compute network-endpoint-groups delete ${service}-neg --region=${region}`);
  }
}

async function setupDirectDomainMapping(region: string) {
  console.log('\n=== 🔗 Direct Domain Mapping Setup ===');
  
  // List available services
  console.log('\nAvailable services:');
  console.log('1) staging-dogeplot (Staging)');
  console.log('2) dogeplot (Production)');
  
  const serviceChoice = await question('\nSelect service (1/2): ');
  const service = serviceChoice === '1' ? 'staging-dogeplot' : 'dogeplot';
  
  const domain = await question('\nEnter your domain (e.g., dogeplot.fun): ');
  
  if (!domain) {
    console.log('Operation cancelled');
    return;
  }

  console.log(`\n🔄 Setting up direct domain mapping for ${domain}...`);

  try {
    // First, check if mapping exists
    console.log('\n🔍 Checking existing mappings...');
    try {
      const { stdout: existingMappings } = await import('child_process').then(({ execSync }) => ({
        stdout: execSync(
          `gcloud beta run domain-mappings list ` +
          `--region=${region} ` +
          `--platform=managed ` +
          `--format="table(DOMAIN,SERVICE)" | cat`
        ).toString()
      }));

      const mappingExists = existingMappings.toLowerCase().includes(domain.toLowerCase());
      
      if (mappingExists) {
        console.log('\n⚠️ Domain mapping already exists.');
        const forceOverride = await question('Would you like to delete existing mapping and create new one? (Y/n): ');
        
        if (forceOverride.toLowerCase() !== 'n') {
          console.log('\n🔄 Deleting existing domain mapping...');
          await runCommand(
            `gcloud beta run domain-mappings delete ` +
            `--domain ${domain} ` +
            `--region ${region} ` +
            `--platform managed ` +
            `--quiet`
          );
          
          // Wait a moment for the deletion to complete
          console.log('Waiting for deletion to complete...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          console.log('\n🚀 Creating new domain mapping...');
          await runCommand(
            `gcloud beta run domain-mappings create ` +
            `--service ${service} ` +
            `--domain ${domain} ` +
            `--region ${region} ` +
            `--platform managed`
          );
        } else {
          console.log('\nOperation cancelled - existing mapping preserved.');
          return;
        }
      } else {
        // Create new mapping
        console.log('\n🚀 Creating new domain mapping...');
        await runCommand(
          `gcloud beta run domain-mappings create ` +
          `--service ${service} ` +
          `--domain ${domain} ` +
          `--region ${region} ` +
          `--platform managed`
        );
      }

      // Get the DNS records
      console.log('\n📝 Fetching DNS records...');
      const { stdout: records } = await import('child_process').then(({ execSync }) => ({
        stdout: execSync(
          `gcloud beta run domain-mappings describe --domain=${domain} ` +
          `--region=${region} --platform=managed ` +
          `--format="get(status.resourceRecords)"`
        ).toString().trim()
      }));

      console.log('\n✅ Domain mapping created/updated successfully!');
      console.log('\n📝 Required DNS Configuration:');
      console.log(records);
      console.log('\n⚠️ Important: Domain Verification Required');
      console.log('1. Go to Google Cloud Console > Security > Domain Verification');
      console.log('2. Click "Add Domain" and add your domain');
      console.log('3. Get the TXT record value from the console');
      console.log('4. Add the TXT record to your DNS settings');
      console.log('\n⏳ Next Steps:');
      console.log('1. Add the above DNS records to your domain provider');
      console.log('2. Wait for DNS propagation (24-48 hours)');
      console.log('3. SSL certificate will be automatically provisioned');
      console.log('4. Your domain will be ready in about 15-30 minutes after DNS propagation');
      console.log('\n💡 Cloudflare Settings:');
      console.log('1. Set SSL/TLS encryption mode to "Full (strict)"');
      console.log('2. Enable "Always Use HTTPS"');
      console.log('3. Set the proxy status (orange cloud) to enabled');

    } catch (error) {
      if (error.message.includes('PERMISSION_DENIED')) {
        console.error('\n❌ Permission denied. Please make sure you have the necessary permissions.');
        console.log('Run: gcloud auth login');
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error('\n❌ Error managing domain mapping:', error.message);
    if (error.message.includes('PERMISSION_DENIED')) {
      console.log('\n📝 Try running: gcloud auth login');
    }
  }
}

async function listAllDomainConfigs(region: string) {
  console.log('\n=== 📋 Domain Configurations ===');

  try {
    // List Load Balancer configurations
    console.log('\n🌐 Load Balancer Configurations:');
    console.log('═══════════════════════════════');
    
    try {
      const { stdout: forwardingRules } = await import('child_process').then(({ execSync }) => ({
        stdout: execSync('gcloud compute forwarding-rules list --format="table(name,IPAddress,target)"').toString()
      }));
      console.log(forwardingRules || 'No load balancer configurations found');
    } catch (error) {
      console.log('No load balancer configurations found');
    }

    // List Direct Domain Mappings
    console.log('\n🔗 Direct Domain Mappings:');
    console.log('═══════════════════════════════');
    
    try {
      // Get domain mappings with full details
      const { stdout: mappings } = await import('child_process').then(({ execSync }) => ({
        stdout: execSync(
          `gcloud beta run domain-mappings list ` +
          `--region ${region} ` +
          `--platform managed ` +
          `--format="json"`
        ).toString()
      }));

      let domains = [];
      try {
        domains = JSON.parse(mappings || '[]');
      } catch (e) {
        console.log('No domain mappings found');
        return;
      }
      
      if (!Array.isArray(domains) || domains.length === 0) {
        console.log('No domain mappings found');
      } else {
        console.log('DOMAIN               SERVICE          STATUS       ');
        console.log('───────────────────────────────────────────────────');
        
        for (const domain of domains) {
          try {
            const status = domain?.status?.conditions?.find(c => c.type === 'Ready');
            const dnsRecords = domain?.status?.resourceRecords || [];
            
            // Determine simple status
            let simpleStatus = '⏳ Pending';
            if (status?.status === 'True') {
              simpleStatus = '✅ Active';
            } else if (status?.status === 'False') {
              simpleStatus = '❌ Failed';
            }

            // Format domain and service with padding (safely)
            const domainPad = (domain?.domain || 'unknown').padEnd(20);
            const servicePad = (domain?.service || 'unknown').padEnd(15);
            
            // Print basic info
            console.log(`${domainPad}${servicePad}${simpleStatus}`);
            
            // Print DNS records if they exist
            if (dnsRecords.length > 0) {
              console.log('   Required DNS Records:');
              const aRecords = dnsRecords.filter(r => r.type === 'A');
              if (aRecords.length > 0) {
                console.log('   - A Records:');
                aRecords.forEach(record => {
                  if (record?.rrdata) {
                    console.log(`     ${record.rrdata}`);
                  }
                });
              }

              const aaaaRecords = dnsRecords.filter(r => r.type === 'AAAA');
              if (aaaaRecords.length > 0) {
                console.log('   - AAAA Records (IPv6):');
                aaaaRecords.forEach(record => {
                  if (record?.rrdata) {
                    console.log(`     ${record.rrdata}`);
                  }
                });
              }
            }

            // Print verification status
            const certStatus = domain?.status?.conditions?.find(c => c.type === 'CertificateProvisioned');
            if (certStatus?.status === 'Unknown' && certStatus?.message) {
              console.log('   ⚠️  ' + certStatus.message);
            }

            // Print any additional important messages
            const readyStatus = domain?.status?.conditions?.find(c => c.type === 'Ready');
            if (readyStatus?.message && readyStatus?.status !== 'True') {
              console.log('   ℹ️  ' + readyStatus.message);
            }

            console.log(''); // Add spacing between domains
          } catch (domainError) {
            console.log(`Error processing domain: ${domainError.message}`);
          }
        }
      }
      
      console.log('\nℹ️ Status Guide:');
      console.log('✅ Active: Domain is configured and working');
      console.log('⏳ Pending: Waiting for DNS or SSL setup');
      console.log('❌ Failed: Domain verification or SSL failed');
      
    } catch (error) {
      if (error?.message?.includes('not found')) {
        console.log('No domain mappings found');
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error listing domain configurations:', error.message);
    console.log('\nTry running: gcloud auth login');
  }

  await question('\nPress Enter to continue...');
}

async function removeDomainConfig(region: string) {
  console.log('\n=== 🗑️ Remove Domain Configuration ===');
  console.log('\nWhat type of configuration do you want to remove?');
  console.log('1) Load Balancer Configuration');
  console.log('2) Direct Domain Mapping');
  console.log('0) Cancel');

  const choice = await question('\nSelect option (0-2): ');

  switch (choice) {
    case '1':
      await removeLoadBalancerConfig(region);
      break;
    case '2':
      await removeDirectDomainMapping(region);
      break;
    case '0':
      return;
    default:
      console.log('Invalid option');
  }
}

async function removeLoadBalancerConfig(region: string) {
  console.log('\n=== 🗑️ Remove Load Balancer Configuration ===');

  try {
    // List existing configurations
    const { stdout: configs } = await import('child_process').then(({ execSync }) => ({
      stdout: execSync('gcloud compute forwarding-rules list --format="table(name,IPAddress,target)"').toString()
    }));
    
    console.log('\nExisting configurations:');
    console.log(configs);

    const name = await question('\nEnter the name of the configuration to remove: ');
    if (!name) return;

    const confirm = await question(`\n⚠️ Are you sure you want to remove ${name}? (yes/NO): `);
    if (confirm.toLowerCase() !== 'yes') return;

    console.log('\n🔄 Removing Load Balancer configuration...');
    
    // Remove components in reverse order
    await runCommand(`gcloud compute forwarding-rules delete ${name}-https-forwarding-rule --global --quiet`);
    await runCommand(`gcloud compute target-https-proxies delete ${name}-https-proxy --quiet`);
    await runCommand(`gcloud compute ssl-certificates delete ${name}-cert --global --quiet`);
    await runCommand(`gcloud compute url-maps delete ${name}-urlmap --quiet`);
    await runCommand(`gcloud compute backend-services delete ${name}-backend --global --quiet`);
    await runCommand(`gcloud compute addresses delete ${name}-ip --global --quiet`);
    await runCommand(`gcloud compute network-endpoint-groups delete ${name}-neg --region=${region} --quiet`);

    console.log('\n✅ Load Balancer configuration removed successfully!');
  } catch (error) {
    console.error('\n❌ Error removing Load Balancer configuration:', error.message);
  }
}

async function removeDirectDomainMapping(region: string) {
  console.log('\n=== 🗑️ Remove Direct Domain Mapping ===');

  try {
    // List current mappings
    console.log('\nCurrent domain mappings:');
    await runCommand(
      `gcloud beta run domain-mappings list ` +
      `--region ${region} ` +
      `--platform managed ` +
      `--format="table(DOMAIN,SERVICE,STATUS)" | cat`
    );

    const domain = await question('\nEnter domain to remove (or press Enter to cancel): ');
    if (!domain) return;

    const confirm = await question(`\n⚠️ Are you sure you want to remove mapping for ${domain}? (yes/NO): `);
    if (confirm.toLowerCase() !== 'yes') return;

    console.log(`\n🔄 Removing domain mapping for ${domain}...`);
    await runCommand(
      `gcloud beta run domain-mappings delete ` +
      `--domain ${domain} ` +
      `--region ${region} ` +
      `--platform managed ` +
      `--quiet`
    );

    console.log('\n✅ Domain mapping removed successfully!');
    console.log('\n📝 Remember to:');
    console.log('1. Remove or update your DNS records');
    console.log('2. Wait for DNS changes to propagate (24-48 hours)');
  } catch (error) {
    console.error('\n❌ Error removing domain mapping:', error.message);
  }
}

// Add these functions after the existing functions

async function setupVectorTable() {
  console.log('\n=== Setting Up Vector Tables ===');
  
  try {
    console.log('Running SQL setup script for vector tables...');
    await runCommand('npx tsx src/db/scripts/setupVectorTables.ts');
    console.log('\n✅ Vector table setup complete!');
    console.log('Note: If you see errors about the vector extension not being available,');
    console.log('you may need to enable it manually in your Supabase dashboard:');
    console.log('  1. Go to your Supabase project dashboard');
    console.log('  2. Navigate to "Database" > "Extensions"');
    console.log('  3. Find "vector" and click "Enable"');
    console.log('  4. Run this setup again after enabling the extension');
  } catch (error) {
    console.error('Error setting up vector tables:', error);
  }
}

async function generateAllEmbeddings() {
  console.log('\n=== Generating Embeddings for All Bills ===');
  
  try {
    const threshold = await question('Enter similarity threshold (0-1, default 0.7): ') || '0.7';
    const matchCount = await question('Enter default match count (default 5): ') || '5';
    
    const command = EnvironmentManager.getInstance().getCurrentEnvironment() === 'production'
      ? `npx tsx src/scripts/generateEmbeddings.ts --production --threshold ${threshold} --match-count ${matchCount}`
      : `npx tsx src/scripts/generateEmbeddings.ts --staging --threshold ${threshold} --match-count ${matchCount}`;
    
    await runCommand(command);
  } catch (error) {
    console.error('Error generating embeddings:', error);
  }
}

async function generateRecentEmbeddings() {
  console.log('\n=== Generating Embeddings for Recent Bills ===');
  
  try {
    const days = await question('Enter number of days to look back: ');
    const threshold = await question('Enter similarity threshold (0-1, default 0.7): ') || '0.7';
    const matchCount = await question('Enter default match count (default 5): ') || '5';
    
    if (!days) {
      console.log('Number of days is required.');
      return;
    }
    
    const command = EnvironmentManager.getInstance().getCurrentEnvironment() === 'production'
      ? `npx tsx src/scripts/generateEmbeddings.ts --production --days-back ${days} --threshold ${threshold} --match-count ${matchCount}`
      : `npx tsx src/scripts/generateEmbeddings.ts --staging --days-back ${days} --threshold ${threshold} --match-count ${matchCount}`;
    
    await runCommand(command);
  } catch (error) {
    console.error('Error generating embeddings:', error);
  }
}

async function checkVectorStats() {
  console.log('\n=== Vector Embeddings Statistics ===');
  
  try {
    const currentEnvironment = EnvironmentManager.getInstance().getCurrentEnvironment();
    await envLoader.load(currentEnvironment);
    
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error(`Missing Supabase credentials for ${currentEnvironment} environment.`);
      return;
    }
    
    console.log(`\nConnecting to Supabase (${currentEnvironment})...`);
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    console.log('Fetching embedding statistics...');
    
    // Get overall count
    const { count, error: countError } = await supabase
      .from('bill_embeddings')
      .select('id', { count: 'exact' });
    
    if (countError) {
      console.error('Error fetching count:', countError.message);
      return;
    }
    
    // Get stats by model and version
    const { data: stats, error: statsError } = await supabase
      .rpc('get_embedding_stats');
    
    if (statsError) {
      console.error('Error fetching stats:', statsError.message);
      return;
    }
    
    console.log(`\n=== Embedding Statistics (${currentEnvironment.toUpperCase()}) ===\n`);
    console.log(`Total embeddings: ${count}`);
    
    console.log('\nBreakdown by model and version:');
    console.log('---------------------------------');
    console.log('Model                    | Version | Count | Avg Threshold | Avg Match Count');
    console.log('--------------------------+---------+-------+---------------+----------------');
    
    if (stats && stats.length > 0) {
      stats.forEach(stat => {
        const modelName = stat.model.padEnd(25);
        const version = String(stat.version).padEnd(8);
        const countStr = String(stat.count).padEnd(6);
        const threshold = (stat.avg_threshold ? stat.avg_threshold.toFixed(2) : '0.70').padEnd(14);
        const matchCount = (stat.avg_match_count ? Math.round(stat.avg_match_count) : 5).toString().padEnd(5);
        
        console.log(`${modelName} | ${version} | ${countStr} | ${threshold} | ${matchCount}`);
      });
    } else {
      console.log('No embedding statistics found.');
    }
    
    // Get total bill count for comparison
    const { count: billCount, error: billCountError } = await supabase
      .from('bills')
      .select('id', { count: 'exact' });
    
    if (!billCountError) {
      const percentage = count && billCount ? Math.round((count / billCount) * 100) : 0;
      console.log(`\nCoverage: ${count}/${billCount} bills (${percentage}%)`);
    }
    
    console.log('\nNotes:');
    console.log('- Higher thresholds result in more selective similar bill matches');
    console.log('- Default threshold is 0.7 (range 0-1)');
    console.log('- Default match count is 5 results');
    
  } catch (error) {
    console.error('Error checking vector stats:', error);
  }
}

async function semanticSearch() {
  console.log('\n=== Semantic Search ===');
  
  try {
    // Choose search type
    console.log('Search type:');
    console.log('1) Search by topic or keywords');
    console.log('2) Search by bill number');
    const searchType = await question('Select option (1/2): ');
    
    if (searchType === '1') {
      // Search by query
      const query = await question('Enter search query: ');
      if (!query) {
        console.log('Search query is required.');
        return;
      }
      
      const threshold = await question('Enter similarity threshold (0-1, default 0.5): ') || '0.5';
      const limit = await question('Enter result limit (default 5): ') || '5';
      const model = await question('Enter model to filter by (leave empty for all): ') || '';
      const version = await question('Enter version to filter by (leave empty for all): ') || '';
      
      let command = EnvironmentManager.getInstance().getCurrentEnvironment() === 'production'
        ? `npx tsx src/scripts/searchVectorEmbeddings.ts --production --query "${query}" --threshold ${threshold} --limit ${limit}`
        : `npx tsx src/scripts/searchVectorEmbeddings.ts --staging --query "${query}" --threshold ${threshold} --limit ${limit}`;
      
      if (model) {
        command += ` --modelFilter "${model}"`;
      }
      
      if (version) {
        command += ` --versionFilter ${version}`;
      }
      
      await runCommand(command);
    } else if (searchType === '2') {
      // Search by bill number
      const billNumber = await question('Enter bill number (e.g., hr1234, s123, hjres45): ');
      if (!billNumber) {
        console.log('Bill number is required.');
        return;
      }
      
      const threshold = await question('Enter similarity threshold (0-1, default 0.5): ') || '0.5';
      const limit = await question('Enter result limit (default 5): ') || '5';
      const model = await question('Enter model to filter by (leave empty for all): ') || '';
      const version = await question('Enter version to filter by (leave empty for all): ') || '';
      
      let command = EnvironmentManager.getInstance().getCurrentEnvironment() === 'production'
        ? `npx tsx src/scripts/searchVectorEmbeddings.ts --production --bill "${billNumber}" --threshold ${threshold} --limit ${limit}`
        : `npx tsx src/scripts/searchVectorEmbeddings.ts --staging --bill "${billNumber}" --threshold ${threshold} --limit ${limit}`;
      
      if (model) {
        command += ` --modelFilter "${model}"`;
      }
      
      if (version) {
        command += ` --versionFilter ${version}`;
      }
      
      await runCommand(command);
    } else {
      console.log('Invalid option.');
    }
  } catch (error) {
    console.error('Error performing semantic search:', error);
  }
}

async function findSimilarBills() {
  console.log('\n=== Find Similar Bills ===');
  
  try {
    // Choose input type
    console.log('Input type:');
    console.log('1) Use bill UUID');
    console.log('2) Use bill number (e.g., hr1234, s123)');
    const inputType = await question('Select option (1/2): ');
    
    let billId = '';
    let billNumber = '';
    
    if (inputType === '1') {
      billId = await question('Enter bill ID (UUID): ');
      if (!billId) {
        console.log('Bill ID is required.');
        return;
      }
    } else if (inputType === '2') {
      billNumber = await question('Enter bill number (e.g., hr1234, s123, hjres45): ');
      if (!billNumber) {
        console.log('Bill number is required.');
        return;
      }
    } else {
      console.log('Invalid option.');
      return;
    }
    
    const threshold = await question('Enter similarity threshold (0-1, default 0.7): ') || '0.7';
    const limit = await question('Enter result limit (default 5): ') || '5';
    const model = await question('Enter model to filter by (leave empty for all): ') || '';
    const version = await question('Enter version to filter by (leave empty for all): ') || '';
    
    let command = '';
    
    if (inputType === '1') {
      command = EnvironmentManager.getInstance().getCurrentEnvironment() === 'production'
        ? `npx tsx src/scripts/searchVectorEmbeddings.ts --production --similar "${billId}" --threshold ${threshold} --limit ${limit}`
        : `npx tsx src/scripts/searchVectorEmbeddings.ts --staging --similar "${billId}" --threshold ${threshold} --limit ${limit}`;
    } else {
      command = EnvironmentManager.getInstance().getCurrentEnvironment() === 'production'
        ? `npx tsx src/scripts/searchVectorEmbeddings.ts --production --bill "${billNumber}" --threshold ${threshold} --limit ${limit}`
        : `npx tsx src/scripts/searchVectorEmbeddings.ts --staging --bill "${billNumber}" --threshold ${threshold} --limit ${limit}`;
    }
    
    if (model) {
      command += ` --modelFilter "${model}"`;
    }
    
    if (version) {
      command += ` --versionFilter ${version}`;
    }
    
    await runCommand(command);
  } catch (error) {
    console.error('Error finding similar bills:', error);
  }
}

// Add this function after one of the other handler functions

async function handleServerOperations() {
  console.log('\n=== Server Operations ===');
  console.log('1. Run Server (Regular Mode)');
  console.log('2. Run Server with Inngest');
  console.log('3. Run Inngest Dev Server (Local)');
  console.log('4. Run Server Legacy Mode (Pre-Hybrid)');
  console.log('5. Install Inngest Dependencies');
  console.log('6. Run Complete Local Dev Environment (Frontend + Server)');
  console.log('7. Debug Server (with --inspect flag)');
  console.log('8. Run COMPLETELY in Legacy Mode (Without Hybrid Approach)');
  console.log('0. Back to Main Menu\n');

  const choice = await question('Enter your choice: ');
  const environment = EnvironmentManager.getInstance().getCurrentEnvironment();

  try {
    switch (choice) {
      case '1':
        console.log(`\n🚀 Starting Server in Regular Mode (${environment})...`);
        if (environment === 'staging') {
          await runCommand('npm run server:staging');
        } else {
          await runCommand('npm run server:production');
        }
        break;
      case '2':
        console.log(`\n🚀 Starting Server with Inngest (${environment})...`);
        console.log('Note: You\'ll need to run the Inngest Dev Server in a separate terminal using Option 3');
        if (environment === 'staging') {
          await runCommand('npm run server:staging:inngest');
        } else {
          await runCommand('npm run server:production:inngest');
        }
        break;
      case '3':
        console.log('\n🚀 Starting Inngest Dev Server...');
        await runCommand('npm run inngest:dev');
        break;
      case '4':
        console.log('\n🚀 Starting Server in Legacy Mode (Pre-Hybrid)...');
        await runCommand('npm run server:legacy');
        break;
      case '5':
        await installInngestDependencies();
        break;
      case '6':
        console.log('\n🚀 Starting Complete Local Dev Environment (Frontend + Server)...');
        console.log('This will start both the frontend dev server and the backend server together.');
        
        if (environment === 'staging') {
          await runCommand('npm run dev:local:staging');
        } else {
          await runCommand('npm run dev:local:production');
        }
        break;
      case '7':
        console.log('\n🚀 Starting Server in Debug Mode...');
        console.log('Connect your debugger to the Node.js process (default port 9229)');
        await runCommand('npm run dev:debug');
        break;
      case '8':
        console.log('\n🚀 Starting COMPLETELY in Legacy Mode...');
        console.log('This will disable ALL hybrid approach features and run with the original implementation.');
        
        if (environment === 'staging') {
          await runCommand('npm run dev:legacy');
        } else {
          await runCommand('npm run dev:legacy:prod');
        }
        break;
      case '0':
        return;
      default:
        console.log('Invalid choice. Please try again.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  await question('\n📌 Press Enter to continue...');
  await handleServerOperations();
}

async function installInngestDependencies() {
  console.log('\n=== Installing Inngest Dependencies ===');
  console.log('This will install the dependencies needed for the hybrid approach.');
  
  const confirm = await question('Do you want to continue? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Installation cancelled.');
    return;
  }
  
  try {
    console.log('\n🔧 Installing Inngest dependencies...');
    await runCommand('npm install inngest @inngest/express');
    
    console.log('\n🔧 Installing Inngest CLI globally...');
    await runCommand('npm install -g inngest-cli');
    
    console.log('\n✅ Dependencies installed successfully!');
  } catch (error) {
    console.error('❌ Error installing dependencies:', error);
  }
  
  await question('\n📌 Press Enter to continue...');
}

async function handleSearchAndDebug() {
  console.log('\n=== Search & Debug ===');
  console.log('1. Search Bill by ID/Number');
  console.log('2. Test PDF Download');
  console.log('3. Advanced Search');
  console.log('4. Export Search Results');
  console.log('0. Back to Main Menu\n');

  const choice = await question('Enter your choice: ');

  try {
    switch (choice) {
      case '1':
        await searchBill();
        break;
      case '2':
        await testPdfDownload();
        break;
      case '3':
        await advancedSearch();
        break;
      case '4':
        console.log('\nUse Advanced Search (option 3) and select export option at the end.');
        await question('\nPress Enter to continue...');
        break;
      case '0':
        return;
      default:
        console.log('Invalid choice. Please try again.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  await question('\n📌 Press Enter to continue...');
  await handleSearchAndDebug();
}

async function handleVectorAndSemanticSearch() {
  console.log('\n=== Vector & Semantic Search ===');
  console.log('1. Setup Vector Tables');
  console.log('2. Generate Embeddings for All Bills');
  console.log('3. Generate Embeddings for Recent Bills');
  console.log('4. Check Vector Database Stats');
  console.log('5. Semantic Search');
  console.log('6. Find Similar Bills');
  console.log('0. Back to Main Menu\n');

  const choice = await question('Enter your choice: ');
  const environment = EnvironmentManager.getInstance().getCurrentEnvironment();

  try {
    switch (choice) {
      case '1':
        console.log('\nSetting up vector tables...');
        await runCommand(`cross-env VITE_MODE=${environment} npx tsx src/scripts/setupVectorTable.ts --${environment}`);
        break;
      case '2':
        console.log('\nGenerating embeddings for all bills...');
        await runCommand(`cross-env VITE_MODE=${environment} npx tsx src/scripts/generateEmbeddings.ts --${environment}`);
        break;
      case '3':
        console.log('\nGenerating embeddings for recent bills...');
        await runCommand(`cross-env VITE_MODE=${environment} npx tsx src/scripts/generateEmbeddings.ts --${environment} --days-back 7`);
        break;
      case '4':
        console.log('\nChecking vector database stats...');
        await runCommand(`cross-env VITE_MODE=${environment} npx tsx src/scripts/checkVectorStats.ts --${environment}`);
        break;
      case '5':
        await semanticSearch();
        break;
      case '6':
        await findSimilarBills();
        break;
      case '0':
        return;
      default:
        console.log('Invalid choice. Please try again.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  await question('\n📌 Press Enter to continue...');
  await handleVectorAndSemanticSearch();
}

async function handleDeployment() {
  console.log('\n=== Deployment ===');
  console.log('1. Deploy Frontend & Server to Staging');
  console.log('2. Deploy Frontend & Server to Production');
  console.log('3. Deploy with App Engine (Alternative)');
  console.log('4. Simple Staging Deployment (Without Docker)');
  console.log('5. Simple Production Deployment (Without Docker)');
  console.log('0. Back to Main Menu\n');

  const choice = await question('Enter your choice: ');
  const environment = EnvironmentManager.getInstance().getCurrentEnvironment();

  try {
    switch (choice) {
      case '1':
        console.log('\n🚀 Deploying to Staging with Docker...');
        // First build the application
        await runCommand('npm run build');
        
        // Get project ID
        console.log('\n🔍 Getting Google Cloud project ID...');
        const projectId = await runCommand('gcloud config get-value project', { returnOutput: true }) as string;
        
        if (!projectId || projectId.trim() === '') {
          console.error('❌ No Google Cloud project ID found. Please set a project with: gcloud config set project YOUR_PROJECT_ID');
          break;
        }
        
        console.log(`\n📦 Building and deploying Docker image for staging...`);
        
        // Build and push Docker image
        const imageTag = `gcr.io/${projectId.trim()}/bill-tracker:staging-${Date.now()}`;
        await runCommand(`docker build -t ${imageTag} .`);
        await runCommand(`docker push ${imageTag}`);
        
        // Deploy to Cloud Run
        await runCommand(`gcloud run deploy bill-tracker-staging \
          --image=${imageTag} \
          --platform=managed \
          --region=us-central1 \
          --set-env-vars=VITE_MODE=staging \
          --allow-unauthenticated`);
        
        console.log('\n✅ Staging deployment complete!');
        console.log('URL: https://bill-tracker-staging-{hash}.a.run.app');
        break;
        
      case '2':
        console.log('\n🚀 Deploying to Production...');
        const confirm = await question('⚠️ Are you sure you want to deploy to PRODUCTION? (y/N): ');
        if (confirm.toLowerCase() === 'y') {
          // First build the application
          await runCommand('npm run build');
          
          // Get project ID
          console.log('\n🔍 Getting Google Cloud project ID...');
          const prodProjectId = await runCommand('gcloud config get-value project', { returnOutput: true }) as string;
          
          if (!prodProjectId || prodProjectId.trim() === '') {
            console.error('❌ No Google Cloud project ID found. Please set a project with: gcloud config set project YOUR_PROJECT_ID');
            break;
          }
          
          console.log(`\n📦 Building and deploying Docker image for production...`);
          
          // Build and push Docker image
          const prodImageTag = `gcr.io/${prodProjectId.trim()}/bill-tracker:production-${Date.now()}`;
          await runCommand(`docker build -t ${prodImageTag} .`);
          await runCommand(`docker push ${prodImageTag}`);
          
          // Deploy to Cloud Run
          await runCommand(`gcloud run deploy bill-tracker-production \
            --image=${prodImageTag} \
            --platform=managed \
            --region=us-central1 \
            --set-env-vars=VITE_MODE=production \
            --allow-unauthenticated`);
          
          console.log('\n✅ Production deployment complete!');
          console.log('URL: https://bill-tracker-production-{hash}.a.run.app');
        } else {
          console.log('Production deployment cancelled.');
        }
        break;
        
      case '3':
        console.log('\n🚀 Deploying using App Engine...');
        console.log(`Current environment: ${environment}`);
        
        // Build the application
        await runCommand('npm run build');
        
        // Choose deployment type
        const deployType = await question('Deploy with (1) version tag or (2) environment name? (1/2): ');
        
        if (deployType === '1') {
          const version = await question('Enter version tag (e.g., v1, v2): ');
          await runCommand(`gcloud app deploy --version=${version} --no-promote`);
        } else {
          // Deploy to App Engine with environment as version
          await runCommand(`gcloud app deploy --version=${environment} --no-promote`);
        }
        
        console.log('\n✅ App Engine deployment complete!');
        break;
        
      case '4':
        console.log('\n🚀 Simple Staging Deployment (Without Docker)...');
        
        // Build the application
        console.log('\n📦 Building application...');
        await runCommand('npm run build');
        
        // Create a simple app.yaml file
        console.log('\n📝 Creating app.yaml for staging...');
        await runCommand(`echo "runtime: nodejs16
env: standard
service: staging
automatic_scaling:
  min_instances: 1
  max_instances: 5
env_variables:
  VITE_MODE: 'staging'
  PROCESSOR_TYPE: 'google-cloud'" > app.yaml`);
        
        // Deploy to App Engine
        console.log('\n🚀 Deploying to App Engine...');
        await runCommand('gcloud app deploy --version=staging --no-promote');
        
        console.log('\n✅ Simple staging deployment complete!');
        break;
        
      case '5':
        console.log('\n🚀 Simple Production Deployment (Without Docker)...');
        const confirmSimple = await question('⚠️ Are you sure you want to deploy to PRODUCTION? (y/N): ');
        
        if (confirmSimple.toLowerCase() === 'y') {
          // Build the application
          console.log('\n📦 Building application...');
          await runCommand('npm run build');
          
          // Create a simple app.yaml file
          console.log('\n📝 Creating app.yaml for production...');
          await runCommand(`echo "runtime: nodejs16
env: standard
service: default
automatic_scaling:
  min_instances: 1
  max_instances: 10
env_variables:
  VITE_MODE: 'production'
  PROCESSOR_TYPE: 'google-cloud'" > app.yaml`);
          
          // Deploy to App Engine
          console.log('\n🚀 Deploying to App Engine...');
          await runCommand('gcloud app deploy --version=production --promote');
          
          console.log('\n✅ Simple production deployment complete!');
        } else {
          console.log('Production deployment cancelled.');
        }
        break;
        
      case '0':
        return;
        
      default:
        console.log('Invalid choice. Please try again.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  await question('\n📌 Press Enter to continue...');
  await handleDeployment();
}

async function simpleStaging() {
  console.log('\n🚀 Simple Staging Deployment (Without Docker)...');
        
  // Build the application
  console.log('\n📦 Building application...');
  await runCommand('npm run build');
  
  // Create a simple app.yaml file
  console.log('\n📝 Creating app.yaml for staging...');
  await runCommand(`echo "runtime: nodejs16
env: standard
service: staging
automatic_scaling:
  min_instances: 1
  max_instances: 5
env_variables:
  VITE_MODE: 'staging'
  PROCESSOR_TYPE: 'google-cloud'" > app.yaml`);
  
  // Deploy to App Engine
  console.log('\n🚀 Deploying to App Engine...');
  await runCommand('gcloud app deploy --version=staging --no-promote');
  
  console.log('\n✅ Simple staging deployment complete!');
}

async function simpleProduction() {
  console.log('\n🚀 Simple Production Deployment (Without Docker)...');
  const confirmSimple = await question('⚠️ Are you sure you want to deploy to PRODUCTION? (y/N): ');
  
  if (confirmSimple.toLowerCase() === 'y') {
    // Build the application
    console.log('\n📦 Building application...');
    await runCommand('npm run build');
    
    // Create a simple app.yaml file
    console.log('\n📝 Creating app.yaml for production...');
    await runCommand(`echo "runtime: nodejs16
env: standard
service: default
automatic_scaling:
  min_instances: 1
  max_instances: 10
env_variables:
  VITE_MODE: 'production'
  PROCESSOR_TYPE: 'google-cloud'" > app.yaml`);
    
    // Deploy to App Engine
    console.log('\n🚀 Deploying to App Engine...');
    await runCommand('gcloud app deploy --version=production --promote');
    
    console.log('\n✅ Simple production deployment complete!');
  } else {
    console.log('Production deployment cancelled.');
  }
}

async function legacyDeployment() {
  console.log('\n=== Legacy Deployment (Original Method) ===');
  console.log('1. Deploy to Google Cloud Run (Staging)');
  console.log('2. Deploy to Google Cloud Run (Production)');
  console.log('0. Back to Main Menu\n');

  const choice = await question('Enter your choice: ');

  try {
    switch (choice) {
      case '1':
        console.log('\n🚀 Deploying to Google Cloud Run (Staging) - LEGACY MODE...');
        
        // First build the application in legacy mode
        await runCommand('npm run build:legacy');
        
        // Create a simple Dockerfile for legacy mode
        console.log('\n📝 Creating Dockerfile for legacy mode...');
        
        await runCommand(`echo "# Legacy mode deployment
FROM node:18-alpine as build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the codebase
COPY . .

# Set legacy mode
ENV DISABLE_HYBRID=true

# Build the application
RUN npm run build:legacy

# Production stage
FROM node:18-alpine

WORKDIR /app

# Set legacy mode
ENV DISABLE_HYBRID=true

# Copy built app from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src/server ./src/server

# Make port 3001 available
EXPOSE 3001

# Start the server
CMD ["node", "--loader", "ts-node/esm", "src/server/index.ts"]" > Dockerfile.legacy`);
        
        // Get project ID
        console.log('\n🔍 Getting Google Cloud project ID...');
        const projectId = await runCommand('gcloud config get-value project', { returnOutput: true }) as string;
        
        if (!projectId || projectId.trim() === '') {
          console.error('❌ No Google Cloud project ID found. Please set a project with: gcloud config set project YOUR_PROJECT_ID');
          break;
        }
        
        // Build and push Docker image
        const imageTag = `gcr.io/${projectId.trim()}/bill-tracker-legacy:staging-${Date.now()}`;
        await runCommand(`docker build -t ${imageTag} -f Dockerfile.legacy .`);
        await runCommand(`docker push ${imageTag}`);
        
        // Deploy to Cloud Run
        await runCommand(`gcloud run deploy bill-tracker-staging-legacy \
          --image=${imageTag} \
          --platform=managed \
          --region=us-central1 \
          --set-env-vars=VITE_MODE=staging,DISABLE_HYBRID=true \
          --allow-unauthenticated`);
        
        console.log('\n✅ Staging deployment complete!');
        break;
        
      case '2':
        console.log('\n🚀 Deploying to Google Cloud Run (Production) - LEGACY MODE...');
        const confirm = await question('⚠️ Are you sure you want to deploy to PRODUCTION? (y/N): ');
        
        if (confirm.toLowerCase() !== 'y') {
          console.log('Production deployment cancelled.');
          break;
        }
        
        // First build the application in legacy mode
        await runCommand('npm run build:legacy');
        
        // Create a simple Dockerfile for legacy mode
        console.log('\n📝 Creating Dockerfile for legacy mode...');
        
        await runCommand(`echo "# Legacy mode deployment
FROM node:18-alpine as build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the codebase
COPY . .

# Set legacy mode
ENV DISABLE_HYBRID=true

# Build the application
RUN npm run build:legacy

# Production stage
FROM node:18-alpine

WORKDIR /app

# Set legacy mode
ENV DISABLE_HYBRID=true

# Copy built app from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src/server ./src/server

# Make port 3001 available
EXPOSE 3001

# Start the server
CMD ["node", "--loader", "ts-node/esm", "src/server/index.ts"]" > Dockerfile.legacy`);
        
        // Get project ID
        console.log('\n🔍 Getting Google Cloud project ID...');
        const prodProjectId = await runCommand('gcloud config get-value project', { returnOutput: true }) as string;
        
        if (!prodProjectId || prodProjectId.trim() === '') {
          console.error('❌ No Google Cloud project ID found. Please set a project with: gcloud config set project YOUR_PROJECT_ID');
          break;
        }
        
        // Build and push Docker image
        const prodImageTag = `gcr.io/${prodProjectId.trim()}/bill-tracker-legacy:production-${Date.now()}`;
        await runCommand(`docker build -t ${prodImageTag} -f Dockerfile.legacy .`);
        await runCommand(`docker push ${prodImageTag}`);
        
        // Deploy to Cloud Run
        await runCommand(`gcloud run deploy bill-tracker-production-legacy \
          --image=${prodImageTag} \
          --platform=managed \
          --region=us-central1 \
          --set-env-vars=VITE_MODE=production,DISABLE_HYBRID=true \
          --allow-unauthenticated`);
        
        console.log('\n✅ Production deployment complete!');
        break;
        
      case '0':
        return;
        
      default:
        console.log('Invalid choice. Please try again.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  await question('\n📌 Press Enter to continue...');
  await legacyDeployment();
}

async function runBasicApp() {
  console.log('\n=== BASIC APP RUNNER (Super Simple) ===');
  console.log('This is a simplified way to run the app without any fancy options');
  console.log('1. Run in Legacy Mode (Staging)');
  console.log('2. Run in Legacy Mode (Production)');
  console.log('3. Deploy in Legacy Mode');
  console.log('0. Back to Main Menu\n');

  const choice = await question('Enter your choice: ');

  try {
    switch (choice) {
      case '1':
        console.log('\n🚀 Running app in LEGACY mode (staging)...');
        await runCommand('npm run legacy');
        break;
        
      case '2':
        console.log('\n🚀 Running app in LEGACY mode (production)...');
        await runCommand('npm run legacy:prod');
        break;
        
      case '3':
        console.log('\n🚀 Deploying app in LEGACY mode...');
        await runCommand('npm run deploy:legacy');
        break;
        
      case '0':
        return;
        
      default:
        console.log('Invalid choice. Please try again.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  await question('\n📌 Press Enter to continue...');
  await runBasicApp();
}

// Run the CLI
main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
}); 