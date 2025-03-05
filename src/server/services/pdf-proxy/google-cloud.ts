// Google Cloud implementation of PDF proxy service

import fetch from 'node-fetch';
import { 
  BasePdfProxyService, 
  PdfProxyParams, 
  PdfProxyResponse 
} from './base-service';

export class GoogleCloudPdfProxyService implements BasePdfProxyService {
  private headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
    'Accept': 'application/pdf,application/octet-stream,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.congress.gov/',
    'Origin': 'https://www.congress.gov'
  };

  async proxyPdf(params: PdfProxyParams): Promise<PdfProxyResponse> {
    try {
      console.log('📄 Proxying PDF request for:', params.url);
      
      // Validate URL
      let decodedUrl;
      try {
        decodedUrl = decodeURIComponent(params.url);
        new URL(decodedUrl); // Validate URL format
      } catch (urlError) {
        console.error('❌ Invalid URL format:', params.url);
        return {
          status: 'error',
          error: 'Invalid URL format',
          message: 'The provided URL is not valid'
        };
      }
      
      // Set a timeout of 30 seconds
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      
      try {
        // Fetch the PDF directly
        const response = await fetch(decodedUrl, { 
          headers: this.headers,
          signal: controller.signal,
          redirect: 'follow'  // Follow redirects
        });
        
        clearTimeout(timeout);
        
        if (!response.ok) {
          const errorMessage = `Failed to fetch PDF: ${response.status} ${response.statusText}`;
          console.error('❌', errorMessage, 'URL:', decodedUrl);
          return {
            status: 'error',
            error: errorMessage,
            message: 'Could not retrieve the PDF document'
          };
        }
        
        // Success - we don't return the actual PDF here, 
        // just the metadata so the calling function can forward the stream
        const contentType = response.headers.get('content-type');
        const contentLength = response.headers.get('content-length');
        
        console.log('✅ Successfully fetched PDF');
        return {
          status: 'complete',
          contentType: contentType || 'application/pdf',
          contentLength: contentLength ? parseInt(contentLength) : undefined,
          message: 'PDF fetched successfully',
          // Return the original URL - the Express server will handle streaming
          pdfUrl: params.url
        };
      } catch (fetchError: any) {
        clearTimeout(timeout);
        if (fetchError.name === 'AbortError') {
          console.error('❌ Request timed out after 30 seconds');
          return {
            status: 'error',
            error: 'Request timed out',
            message: 'The request took too long to complete'
          };
        }
        throw fetchError;
      }
    } catch (error) {
      console.error('❌ Error proxying PDF:', error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to proxy PDF document'
      };
    }
  }
} 