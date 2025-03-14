// Inngest functions for PDF proxy
// Note: To use Inngest, you'll need to run: npm install inngest

import { inngest } from '../client';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';
import { SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET } from '../../config';

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Initialize Google Cloud Storage (optional - for PDF caching)
let storage: any;
try {
  storage = new Storage();
} catch (error) {
  console.warn('⚠️ Google Cloud Storage not configured, PDF caching disabled');
}

// HTTP Headers for fetching PDFs
const PDF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
  'Accept': 'application/pdf,application/octet-stream,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.congress.gov/',
  'Origin': 'https://www.congress.gov'
};

// Create a function to process PDF proxy requests
export const processPdfProxy = inngest.createFunction(
  { name: 'Process PDF Proxy Request' },
  { event: 'pdf.proxy.requested' },
  async ({ event, step }) => {
    const { url, billId } = event.data;
    
    console.log(`📄 Processing PDF proxy request for: ${url}`);
    
    try {
      // First, check if we have this PDF cached already
      if (billId) {
        const cachedPdf = await step.run('check-cache', async () => {
          console.log('🔍 Checking for cached PDF');
          
          // Check Supabase storage
          const { data, error } = await supabase
            .storage
            .from('bill_pdfs')
            .createSignedUrl(`${billId}.pdf`, 60 * 60); // 1 hour expiry
            
          if (!error && data?.signedUrl) {
            console.log('✅ Found cached PDF in storage');
            return data.signedUrl;
          }
          
          return null;
        });
        
        if (cachedPdf) {
          return {
            success: true,
            cached: true,
            pdfUrl: cachedPdf
          };
        }
      }
      
      // Validate URL
      let decodedUrl;
      try {
        decodedUrl = decodeURIComponent(url);
        new URL(decodedUrl); // Validate URL
      } catch (error) {
        throw new Error(`Invalid URL format: ${url}`);
      }
      
      // Fetch the PDF
      const pdfResponse = await step.run('fetch-pdf', async () => {
        console.log('📥 Fetching PDF from source:', decodedUrl);
        
        const response = await fetch(decodedUrl, {
          headers: PDF_HEADERS,
          redirect: 'follow',
          // Set a longer timeout for large PDFs
          timeout: 60000 // 60 seconds
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
        }
        
        return {
          buffer: await response.buffer(),
          contentType: response.headers.get('content-type') || 'application/pdf',
          contentLength: response.headers.get('content-length')
        };
      });
      
      // Cache the PDF if we have a bill ID
      let pdfUrl;
      
      if (billId && pdfResponse.buffer) {
        pdfUrl = await step.run('cache-pdf', async () => {
          console.log('💾 Caching PDF for future requests');
          
          // Store in Supabase storage
          const { data, error } = await supabase
            .storage
            .from('bill_pdfs')
            .upload(`${billId}.pdf`, pdfResponse.buffer, {
              contentType: 'application/pdf',
              cacheControl: '3600',
              upsert: true
            });
            
          if (error) {
            console.error('❌ Error caching PDF in Supabase:', error);
            throw new Error(`Failed to cache PDF: ${error.message}`);
          }
          
          // Create a signed URL
          const { data: urlData } = await supabase
            .storage
            .from('bill_pdfs')
            .createSignedUrl(`${billId}.pdf`, 60 * 60); // 1 hour expiry
            
          console.log('✅ PDF cached successfully');
          return urlData?.signedUrl;
        });
      }
      
      // Return the PDF URL (either cached or original)
      return { 
        success: true, 
        pdfUrl: pdfUrl || url,
        contentType: pdfResponse.contentType,
        contentLength: pdfResponse.contentLength ? parseInt(pdfResponse.contentLength) : undefined,
        cached: !!pdfUrl
      };
    } catch (error) {
      console.error('❌ Error in PDF proxy function:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error),
        originalUrl: url
      };
    }
  }
); 