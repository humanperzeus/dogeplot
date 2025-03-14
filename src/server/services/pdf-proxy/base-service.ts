// PDF Proxy service interface

export interface PdfProxyParams {
  url: string;
  billId?: string; // Optional bill ID if known
  userIp?: string; // Optional user IP for rate limiting
}

export interface PdfProxyResponse {
  status: 'processing' | 'complete' | 'error';
  pdfUrl?: string; // URL to access the PDF (direct or cached)
  contentType?: string;
  contentLength?: number;
  jobId?: string; // Only present for async processing
  error?: string;
  message?: string;
  cached?: boolean;
}

export interface BasePdfProxyService {
  // Proxy a PDF file from external source
  proxyPdf(params: PdfProxyParams): Promise<PdfProxyResponse>;
  
  // Get results from an existing job
  getJobResults?(jobId: string): Promise<PdfProxyResponse>;
} 