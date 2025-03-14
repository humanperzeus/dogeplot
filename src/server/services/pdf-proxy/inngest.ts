// Inngest implementation of PDF proxy service

import { createClient } from '@supabase/supabase-js';
import { inngest } from '../../inngest/client';
import { 
  BasePdfProxyService, 
  PdfProxyParams, 
  PdfProxyResponse 
} from './base-service';
import { SUPABASE_URL, SUPABASE_KEY } from '../../config';

export class InngestPdfProxyService implements BasePdfProxyService {
  private supabase: any; // Supabase client
  private inngest: any; // Inngest client

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    this.inngest = inngest;
  }

  async proxyPdf(params: PdfProxyParams): Promise<PdfProxyResponse> {
    try {
      console.log('📄 Processing PDF proxy via Inngest:', params.url);
      
      // If we have a bill ID, try to get a cached version first
      if (params.billId) {
        console.log('🔍 Checking for cached PDF for bill:', params.billId);
        
        const { data, error } = await this.supabase
          .storage
          .from('bill_pdfs')
          .createSignedUrl(`${params.billId}.pdf`, 60 * 60); // 1 hour expiry
        
        if (!error && data?.signedUrl) {
          console.log('✅ Found cached PDF in storage');
          return {
            status: 'complete',
            pdfUrl: data.signedUrl,
            cached: true,
            message: 'PDF retrieved from cache'
          };
        }
      }
      
      // If not cached, queue a job to fetch and cache it
      const { id: jobId } = await this.inngest.send({
        name: 'pdf.proxy.requested',
        data: {
          url: params.url,
          billId: params.billId,
          userIp: params.userIp
        }
      });
      
      console.log('✅ PDF proxy job queued with ID:', jobId);
      
      // Check if we can get immediate results
      const jobResults = await this.getJobResults(jobId);
      
      if (jobResults.status === 'complete') {
        return jobResults;
      }
      
      // Otherwise return processing status
      return {
        status: 'processing',
        jobId,
        message: 'Your PDF is being processed'
      };
    } catch (error) {
      console.error('❌ Error in Inngest PDF proxy:', error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to proxy PDF'
      };
    }
  }

  async getJobResults(jobId: string): Promise<PdfProxyResponse> {
    try {
      console.log('🔍 Checking PDF job results for:', jobId);
      
      // Check if we have saved results for this job
      const { data: resultsData } = await this.supabase
        .from('pdf_proxy_results')
        .select('*')
        .eq('job_id', jobId)
        .single();
      
      if (resultsData) {
        console.log('✅ Found completed PDF job results');
        return {
          status: 'complete',
          pdfUrl: resultsData.pdf_url,
          contentType: resultsData.content_type || 'application/pdf',
          contentLength: resultsData.content_length,
          cached: resultsData.cached || false,
          message: 'PDF processing complete'
        };
      }
      
      // No results yet, return processing status
      return {
        status: 'processing',
        jobId,
        message: 'Your PDF is still being processed'
      };
    } catch (error) {
      console.error('❌ Error checking PDF job results:', error);
      return {
        status: 'error',
        jobId,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to retrieve PDF results'
      };
    }
  }
} 