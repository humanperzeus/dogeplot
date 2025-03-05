// Remove the default environment loading
// import './loadEnv.js';
import { config } from "dotenv";
import { Worker, parentPort } from 'worker_threads';
import axios from "axios";
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { envLoader } from './loadEnv.js';
import { v5 as uuidv5 } from 'uuid';
import { dirname } from 'path';
import { spawn } from 'child_process';
import { PDFExtract } from 'pdf.js-extract';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments first to get environment
const args = process.argv.slice(2);
const options = {
  limit: 100,
  congress: undefined as string | undefined,
  offset: 0,
  threads: 4,
  savePdfs: false,
  env: 'staging', // Default to staging
  quiet: false    // Add quiet mode option
};

// Process arguments to get environment first
args.forEach(arg => {
  if (arg === '--production') {
    options.env = 'production';
  } else if (arg === '--staging') {
    options.env = 'staging';
  } else if (arg === '--quiet' || arg === '-q') {
    options.quiet = true;
  }
});

// Clear any existing environment config
envLoader.clearConfig();

// Load environment based on option - do this only once
console.log('\n=== Environment Setup ===');
console.log('Selected environment:', options.env.toUpperCase());
const envConfig = await envLoader.load(options.env);

// Verify environment loaded correctly
if (envConfig.mode !== options.env) {
  throw new Error(`Environment mismatch: expected ${options.env}, got ${envConfig.mode}`);
}

// Now process other arguments
args.forEach(arg => {
  if (arg.startsWith('--limit=')) {
    options.limit = parseInt(arg.split('=')[1]) || 100;
  } else if (arg.startsWith('--congress=')) {
    options.congress = arg.split('=')[1];
  } else if (arg.startsWith('--offset=')) {
    options.offset = parseInt(arg.split('=')[1]) || 0;
  } else if (arg.startsWith('--threads=')) {
    options.threads = parseInt(arg.split('=')[1]) || 4;
  } else if (arg === '--save-pdfs') {
    options.savePdfs = true;
  }
});

// Get environment variables after environment is properly loaded
const supabaseUrl = envConfig.variables.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = envConfig.variables.SUPABASE_SERVICE_ROLE_KEY;
const congressApiKey = envConfig.variables.VITE_CONGRESS_API_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey || !congressApiKey) {
  throw new Error("Required environment variables not found");
}

const pdfExtract = new PDFExtract();

async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    const data = await pdfExtract.extractBuffer(pdfBuffer);
    return data.pages
      .map((page) => page.content.map((item) => item.str).join(" "))
      .join("\n");
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    throw error;
  }
}

// Function to get current congress number
async function getCurrentCongress(): Promise<string> {
  try {
    // First try the direct congress endpoint
    try {
      const response = await axios.get(`https://api.congress.gov/v3/congress?format=json&api_key=${congressApiKey}`);
      if (response.data?.congresses?.[0]?.congress) {
        return response.data.congresses[0].congress;
      }
    } catch (error) {
      console.log('Direct congress endpoint failed, trying alternative method...');
    }

    // If that fails, try getting it from the bills endpoint
    const response = await axios.get(`https://api.congress.gov/v3/bill?format=json&limit=1&api_key=${congressApiKey}`);
    if (response.data?.bills?.[0]?.congress) {
      return response.data.bills[0].congress;
    }

    // If both methods fail, use hardcoded current congress
    console.log('Could not determine congress from API, using current congress (118)');
    return '118';
  } catch (error) {
    console.error('Error fetching current congress:', error);
    // Default to current congress if all methods fail
    console.log('Using default current congress (118)');
    return '118';
  }
}

// Function to fetch bills with pagination
async function fetchAllBills(limit: number, offset: number, congress?: string) {
  const API_LIMIT = 250; // Congress.gov API limit per request
  const bills = [];
  let currentOffset = offset;
  let totalBills = 0;
  let currentCongress = congress;
  let retryCount = 0;
  const MAX_RETRIES = 5;

  // If no congress specified, get the current one
  if (!currentCongress) {
    currentCongress = await getCurrentCongress();
    console.log(`Using congress: ${currentCongress}`);
  }

  while (bills.length < limit) {
    try {
      const batchLimit = Math.min(API_LIMIT, limit - bills.length);
      const url = `https://api.congress.gov/v3/bill/${currentCongress}?format=json&limit=${batchLimit}&offset=${currentOffset}&api_key=${congressApiKey}`;
      
      console.log(`Fetching bills ${bills.length + 1} to ${bills.length + batchLimit} (offset: ${currentOffset})...`);
      const response = await axios.get(url);
      
      // Reset retry count on success
      retryCount = 0;
      
      // Get total count on first request
      if (bills.length === 0) {
        totalBills = response.data.pagination?.count || 0;
        console.log(`Total bills available in congress ${currentCongress}: ${totalBills}`);
        
        if (offset >= totalBills) {
          console.log(`Offset ${offset} is beyond available bills (${totalBills})`);
          break;
        }
      }
      
      // Add bills to our collection
      if (response.data?.bills) {
        bills.push(...response.data.bills);
        console.log(`Retrieved ${response.data.bills.length} bills`);
      }
      
      // Check if we've reached the end of available bills
      if (!response.data?.bills || response.data.bills.length === 0) {
        console.log('No more bills available');
        break;
      }
      
      // Prepare for next batch
      currentOffset += response.data.bills.length;
    } catch (error: any) {
      // Handle rate limiting specifically
      if (error.response && error.response.status === 429) {
        retryCount++;
        const retryAfter = error.response.headers['retry-after'] 
          ? parseInt(error.response.headers['retry-after']) 
          : Math.pow(2, retryCount) * 30; // Exponential backoff starting at 30 seconds
        
        console.log(`\n⚠️ Rate limited by API. Retry-After: ${retryAfter} seconds`);
        console.log(`Waiting for ${retryAfter} seconds before retry ${retryCount}/${MAX_RETRIES}...`);
        
        if (retryCount <= MAX_RETRIES) {
          // Wait for the specified time
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          console.log(`Resuming after rate limit cooldown...`);
          // Continue the loop without incrementing offset to retry the same request
          continue;
        } else {
          console.error(`Exceeded maximum retries (${MAX_RETRIES}) for rate limiting. Aborting.`);
          throw new Error(`Rate limit retry exceeded (${MAX_RETRIES} attempts)`);
        }
      } else {
        // For other errors, log and re-throw
        console.error('Error in fetchAllBills:', error);
        throw error;
      }
    }
  }
  
  return bills.slice(0, limit);
}

// Update the fetchWithRetry function to respect quiet mode
async function fetchWithRetry(url: string, reqOptions?: any, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (!options.quiet) {
        console.log(`Attempt ${i + 1} of ${maxRetries} for ${url}`);
      }
      const response = await axios.get(url, {
        ...reqOptions,
        headers: {
          'X-API-Key': congressApiKey,
          ...(reqOptions?.headers || {})
        }
      });
      return response;
    } catch (error) {
      lastError = error;
      if (error.response) {
        if (error.response.status === 429) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          continue;
        }
        if (error.response.status === 503) {
          await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
          continue;
        }
      }
      throw error;
    }
  }
  throw lastError;
}

async function determineBillStatus(bill) {
  try {
    // Remove API key from URL and add it to headers in fetchWithRetry
    const response = await fetchWithRetry(bill.url);
    console.log('Bill API response:', response);
    const billData = response.data;
    console.log('Bill data:', billData);
    
    if (!billData || !billData.bill || !billData.bill.actions || !billData.bill.actions.url) {
      console.error('Invalid bill data:', billData);
      return null;
    }

    // Remove API key from URL and add it to headers in fetchWithRetry
    const actionsResponse = await fetchWithRetry(billData.bill.actions.url);
    console.log('Actions API response:', actionsResponse);
    const actions = actionsResponse.data.actions;
    console.log('Actions data:', actions);
    
    if (!actions || actions.length === 0) return 'introduced';

    const latestAction = actions[actions.length - 1];
    const actionText = latestAction.text.toLowerCase();

    if (actionText.includes('became public law') || actionText.includes('signed by president')) {
      return 'signed_into_law';
    }

    if (actionText.includes('reported')) {
      return 'reported_by_committee';
    }

    if (actionText.includes('referred to')) {
      return 'referred_to_committee';
    }

    return 'introduced';
  } catch (error) {
    console.error('Error in determineBillStatus:', error);
    return null;
  }
}

async function updateBillStatus(bill, newStatus) {
  try {
    const { data: currentBill, error: queryError } = await supabase
      .from('bills')
      .select('status')
      .eq('id', bill.id)
      .single();

    if (queryError) {
      console.error('Error getting current status:', queryError);
      return;
    }

    // Check if bill exists and get current status
    const { data: existingBill } = await supabase
      .from('bills')
      .select('status')
      .eq('id', bill.id)
      .single();

    // Record status history for new bills or status changes
    if (!existingBill || existingBill.status !== newStatus) {
      console.log(`Status ${existingBill ? 'change' : 'initial'} detected: ${existingBill ? existingBill.status : 'new'} -> ${newStatus}`);
      console.log(`Action text: ${bill.latestAction?.text}`);
      console.log(`Action date: ${bill.latestAction?.actionDate}`);

      const historyEntry = {
        bill_id: bill.id,
        status: newStatus,
        action_text: bill.latestAction?.text || 'Initial status recorded',
        changed_at: bill.latestAction?.actionDate ? new Date(bill.latestAction.actionDate).toISOString() : new Date().toISOString()
      };
      console.log('Inserting history entry:', historyEntry);

      const { error: historyError } = await supabase
        .from('bill_status_history')
        .insert(historyEntry);

      if (historyError) {
        console.error('Error updating status history:', historyError);
      } else {
        console.log('Successfully recorded status history');
      }
    }

    // Update bill status
    const { error: updateError } = await supabase
      .from('bills')
      .update({ 
        status: newStatus,
        latest_action_text: bill.latestAction?.text || null,
        latest_action_date: bill.latestAction?.actionDate ? new Date(bill.latestAction.actionDate).toISOString() : null,
        update_date: new Date().toISOString()
      })
      .eq('id', bill.id);

    if (updateError) {
      console.error('Error updating bill status:', updateError);
    }
  } catch (error) {
    console.error('Error in updateBillStatus:', error);
  }
}

// Update the fetchBillText function to respect quiet mode
async function fetchBillText(billData) {
  try {
    if (!billData.textVersions?.url) {
      if (!options.quiet) {
        console.log('No text versions URL available');
      }
      return { text: null, source: null, pdfUrl: null };
    }

    if (!options.quiet) {
      console.log('\nFetching text versions...');
    }
    const textVersionsResponse = await fetchWithRetry(billData.textVersions.url);
    const textVersions = textVersionsResponse.data.textVersions;

    if (!textVersions || textVersions.length === 0) {
      console.log('No text versions available');
      return { text: null, source: null, pdfUrl: null };
    }

    // Get the latest version
    const latestVersion = textVersions[textVersions.length - 1];
    console.log('\nText version details:');
    console.log('- Date:', latestVersion.date);
    console.log('- Type:', latestVersion.type);
    console.log('Available formats:', latestVersion.formats.map(f => f.type).join(', '));

    // Try formats in order: Text -> XML -> HTML -> PDF
    const txtFormat = latestVersion.formats.find(f => f.type === 'Text');
    const xmlFormat = latestVersion.formats.find(f => f.type === 'Formatted XML');
    const htmlFormat = latestVersion.formats.find(f => f.type === 'Formatted Text');
    const pdfFormat = latestVersion.formats.find(f => f.type === 'PDF');

    // Log format availability
    console.log('\nFormat availability:');
    console.log('- Text format:', txtFormat ? 'Available' : 'Not available');
    console.log('- XML format:', xmlFormat ? 'Available' : 'Not available');
    console.log('- HTML format:', htmlFormat ? 'Available' : 'Not available');
    console.log('- PDF format:', pdfFormat ? 'Available' : 'Not available');

    // Try TXT format first
    if (txtFormat) {
      try {
        console.log('\nAttempting to fetch Text format...');
        const response = await fetchWithRetry(txtFormat.url);
        console.log('Successfully retrieved Text format');
        return {
          text: response.data,
          source: 'api',
          pdfUrl: pdfFormat?.url || null
        };
      } catch (error) {
        console.error("Failed to fetch Text format:", error.message);
      }
    }

    // Try XML format
    if (xmlFormat) {
      try {
        console.log('\nAttempting to fetch XML format...');
        const response = await fetchWithRetry(xmlFormat.url);
        console.log('Successfully retrieved XML format, processing content...');
        const text = response.data
          .replace(/&#x2019;/g, "'")  // apostrophe
          .replace(/&#x201[CD]/g, '"') // quotes
          .replace(/&#x2013;/g, "-")  // en dash
          .replace(/&#x2014;/g, "--") // em dash
          .replace(/&#xA0;/g, " ")    // non-breaking space
          .replace(/<[^>]+>/g, " ")   // remove XML tags
          .replace(/\s+/g, " ")      // normalize whitespace
          .trim();

        return {
          text,
          source: 'api',
          pdfUrl: pdfFormat?.url || null
        };
      } catch (error) {
        console.error("Failed to fetch XML format:", error.message);
      }
    }

    // Try HTML format
    if (htmlFormat) {
      try {
        console.log('\nAttempting to fetch HTML format...');
        const response = await fetchWithRetry(htmlFormat.url);
        console.log('Successfully retrieved HTML format, processing content...');
        const text = response.data
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        return {
          text,
          source: 'api',
          pdfUrl: pdfFormat?.url || null
        };
      } catch (error) {
        console.error("Failed to fetch HTML format:", error.message);
      }
    }

    // If we have a PDF URL but couldn't get text from other formats
    if (pdfFormat) {
      try {
        console.log('\nAttempting to process PDF format...');
        const pdfResponse = await fetchWithRetry(pdfFormat.url, {
          responseType: 'arraybuffer',
          headers: {
            'Accept': 'application/pdf'
          }
        });
        
        console.log('Successfully downloaded PDF, extracting text...');
        const pdfBuffer = Buffer.from(pdfResponse.data);
        const text = await extractTextFromPDF(pdfBuffer);
        console.log('Successfully extracted text from PDF');
        
        return {
          text,
          source: 'pdf',
          pdfUrl: pdfFormat.url
        };
      } catch (error) {
        console.error("Failed to process PDF:", error.message);
        return {
          text: null,
          source: null,
          pdfUrl: pdfFormat.url
        };
      }
    }

    console.log('No viable text formats found');
    return { text: null, source: null, pdfUrl: null };
  } catch (error) {
    console.error("Error in fetchBillText:", error.message);
    return { text: null, source: null, pdfUrl: null };
  }
}

async function processBill(bill) {
  const billType = bill.type.toLowerCase();
  const billNumber = bill.number;
  const congress = bill.congress;

  try {
    const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const billId = uuidv5(`${congress}_${billType}${billNumber}`, NAMESPACE);

    // Get bill details from Congress API
    const billResponse = await fetchWithRetry(`https://api.congress.gov/v3/bill/${congress}/${billType}/${billNumber}?format=json&api_key=${congressApiKey}`);
    const billData = billResponse.data.bill;

    // Get text content
    const { text, source, pdfUrl } = await fetchBillText(billData);

    // Determine bill status
    const newStatus = determineBillStatus(billData);

    // Check if bill exists and get current status
    const { data: existingBill } = await supabase
      .from('bills')
      .select('id, status, has_full_text')
      .eq('id', billId)
      .single();

    // Prepare bill record
    const billRecord = {
      id: billId,
      bill_number: billNumber,
      congress: congress,
      title: billData.title,
      introduction_date: billData.introducedDate ? billData.introducedDate + "T00:00:00Z" : null,
      status: newStatus,
      analysis_status: 'pending',
      key_points: [],
      analysis: null,
      sponsors: billData.sponsors ? billData.sponsors.map(sponsor => sponsor.fullName) : [],
      committee: billData.committees?.count > 0 ? billData.committees.url : null,
      full_text: text,
      has_full_text: !!text,
      text_source: source,
      bill_type: billType,
      origin_chamber: billData.originChamber || null,
      origin_chamber_code: billData.originChamberCode || null,
      latest_action_date: billData.latestAction?.actionDate ? billData.latestAction.actionDate + "T00:00:00Z" : null,
      latest_action_text: billData.latestAction?.text || null,
      constitutional_authority_text: billData.constitutionalAuthorityStatementText || null,
      policy_area: billData.policyArea?.name || null,
      subjects: billData.subjects?.count > 0 ? [billData.subjects.url] : [],
      summary: billData.summary?.text || null,
      cbo_cost_estimates: JSON.stringify(billData.cboCostEstimates || []),
      laws: JSON.stringify(billData.laws || []),
      committees_count: billData.committees?.count || 0,
      cosponsors_count: billData.cosponsors?.count || 0,
      withdrawn_cosponsors_count: billData.cosponsors?.countIncludingWithdrawnCosponsors || 0,
      actions_count: billData.actions?.count || 0,
      update_date: billData.updateDate ? new Date(billData.updateDate).toISOString() : null,
      update_date_including_text: billData.updateDateIncludingText ? new Date(billData.updateDateIncludingText).toISOString() : null,
      pdf_url: pdfUrl
    };

    // First, insert or update the bill record
    const { error: upsertError } = await supabase
      .from('bills')
      .upsert(billRecord);

    if (upsertError) {
      throw upsertError;
    }

    // Then, if status has changed, record in history
    if (!existingBill || existingBill.status !== newStatus) {
      const historyEntry = {
        bill_id: billId,
        status: newStatus,
        action_text: billData.latestAction?.text || 'Initial status recorded',
        changed_at: billData.latestAction?.actionDate ? new Date(billData.latestAction.actionDate).toISOString() : new Date().toISOString()
      };

      const { error: historyError } = await supabase
        .from('bill_status_history')
        .insert(historyEntry);

      if (historyError) {
        console.error("Error recording status history:", historyError);
      }
    }

    // Send success message
    parentPort?.postMessage({
      type: 'progress',
      data: {
        success: true,
        bill: { id: billId, type: billType, number: billNumber },
        hasText: !!text,
        textSource: source
      }
    });

  } catch (error) {
    console.error(`Error processing bill ${billType}${billNumber}:`, error);
    parentPort?.postMessage({
      type: 'progress',
      data: {
        success: false,
        error: error.message,
        bill: { type: billType, number: billNumber }
      }
    });
  }
}

// Update the worker creation function to pass the quiet option to workers
async function createWorker(bills: any[], workerIndex: number) {
  const workerScript = `
    import { parentPort, workerData } from 'worker_threads';
    import { createClient } from "@supabase/supabase-js";
    import { PDFExtract } from "pdf.js-extract";
    import axios from "axios";
    import { v5 as uuidv5 } from 'uuid';

    const { bills, workerIndex, env, congressApiKey, quiet } = workerData;
    const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    
    const supabase = createClient(
      env.supabaseUrl,
      env.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const pdfExtract = new PDFExtract();

    // Enhanced rate limit handling
    // Track consecutive rate limit hits to implement circuit breaker
    let rateLimitHits = 0;
    const MAX_CONSECUTIVE_RATE_LIMITS = 5;
    let cooldownUntil = 0;
    let rateLimitedBills = [];
    
    // Queue to hold rate-limited bills for later retry
    const retryQueue = [];
    
    // Enhanced fetch with better rate limit handling and exponential backoff
    async function fetchWithRetry(url, options = {}, maxRetries = 5) {
      // Check if we're in a cooling off period
      const now = Date.now();
      if (now < cooldownUntil) {
        const waitTime = Math.ceil((cooldownUntil - now) / 1000);
        console.log("⏳ In cooling off period. Waiting " + waitTime + "s before trying again...");
        await new Promise(resolve => setTimeout(resolve, cooldownUntil - now));
      }
      
      let lastError;
      for (let i = 0; i < maxRetries; i++) {
        try {
          if (!quiet) {
            console.log("Attempt " + (i + 1) + " of " + maxRetries + " for " + url);
          }
          const response = await axios.get(url, {
            ...options,
            headers: {
              'X-API-Key': congressApiKey,
              ...(options?.headers || {})
            }
          });
          
          // Success - reset rate limit counter
          rateLimitHits = 0;
          return response;
        } catch (error) {
          lastError = error;
          
          // Check for rate limiting or service unavailability
          if (error.response) {
            if (error.response.status === 429) {
              // Rate limit hit - implement exponential backoff
              rateLimitHits++;
              console.log("⚠️ Rate limit hit (" + rateLimitHits + "), implementing exponential backoff...");
              
              // Calculate backoff time: 2^retry * 1000ms + random jitter
              const backoffTime = Math.pow(2, i) * 1000 + Math.random() * 1000;
              
              // If we've hit rate limits too many times consecutively, 
              // implement a longer cooling off period
              if (rateLimitHits >= MAX_CONSECUTIVE_RATE_LIMITS) {
                const cooldownTimeMs = 60000 + Math.random() * 30000; // 60-90 sec
                console.log("🛑 Too many consecutive rate limits! Cooling off for " + Math.round(cooldownTimeMs/1000) + "s");
                cooldownUntil = Date.now() + cooldownTimeMs;
                
                // Send message to parent about cooling off
                parentPort?.postMessage({
                  type: 'rateLimitCooldown',
                  data: {
                    cooldownTimeMs,
                    workerIndex
                  }
                });
                
                await new Promise(resolve => setTimeout(resolve, cooldownTimeMs));
                rateLimitHits = 0; // Reset after cooling off
                continue;
              }
              
              console.log("Backing off for " + Math.round(backoffTime/1000) + "s before retry...");
              await new Promise(resolve => setTimeout(resolve, backoffTime));
              continue;
            }
            
            if (error.response.status === 503) {
              console.log('Service unavailable, waiting before retry...');
              // Longer wait for service unavailable
              const waitTime = 5000 * (i + 1);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
            
            // Other HTTP errors
            console.error("HTTP Error " + error.response.status + ": " + error.response.statusText);
          }
          
          // General error handling for non-HTTP errors
          console.error("Attempt " + (i + 1) + " failed: " + error.message);
          
          if (i === maxRetries - 1) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
      throw lastError;
    }

    function determineBillStatus(billData) {
      if (!billData.actions || !billData.actions.count) return "introduced";

      const actionText = billData.latestAction?.text?.toLowerCase() || "";
      const laws = billData.laws || [];

      // Check for terminal states first
      if (laws.length > 0 || actionText.includes("became public law") || actionText.includes("signed by president")) {
        return "signed_into_law";
      }

      if (actionText.includes("veto overridden")) {
        return "veto_overridden";
      }

      if (actionText.includes("vetoed by president") || actionText.includes("vetoed by the president")) {
        return "vetoed";
      }

      // Check for intermediate states
      if (actionText.includes("presented to president") || actionText.includes("sent to president")) {
        return "presented_to_president";
      }

      // Check for chamber passage
      const passedHouse = actionText.includes("passed house") || actionText.includes("passed in house");
      const passedSenate = actionText.includes("passed senate") || actionText.includes("passed in senate");

      if (passedHouse && passedSenate) {
        return "passed_both_chambers";
      }

      if (passedHouse || passedSenate) {
        return "passed_chamber";
      }

      if (actionText.includes("reported") || actionText.includes("ordered to be reported")) {
        return "reported_by_committee";
      }

      if (actionText.includes("referred to")) {
        return "referred_to_committee";
      }

      // Check for failed state
      if (actionText.includes("failed") || actionText.includes("rejected") || actionText.includes("withdrawn")) {
        return "failed";
      }

      return "introduced";
    }

    async function extractTextFromPDF(pdfBuffer) {
      try {
        const data = await pdfExtract.extractBuffer(pdfBuffer);
        return data.pages
          .map((page) => page.content.map((item) => item.str).join(" "))
          .join("\\n");
      } catch (error) {
        console.error("Error extracting text from PDF:", error);
        throw error;
      }
    }

    async function fetchBillText(billData) {
      try {
        if (!billData.textVersions?.url) {
          console.log('No text versions URL available');
          return { text: null, source: null, pdfUrl: null };
        }

        console.log('\\nFetching text versions...');
        const textVersionsResponse = await fetchWithRetry(billData.textVersions.url);
        const textVersions = textVersionsResponse.data.textVersions;

        if (!textVersions || textVersions.length === 0) {
          console.log('No text versions available');
          return { text: null, source: null, pdfUrl: null };
        }

        const latestVersion = textVersions[textVersions.length - 1];
        console.log('\\nText version details:');
        console.log('- Date:', latestVersion.date);
        console.log('- Type:', latestVersion.type);
        console.log('Available formats:', latestVersion.formats.map(f => f.type).join(', '));

        const txtFormat = latestVersion.formats.find(f => f.type === 'Text');
        const xmlFormat = latestVersion.formats.find(f => f.type === 'Formatted XML');
        const htmlFormat = latestVersion.formats.find(f => f.type === 'Formatted Text');
        const pdfFormat = latestVersion.formats.find(f => f.type === 'PDF');

        console.log('\\nFormat availability:');
        console.log('- Text format:', txtFormat ? 'Available' : 'Not available');
        console.log('- XML format:', xmlFormat ? 'Available' : 'Not available');
        console.log('- HTML format:', htmlFormat ? 'Available' : 'Not available');
        console.log('- PDF format:', pdfFormat ? 'Available' : 'Not available');

        if (txtFormat) {
          try {
            console.log('\\nAttempting to fetch Text format...');
            const response = await fetchWithRetry(txtFormat.url);
            console.log('Successfully retrieved Text format');
            return {
              text: response.data,
              source: 'api',
              pdfUrl: pdfFormat?.url || null
            };
          } catch (error) {
            console.error("Failed to fetch Text format:", error.message);
          }
        }

        if (xmlFormat) {
          try {
            console.log('\\nAttempting to fetch XML format...');
            const response = await fetchWithRetry(xmlFormat.url);
            console.log('Successfully retrieved XML format, processing content...');
            const text = response.data
              .replace(/&#x2019;/g, "'")
              .replace(/&#x201[CD]/g, '"')
              .replace(/&#x2013;/g, "-")
              .replace(/&#x2014;/g, "--")
              .replace(/&#xA0;/g, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/\\s+/g, " ")
              .trim();

            return {
              text,
              source: 'api',
              pdfUrl: pdfFormat?.url || null
            };
          } catch (error) {
            console.error("Failed to fetch XML format:", error.message);
          }
        }

        if (htmlFormat) {
          try {
            console.log('\\nAttempting to fetch HTML format...');
            const response = await fetchWithRetry(htmlFormat.url);
            console.log('Successfully retrieved HTML format, processing content...');
            const text = response.data
              .replace(/<[^>]+>/g, ' ')
              .replace(/\\s+/g, ' ')
              .trim();

            return {
              text,
              source: 'api',
              pdfUrl: pdfFormat?.url || null
            };
          } catch (error) {
            console.error("Failed to fetch HTML format:", error.message);
          }
        }

        if (pdfFormat) {
          try {
            console.log('\\nAttempting to process PDF format...');
            const pdfResponse = await fetchWithRetry(pdfFormat.url, {
              responseType: 'arraybuffer',
              headers: {
                'Accept': 'application/pdf'
              }
            });
            
            console.log('Successfully downloaded PDF, extracting text...');
            const pdfBuffer = Buffer.from(pdfResponse.data);
            const text = await extractTextFromPDF(pdfBuffer);
            console.log('Successfully extracted text from PDF');
            
            return {
              text,
              source: 'pdf',
              pdfUrl: pdfFormat.url
            };
          } catch (error) {
            console.error("Failed to process PDF:", error.message);
            return {
              text: null,
              source: null,
              pdfUrl: pdfFormat.url
            };
          }
        }

        console.log('No viable text formats found');
        return { text: null, source: null, pdfUrl: null };
      } catch (error) {
        console.error("Error in fetchBillText:", error.message);
        return { text: null, source: null, pdfUrl: null };
      }
    }

    async function processBill(bill) {
      const billType = bill.type.toLowerCase();
      const billNumber = bill.number;
      const congress = bill.congress;

      try {
        const billId = uuidv5(congress + "_" + billType + billNumber, NAMESPACE);

        // Get bill details from Congress API
        const billResponse = await fetchWithRetry("https://api.congress.gov/v3/bill/" + congress + "/" + billType + "/" + billNumber + "?format=json&api_key=" + congressApiKey);
        const billData = billResponse.data.bill;

        // Get text content
        const { text, source, pdfUrl } = await fetchBillText(billData);

        // Determine bill status
        const newStatus = determineBillStatus(billData);

        // Check if bill exists and get current status
        const { data: existingBill } = await supabase
          .from('bills')
          .select('id, status, has_full_text')
          .eq('id', billId)
          .single();

        // Prepare bill record
        const billRecord = {
          id: billId,
          bill_number: billNumber,
          congress: congress,
          title: billData.title,
          introduction_date: billData.introducedDate ? billData.introducedDate + "T00:00:00Z" : null,
          status: newStatus,
          analysis_status: 'pending',
          key_points: [],
          analysis: null,
          sponsors: billData.sponsors ? billData.sponsors.map(sponsor => sponsor.fullName) : [],
          committee: billData.committees?.count > 0 ? billData.committees.url : null,
          full_text: text,
          has_full_text: !!text,
          text_source: source,
          bill_type: billType,
          origin_chamber: billData.originChamber || null,
          origin_chamber_code: billData.originChamberCode || null,
          latest_action_date: billData.latestAction?.actionDate ? billData.latestAction.actionDate + "T00:00:00Z" : null,
          latest_action_text: billData.latestAction?.text || null,
          constitutional_authority_text: billData.constitutionalAuthorityStatementText || null,
          policy_area: billData.policyArea?.name || null,
          subjects: billData.subjects?.count > 0 ? [billData.subjects.url] : [],
          summary: billData.summary?.text || null,
          cbo_cost_estimates: JSON.stringify(billData.cboCostEstimates || []),
          laws: JSON.stringify(billData.laws || []),
          committees_count: billData.committees?.count || 0,
          cosponsors_count: billData.cosponsors?.count || 0,
          withdrawn_cosponsors_count: billData.cosponsors?.countIncludingWithdrawnCosponsors || 0,
          actions_count: billData.actions?.count || 0,
          update_date: billData.updateDate ? new Date(billData.updateDate).toISOString() : null,
          update_date_including_text: billData.updateDateIncludingText ? new Date(billData.updateDateIncludingText).toISOString() : null,
          pdf_url: pdfUrl
        };

        // First, insert or update the bill record
        const { error: upsertError } = await supabase
          .from('bills')
          .upsert(billRecord);

        if (upsertError) {
          throw upsertError;
        }

        // Then, if status has changed, record in history
        if (!existingBill || existingBill.status !== newStatus) {
          const historyEntry = {
            bill_id: billId,
            status: newStatus,
            action_text: billData.latestAction?.text || 'Initial status recorded',
            changed_at: billData.latestAction?.actionDate ? new Date(billData.latestAction.actionDate).toISOString() : new Date().toISOString()
          };

          const { error: historyError } = await supabase
            .from('bill_status_history')
            .insert(historyEntry);

          if (historyError) {
            console.error("Error recording status history:", historyError);
          }
        }

        // Send success message
        parentPort?.postMessage({
          type: 'progress',
          data: {
            success: true,
            bill: { id: billId, type: billType, number: billNumber },
            hasText: !!text,
            textSource: source
          }
        });

      } catch (error) {
        // Check if this is a rate limit error
        if (error.response && error.response.status === 429) {
          console.log("⚠️ Rate limited while processing " + billType + billNumber + ", adding to retry queue");
          
          // Add to retry queue instead of marking as failed
          retryQueue.push(bill);
          
          // Notify parent about rate limited bill
          parentPort?.postMessage({
            type: 'rateLimited',
            data: {
              bill: { type: billType, number: billNumber },
              retryAfter: Date.now() + 30000 // Suggest retry after 30s
            }
          });
          
          return;
        }
        
        console.error("Error processing bill " + billType + billNumber + ":", error);
        parentPort?.postMessage({
          type: 'progress',
          data: {
            success: false,
            error: error.message,
            bill: { type: billType, number: billNumber }
          }
        });
      }
    }

    async function processAllBills() {
      const mainBills = [...bills];
      
      // Process main set of bills
      for (const bill of mainBills) {
        await processBill(bill);
        
        // Small delay between bills
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Process any bills that were rate limited
      if (retryQueue.length > 0) {
        console.log("⏳ Processing " + retryQueue.length + " rate-limited bills after cooling off...");
        parentPort?.postMessage({
          type: 'retryingBills',
          data: {
            count: retryQueue.length,
            workerIndex
          }
        });
        
        // Wait for a cooling off period before retrying
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        // Process the retry queue with longer delays
        for (const bill of retryQueue) {
          await processBill(bill);
          // Longer delay between retry bills
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      parentPort?.postMessage('done');
    }

    processAllBills().catch(error => {
      console.error('Worker error:', error);
      process.exit(1);
    });
  `;

  // Create a temporary file for the worker script
  const workerFile = path.join(process.cwd(), 'worker-' + workerIndex + '.mjs');
  await fs.writeFile(workerFile, workerScript, 'utf8');

  // Create and start the worker
  const worker = new Worker(workerFile, {
    workerData: {
      bills,
      workerIndex,
      env: {
        supabaseUrl,
        serviceRoleKey: supabaseServiceRoleKey
      },
      congressApiKey,
      quiet: options.quiet
    }
  });

  return { worker, workerFile };
}

// Update the runWorker function to update the display more frequently
async function runWorker(worker: Worker, bills: any[], workerIndex: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // Set up a timer to update the display frequently
    const displayInterval = setInterval(() => {
      updateDisplay();
    }, 500); // Update every 500ms

    worker.on('message', (message) => {
      if (message === 'done') {
        clearInterval(displayInterval);
        resolve();
        return;
      }

      handleWorkerMessage(message, workerIndex);
      
      // Update display after each message
      if (!options.quiet) {
        updateDisplay();
      }
    });

    worker.on('error', (error) => {
      clearInterval(displayInterval);
      console.error(`Worker ${workerIndex} error:`, error);
      reject(error);
    });

    worker.on('exit', (code) => {
      clearInterval(displayInterval);
      if (code !== 0) {
        reject(new Error(`Worker ${workerIndex} exited with code ${code}`));
      }
    });
  });
}

async function runWorkers(bills: any[]) {
  const batchSize = Math.ceil(bills.length / options.threads);
  const workers: Promise<void>[] = [];
  const startTime = Date.now();
  
  for (let i = 0; i < options.threads; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, bills.length);
    const batch = bills.slice(start, end);

    if (batch.length > 0) {
      const { worker, workerFile } = await createWorker(batch, i);
      workers.push(runWorker(worker, batch, i));
    }
  }

  try {
    await Promise.all(workers);
    
    // Calculate final statistics
    let totalProcessed = 0;
    let totalWithText = 0;
    global.workerStats.forEach(stat => {
      totalProcessed += stat.processed;
      totalWithText += stat.withText;
    });

    // Display completion message
    console.log("\n✅ Bill Synchronization Complete!");
    console.log(`📊 Total Bills Processed: ${totalProcessed}`);
    console.log(`📝 Bills with Text: ${totalWithText} (${totalWithText > 0 ? Math.round((totalWithText / totalProcessed) * 100) : 0}%)`);
    console.log(`⏱️ Total Time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    console.log("\n🎉 All done! Your bills are now synchronized.");
  } catch (error) {
    console.error('\n❌ Error in worker:', error);
  }
}

// Global stats tracking
let global = {
  workerStats: new Map(),
  totalBills: 0,
  processed: 0,
  successful: 0,
  failed: 0,
  withText: 0,
  apiText: 0,
  pdfText: 0,
  displayCounter: 0,
  displayState: {
    headerPrinted: false,
    statsPrinted: false,
    workersPrinted: false,
    linesUsed: 0
  }
};

// Worker stats structure
interface WorkerStats {
  processed: number;
  successful: number;
  failed: number;
  withText: number;
  apiText: number;
  pdfText: number;
  current: string;
  currentStatus: string;
  totalBills: number;
}

// Add a new interface for display state
interface DisplayState {
  headerPrinted: boolean;
  statsPrinted: boolean;
  workersPrinted: boolean;
  linesUsed: number;
}

// Update the global declaration
declare global {
  var workerStats: Map<number, WorkerStats>;
  var totalBills: number;
  var processed: number;
  var successful: number;
  var failed: number;
  var withText: number;
  var apiText: number;
  var pdfText: number;
  var displayCounter: number;
  var displayState: DisplayState;
}

function handleWorkerMessage(message: any, workerIndex: number) {
  // Get or initialize worker stats
  let stats = global.workerStats.get(workerIndex) || {
    processed: 0,
    successful: 0,
    failed: 0,
    newBills: 0,
    statusChanges: 0,
    withText: 0,
    apiText: 0,
    pdfText: 0,
    currentBill: '',
    currentStatus: '',
    rateLimited: 0,
    cooldownUntil: 0,
    lastUpdate: Date.now()
  };

  if (message.type === 'progress') {
    // Update worker stats
    stats.processed++;
    global.processed++;
    
    if (message.data.success) {
      stats.successful++;
      global.successful++;
      
      if (message.data.hasText) {
        stats.withText++;
        global.withText++;
        
        if (message.data.textSource === 'api') {
          stats.apiText++;
          global.apiText++;
        } else if (message.data.textSource === 'pdf') {
          stats.pdfText++;
          global.pdfText++;
        }
      }
    } else {
      stats.failed++;
      global.failed++;
    }
    
    stats.currentBill = message.data.bill.type + message.data.bill.number;
    
    // Initialize worker stats object if not exists
    if (!global.workerStats[workerIndex]) {
      global.workerStats[workerIndex] = {
        processed: 0,
        successful: 0,
        failed: 0,
        withText: 0,
        apiText: 0,
        pdfText: 0,
        current: '',
        currentStatus: '',
        totalBills: Math.ceil(options.limit / options.threads),
        rateLimited: 0,
        cooldownUntil: 0
      };
    }
    
    // Update worker stats object
    global.workerStats[workerIndex] = {
      ...global.workerStats[workerIndex],
      processed: stats.processed,
      successful: stats.successful,
      failed: stats.failed,
      withText: stats.withText,
      apiText: stats.apiText,
      pdfText: stats.pdfText,
      current: stats.currentBill,
      currentStatus: stats.currentStatus
    };

    // Update global stats
    global.totalBills++;
  }
  else if (message.type === 'rateLimitCooldown') {
    // Update cooldown info
    stats.cooldownUntil = Date.now() + message.data.cooldownTimeMs;
    stats.currentStatus = 'COOLING DOWN';
    
    // Update worker stats
    global.workerStats[workerIndex] = {
      ...global.workerStats[workerIndex],
      cooldownUntil: stats.cooldownUntil,
      currentStatus: stats.currentStatus
    };
    
    console.log(`\n⚠️ Worker ${workerIndex} cooling down until ${new Date(stats.cooldownUntil).toLocaleTimeString()}`);
  }
  else if (message.type === 'rateLimited') {
    // Track rate limited bills
    stats.rateLimited++;
    stats.currentStatus = 'RATE LIMITED';
    
    // Update worker stats
    global.workerStats[workerIndex] = {
      ...global.workerStats[workerIndex],
      rateLimited: stats.rateLimited,
      currentStatus: stats.currentStatus
    };
  }
  else if (message.type === 'retryingBills') {
    stats.currentStatus = "RETRYING " + message.data.count + " BILLS";
    
    // Update worker stats
    global.workerStats[workerIndex] = {
      ...global.workerStats[workerIndex],
      currentStatus: stats.currentStatus
    };
    
    console.log("\n🔄 Worker " + workerIndex + " retrying " + message.data.count + " rate-limited bills");
  }

  // Update display
  updateDisplay();

  // Update global stats
  global.workerStats.set(workerIndex, stats);
}

function updateDisplay() {
  // Save cursor position and hide cursor
  process.stdout.write('\u001B[?25l'); // Hide cursor
  
  // Clear the entire screen and move cursor to top-left
  process.stdout.write('\u001B[2J\u001B[0;0H');
  
  // Calculate total progress
  let totalProcessed = 0;
  let totalBills = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;
  let totalWithText = 0;
  let totalApiText = 0;
  let totalPdfText = 0;
  let totalRateLimited = 0;

  // Gather stats from workers
  global.workerStats.forEach(stat => {
    totalProcessed += stat.processed;
    totalSuccessful += stat.successful;
    totalFailed += stat.failed;
    totalWithText += stat.withText;
    totalApiText += stat.apiText;
    totalPdfText += stat.pdfText;
    totalRateLimited += stat.rateLimited || 0;
  });
  
  totalBills = options.limit;

  // Calculate progress percentage
  const progress = Math.round((totalProcessed / totalBills) * 100);
  
  // Create progress bar
  const progressBar = '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
  
  // Print header
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ Bill Synchronization Progress                           │');
  console.log('└─────────────────────────────────────────────────────────┘');
  
  // Print progress bar
  console.log(`[${progressBar}] ${progress}% (${totalProcessed}/${totalBills})`);
  
  // Print stats
  console.log(`📊 Success: ${totalSuccessful}/${totalProcessed} (${totalSuccessful > 0 ? Math.round((totalSuccessful / totalProcessed) * 100) : 0}%)`);
  console.log(`📝 With Text: ${totalWithText}/${totalProcessed} (${totalWithText > 0 ? Math.round((totalWithText / totalProcessed) * 100) : 0}%)`);
  
  // Print rate limit info
  if (totalRateLimited > 0) {
    console.log(`⚠️ Rate Limited: ${totalRateLimited} bills (will retry automatically)`);
  }
  
  // Print worker status
  console.log('\n📋 Worker Status:');
  
  let activeWorkers = 0;
  global.workerStats.forEach((stat, idx) => {
    let status = stat.currentStatus || (stat.currentBill ? "Processing " + stat.currentBill : 'Idle');
    
    // If worker is in cooldown, show countdown
    if (stat.cooldownUntil && Date.now() < stat.cooldownUntil) {
      const remainingSecs = Math.ceil((stat.cooldownUntil - Date.now()) / 1000);
      status = "COOLING DOWN (" + remainingSecs + "s remaining)";
    }
    
    console.log("   Worker " + idx + ": " + status + " - " + stat.processed + "/" + stat.totalBills + " bills processed");
    activeWorkers++;
  });
  
  // If no active workers, add a placeholder line
  if (activeWorkers === 0) {
    console.log('   No active workers');
  }
  
  // Show cursor again when done
  process.on('exit', () => {
    process.stdout.write('\u001B[?25h'); // Show cursor
  });
}

async function main() {
  try {
    console.log("\n⏳ Starting Bill Synchronization...\n");
    console.log(`🔧 Environment: ${options.env}`);
    console.log(`🔌 Database: ${supabaseUrl}`);
    console.log(`🧵 Threads: ${options.threads}`);
    console.log(`🔢 Limit: ${options.limit}`);
    console.log(`📍 Offset: ${options.offset}`);
    console.log(`🏛️ Congress: ${options.congress || 'Auto-detect'}`);
    console.log(`💾 Save PDFs: ${options.savePdfs ? 'Yes' : 'No'}`);
    console.log(`🔇 Quiet Mode: ${options.quiet ? 'Yes' : 'No'}`);
    console.log();

    // Initialize display counter
    global.displayCounter = 0;
    const startTime = Date.now();

    // Fetch bills
    const bills = await fetchAllBills(options.limit, options.offset, options.congress);
    if (bills.length === 0) {
      console.log("\x1b[31m⚠️ No bills found to process\x1b[0m");
      return;
    }

    console.log("\n📋 Processing Bills");
    console.log(`📊 Total bills to process: ${bills.length}`);
    console.log(`🧵 Number of workers: ${options.threads}`);
    console.log("🔄 Starting workers...\n");

    // If in quiet mode, clear the screen before starting workers
    if (options.quiet) {
      // Clear the screen
      process.stdout.write('\u001B[2J\u001B[0;0H');
    }

    // Process bills in parallel
    await runWorkers(bills);
    
  } catch (error) {
    console.error("\n\x1b[31m❌ Error in main process:\x1b[0m", error);
  }
}

// Run the main function
main().catch(error => {
  console.error("Unhandled error:", error);
  process.exit(1);
});