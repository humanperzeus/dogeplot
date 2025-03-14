// Load environment variables first
import { config } from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { createClient } from "@supabase/supabase-js";
import { PDFExtract } from "pdf.js-extract";
import axios from 'axios';
import type { Database } from "../types/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  env: 'staging' // Default to staging
};

// Process arguments to get environment
args.forEach(arg => {
  if (arg === '--production' || arg === '--prod') {
    options.env = 'production';
  } else if (arg === '--staging') {
    options.env = 'staging';
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

console.log('\n=== Environment Setup ===');
console.log('Selected environment:', options.env.toUpperCase());

const pdfExtract = new PDFExtract();
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Supabase URL or service role key not found in environment variables");
}

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function extractTextFromPDF(pdfBuffer: Buffer) {
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

async function downloadPDF(url: string): Promise<Buffer> {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error("Error downloading PDF:", error);
    throw error;
  }
}

async function processBillWithoutText(bill: any) {
  try {
    console.log(`\nProcessing bill ${bill.bill_type}${bill.bill_number} from congress ${bill.congress}`);
    
    let pdfBuffer: Buffer | null = null;
    
    // Try to get PDF from storage first
    if (bill.id) {
      try {
        const { data: storageData, error: storageError } = await supabase
          .storage
          .from("bill_pdfs")
          .download(`${bill.id}.pdf`);
        
        if (!storageError && storageData) {
          console.log("Found PDF in storage");
          const arrayBuffer = await storageData.arrayBuffer();
          pdfBuffer = Buffer.from(arrayBuffer);
        }
      } catch (error) {
        console.log("No PDF found in storage or error accessing storage");
      }
    }
    
    // If no PDF in storage, try URL
    if (!pdfBuffer && bill.pdf_url) {
      console.log("Downloading PDF from URL:", bill.pdf_url);
      try {
        pdfBuffer = await downloadPDF(bill.pdf_url);
        console.log("Successfully downloaded PDF from URL");
      } catch (error) {
        console.error("Failed to download PDF from URL:", error);
        return 'error';
      }
    }
    
    if (!pdfBuffer) {
      console.log("No PDF available for OCR");
      return 'skipped';
    }
    
    // Extract text using OCR
    console.log("Extracting text from PDF...");
    const textContent = await extractTextFromPDF(pdfBuffer);
    
    if (!textContent) {
      console.log("No text extracted from PDF");
      return 'error';
    }
    
    console.log("Successfully extracted text, updating database...");
    
    // Update the bill in the database
    const { error: updateError } = await supabase
      .from("bills")
      .update({
        full_text: textContent,
        has_full_text: true
      })
      .eq('id', bill.id);
    
    if (updateError) {
      console.error("Error updating bill in database:", updateError);
      return 'error';
    }
    
    console.log("Successfully updated bill with OCR text");
    return 'processed';
    
  } catch (error) {
    console.error("Error processing bill:", error);
    return 'error';
  }
}

async function main() {
  try {
    console.log("Starting OCR process for bills without text...");
    
    // Get all bills that have a PDF URL but no text
    const { data: bills, error: queryError } = await supabase
      .from("bills")
      .select("*")
      .is('full_text', null)  // No text content
      .not('id', 'is', null)  // Must have an ID
      .or('pdf_url.neq.null,pdf_url.neq.""');  // Must have a PDF URL
    
    if (queryError) {
      console.error("Database query error:", queryError);
      throw queryError;
    }
    
    console.log(`Found ${bills?.length || 0} bills to process`);
    
    if (!bills || bills.length === 0) {
      console.log("No bills need OCR processing");
      return;
    }

    // Log some sample bills for debugging
    console.log("\nSample bills to process:");
    bills.slice(0, 3).forEach(bill => {
      console.log(`- ${bill.bill_type}${bill.bill_number} (Congress ${bill.congress})`);
      console.log(`  PDF URL: ${bill.pdf_url || 'None'}`);
    });
    
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const bill of bills) {
      if (!bill.id) {
        console.log("Skipping bill without ID");
        skippedCount++;
        continue;
      }
      
      const result = await processBillWithoutText(bill);
      if (result === 'processed') {
        processedCount++;
      } else if (result === 'skipped') {
        skippedCount++;
      } else {
        errorCount++;
      }
      
      // Add a small delay between processing bills
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log("\n=== OCR Processing Complete ===");
    console.log(`Total bills found: ${bills.length}`);
    console.log(`Successfully processed: ${processedCount}`);
    console.log(`Skipped (no PDF available): ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    
  } catch (error) {
    console.error("Fatal error during OCR processing:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack
      });
    }
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
}); 