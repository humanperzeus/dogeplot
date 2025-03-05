// Search service interface

export interface SearchParams {
  query: string;
  threshold?: number;
  limit?: number;
  modelFilter?: string;
  versionFilter?: number;
}

export interface SearchResult {
  id: string;
  bill_number?: string;
  congress?: string;
  title?: string;
  similarity?: number;
  [key: string]: any; // Allow for additional bill properties
}

export interface SearchResponse {
  status: 'processing' | 'complete' | 'error';
  results?: SearchResult[];
  query: string;
  jobId?: string;
  error?: string;
  message?: string;
  cached?: boolean;
}

export interface BaseSearchService {
  // Perform a semantic search query
  search(params: SearchParams): Promise<SearchResponse>;

  // Get results from an existing job
  getJobResults?(jobId: string): Promise<SearchResponse>;
} 