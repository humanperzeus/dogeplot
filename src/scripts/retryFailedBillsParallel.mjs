import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { Worker } from 'worker_threads';
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  threads: 4,
  env: 'staging' // Default to staging
};

// Process arguments to get environment first
args.forEach(arg => {
  if (arg === '--production' || arg === '--prod') {
    options.env = 'production';
  } else if (arg === '--staging') {
    options.env = 'staging';
  } else if (arg.startsWith('--threads=')) {
    options.threads = parseInt(arg.split('=')[1]) || 4;
  }
});

// Load the appropriate .env file
const envPath = join(__dirname, '../../.env.' + options.env);
if (fs.existsSync(envPath)) {
  config({ path: envPath });
} else {
  console.warn(`Warning: ${envPath} not found, falling back to .env`);
  config(); // fallback to default .env
}

// Get environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const congressApiKey = process.env.VITE_CONGRESS_API_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey || !congressApiKey) {
  throw new Error("Required environment variables not found");
}

console.log('\n=== Environment Setup ===');
console.log('Selected environment:', options.env.toUpperCase());
console.log('Using Supabase URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function createWorker(bills, workerIndex, totalWorkers) {
  const workerScript = `
    import { parentPort, workerData } from 'worker_threads';
    import { createClient } from "@supabase/supabase-js";
    import { PDFExtract } from "pdf.js-extract";
    import { v5 as uuidv5 } from 'uuid';
    import axios from "axios";

    const { bills, workerIndex, env, congressApiKey } = workerData;
    const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    
    console.log(\`Worker \${workerIndex} starting...\`);

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

    async function fetchWithRetry(url, maxRetries = 3) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(\`Attempt \${attempt} of \${maxRetries}...\`);
          const response = await axios.get(url, {
            timeout: 30000,
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf'
            }
          });
          return response;
        } catch (error) {
          console.error(\`Attempt \${attempt} failed:\`, error.message);
          if (attempt === maxRetries) {
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        }
      }
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

    async function fetchBillContent(congress, type, number) {
      try {
        console.log('\\nFetching text versions...');
        const textUrl = \`https://api.congress.gov/v3/bill/\${congress}/\${type}/\${number}/text?format=json&api_key=\${congressApiKey}\`;
        const textResponse = await fetchWithRetry(textUrl);
        
        if (!textResponse.data?.textVersions?.length) {
          return { 
            pdfUrl: null, 
            pdfBuffer: null,
            apiText: null,
            textSource: null 
          };
        }

        const latestVersion = textResponse.data.textVersions[textResponse.data.textVersions.length - 1];
        console.log("Available formats:", latestVersion.formats.map(f => f.type));

        const xmlFormat = latestVersion.formats.find(f => f.type === 'Formatted XML');
        const htmlFormat = latestVersion.formats.find(f => f.type === 'Formatted Text');
        const pdfFormat = latestVersion.formats.find(f => f.type === 'PDF');

        if (xmlFormat) {
          try {
            console.log("\\nTrying XML format...");
            const response = await fetchWithRetry(xmlFormat.url);
            const text = response.data.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
            return {
              pdfUrl: pdfFormat?.url || null,
              pdfBuffer: null,
              apiText: text,
              textSource: 'api'
            };
          } catch (error) {
            console.log("Failed to fetch XML:", error.message);
          }
        }

        if (htmlFormat) {
          try {
            console.log("\\nTrying HTML format...");
            const response = await fetchWithRetry(htmlFormat.url);
            const text = response.data.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
            return {
              pdfUrl: pdfFormat?.url || null,
              pdfBuffer: null,
              apiText: text,
              textSource: 'api'
            };
          } catch (error) {
            console.log("Failed to fetch HTML:", error.message);
          }
        }

        if (pdfFormat) {
          try {
            console.log("\\nTrying PDF format...");
            const pdfResponse = await fetchWithRetry(pdfFormat.url);
            const pdfBuffer = Buffer.from(pdfResponse.data);
            const text = await extractTextFromPDF(pdfBuffer);
            return {
              pdfUrl: pdfFormat.url,
              pdfBuffer,
              apiText: text,
              textSource: 'pdf'
            };
          } catch (error) {
            console.log("Failed to process PDF:", error.message);
            return {
              pdfUrl: pdfFormat.url,
              pdfBuffer: null,
              apiText: null,
              textSource: null
            };
          }
        }

        return { 
          pdfUrl: null, 
          pdfBuffer: null,
          apiText: null,
          textSource: null 
        };
      } catch (error) {
        console.error("Error fetching bill content:", error.message);
        return { 
          pdfUrl: null, 
          pdfBuffer: null,
          apiText: null,
          textSource: null 
        };
      }
    }

    function determineBillStatus(billData) {
      const actions = billData.bill.actions || [];
      const laws = billData.bill.laws || [];
      const lastAction = billData.bill.latestAction;
      const lastActionText = lastAction?.text?.toLowerCase() || '';

      if (laws.length > 0 || lastActionText.includes('became public law')) {
        return 'signed_into_law';
      }
      if (lastActionText.includes('veto overridden')) {
        return 'veto_overridden';
      }
      if (lastActionText.includes('vetoed')) {
        return 'vetoed';
      }
      if (lastActionText.includes('presented to president')) {
        return 'presented_to_president';
      }
      if (lastActionText.includes('passed senate') && lastActionText.includes('passed house')) {
        return 'passed_both_chambers';
      }
      if (lastActionText.includes('passed') && (lastActionText.includes('house') || lastActionText.includes('senate'))) {
        return 'passed_chamber';
      }
      if (lastActionText.includes('reported')) {
        return 'reported_by_committee';
      }
      if (lastActionText.includes('referred to')) {
        return 'referred_to_committee';
      }
      
      return 'introduced';
    }

    async function processBill(bill) {
      try {
        console.log(\`\\nProcessing \${bill.bill_type}\${bill.bill_number} from congress \${bill.congress}...\`);
        
        // First fetch the full bill details
        const billUrl = \`https://api.congress.gov/v3/bill/\${bill.congress}/\${bill.bill_type}/\${bill.bill_number}?format=json&api_key=\${congressApiKey}\`;
        const billResponse = await fetchWithRetry(billUrl);
        
        if (!billResponse.data) {
          throw new Error('No data received from Congress API');
        }

        // Generate bill ID
        const billId = uuidv5(\`\${bill.congress}_\${bill.bill_type}\${bill.bill_number}\`, NAMESPACE);

        // Then try to get the content
        const content = await fetchBillContent(bill.congress, bill.bill_type, bill.bill_number);
        
        // Prepare the bill record
        const billRecord = {
          id: billId,
          bill_number: bill.bill_number,
          congress: bill.congress,
          title: billResponse.data.bill.title,
          introduction_date: billResponse.data.bill.introducedDate ? \`\${billResponse.data.bill.introducedDate}T00:00:00Z\` : null,
          status: determineBillStatus(billResponse.data),
          analysis_status: 'pending',
          key_points: [],
          analysis: null,
          sponsors: billResponse.data.bill.sponsors ? billResponse.data.bill.sponsors.map(sponsor => sponsor.fullName) : [],
          committee: billResponse.data.bill.committees?.count > 0 ? billResponse.data.bill.committees.url : null,
          full_text: content.apiText,
          has_full_text: !!content.apiText,
          text_source: content.textSource,
          bill_type: bill.bill_type,
          origin_chamber: billResponse.data.bill.originChamber || null,
          origin_chamber_code: billResponse.data.bill.originChamberCode || null,
          latest_action_date: billResponse.data.bill.latestAction?.actionDate ? \`\${billResponse.data.bill.latestAction.actionDate}T00:00:00Z\` : null,
          latest_action_text: billResponse.data.bill.latestAction?.text || null,
          constitutional_authority_text: billResponse.data.bill.constitutionalAuthorityStatementText || null,
          policy_area: billResponse.data.bill.policyArea?.name || null,
          subjects: billResponse.data.bill.subjects?.count > 0 ? [billResponse.data.bill.subjects.url] : [],
          summary: billResponse.data.bill.summary?.text || null,
          cbo_cost_estimates: JSON.stringify(billResponse.data.bill.cboCostEstimates || []),
          laws: JSON.stringify(billResponse.data.bill.laws || []),
          committees_count: billResponse.data.bill.committees?.count || 0,
          cosponsors_count: billResponse.data.bill.cosponsors?.count || 0,
          withdrawn_cosponsors_count: billResponse.data.bill.cosponsors?.countIncludingWithdrawnCosponsors || 0,
          actions_count: billResponse.data.bill.actions?.count || 0,
          update_date: billResponse.data.bill.updateDate ? new Date(billResponse.data.bill.updateDate).toISOString() : null,
          update_date_including_text: billResponse.data.bill.updateDateIncludingText ? new Date(billResponse.data.bill.updateDateIncludingText).toISOString() : null,
          pdf_url: content.pdfUrl
        };

        // Update the bill
        const { error: upsertError } = await supabase
          .from('bills')
          .upsert(billRecord);

        if (upsertError) {
          throw upsertError;
        }

        // If successful, remove from failed_bills
        const { error: deleteError } = await supabase
          .from('failed_bills')
          .delete()
          .match({ 
            congress: bill.congress, 
            bill_type: bill.bill_type, 
            bill_number: bill.bill_number 
          });

        if (deleteError) {
          console.error("Error removing from failed_bills:", deleteError);
        }

        return { success: true, bill };
      } catch (error) {
        console.error(\`Error processing bill \${bill.bill_type}\${bill.bill_number}:\`, error.message);
        
        // Update retry count and last retry timestamp
        const { error: updateError } = await supabase
          .from('failed_bills')
          .update({ 
            retry_count: (bill.retry_count || 0) + 1,
            last_retry: new Date().toISOString(),
            error_message: error.message || 'Unknown error'
          })
          .match({ 
            congress: bill.congress, 
            bill_type: bill.bill_type, 
            bill_number: bill.bill_number 
          });

        if (updateError) {
          console.error("Error updating failed_bills:", updateError);
        }

        return { success: false, bill, error: error.message };
      }
    }

    // Process bills in the worker
    async function processAllBills() {
      for (const bill of bills) {
        const result = await processBill(bill);
        parentPort?.postMessage(result);
        // Add a small delay between bills
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      parentPort?.postMessage('done');
    }

    processAllBills().catch(error => {
      console.error('Worker error:', error);
      process.exit(1);
    });
  `;

  const tempWorkerPath = join(__dirname, `temp_worker_${workerIndex}.mjs`);
  await fs.promises.writeFile(tempWorkerPath, workerScript);

  const worker = new Worker(tempWorkerPath, {
    workerData: {
      bills,
      workerIndex,
      env: {
        supabaseUrl,
        serviceRoleKey: supabaseServiceRoleKey
      },
      congressApiKey
    }
  });

  // Clean up temp worker file when done
  worker.on('exit', () => {
    fs.promises.unlink(tempWorkerPath).catch(console.error);
  });

  return worker;
}

async function retryFailedBillsParallel(threads = 4) {
  try {
    console.log("\n=== Starting Parallel Retry Process ===");
    console.log(`Environment: ${options.env.toUpperCase()}`);
    console.log(`Database URL: ${supabaseUrl}`);
    console.log(`Threads: ${threads}\n`);

    // Get all failed bills that haven't been retried too many times
    const { data: failedBills, error } = await supabase
      .from('failed_bills')
      .select('*')
      .lt('retry_count', 3)
      .order('last_retry', { ascending: true });

    if (error) {
      throw error;
    }

    if (!failedBills?.length) {
      console.log('No failed bills to retry');
      return;
    }

    console.log(`Found ${failedBills.length} failed bills to retry`);

    // Split bills into chunks for each worker
    const chunkSize = Math.ceil(failedBills.length / threads);
    const chunks = Array.from({ length: threads }, (_, i) => 
      failedBills.slice(i * chunkSize, (i + 1) * chunkSize)
    ).filter(chunk => chunk.length > 0);

    // Create workers for each chunk
    const workers = await Promise.all(chunks.map((chunk, index) => 
      createWorker(chunk, index, chunks.length)
    ));

    let completedWorkers = 0;
    let successCount = 0;
    let failureCount = 0;

    // Handle worker messages
    workers.forEach((worker, index) => {
      worker.on('message', (message) => {
        if (message === 'done') {
          completedWorkers++;
          if (completedWorkers === workers.length) {
            console.log("\n=== Retry Process Complete ===");
            console.log(`Successfully processed: ${successCount} bills`);
            console.log(`Failed to process: ${failureCount} bills`);
            process.exit(0);
          }
        } else if (message.success) {
          successCount++;
          const progress = Math.round((successCount + failureCount) / failedBills.length * 100);
          console.log(`[${progress}%] Successfully processed ${message.bill.bill_type}${message.bill.bill_number}`);
        } else {
          failureCount++;
          console.error(`Failed to process ${message.bill.bill_type}${message.bill.bill_number}: ${message.error}`);
        }
      });

      worker.on('error', (error) => {
        console.error(`Worker ${index} error:`, error);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker ${index} exited with code ${code}`);
        }
      });
    });

  } catch (error) {
    console.error("Error in retry process:", error);
  }
}

// Run the parallel retry process
retryFailedBillsParallel(options.threads).catch(console.error); 