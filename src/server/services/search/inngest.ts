// Inngest implementation of search service

import { createClient } from '@supabase/supabase-js';
import { inngest } from '../../inngest/client';
import { 
  BaseSearchService, 
  SearchParams, 
  SearchResponse 
} from './base-service';
import { SUPABASE_URL, SUPABASE_KEY } from '../../config';

export class InngestSearchService implements BaseSearchService {
  private supabase: any; // Supabase client
  private inngest: any; // Inngest client

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    this.inngest = inngest;
  }

  async search(params: SearchParams): Promise<SearchResponse> {
    try {
      console.log('🔍 Performing Inngest semantic search:', params.query);
      
      // First check for cached results
      const { data: cachedResults } = await this.supabase
        .from('semantic_search_cache')
        .select('*')
        .eq('query', params.query)
        .eq('threshold', params.threshold || 0.2)
        .order('created_at', { ascending: false })
        .limit(1);
      
      // If we have cached results, return them immediately
      if (cachedResults && cachedResults.length > 0) {
        console.log('✅ Using cached search results');
        return {
          status: 'complete',
          results: cachedResults[0].results,
          query: params.query,
          cached: true
        };
      }
      
      // Otherwise, send an event to Inngest to process
      const { id: jobId } = await this.inngest.send({
        name: 'semantic.search.requested',
        data: {
          query: params.query,
          threshold: params.threshold || 0.2,
          limit: params.limit || 20,
          modelFilter: params.modelFilter,
          versionFilter: params.versionFilter
        }
      });
      
      console.log('✅ Search job queued with ID:', jobId);
      
      // Check if we can get immediate results (processing might be fast)
      const jobResults = await this.getJobResults(jobId);
      
      if (jobResults.status === 'complete') {
        return jobResults;
      }
      
      // Otherwise return the job ID for the client to poll
      return {
        status: 'processing',
        jobId,
        query: params.query,
        message: 'Your search is being processed'
      };
    } catch (error) {
      console.error('❌ Error in Inngest semantic search:', error);
      return {
        status: 'error',
        query: params.query,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to perform semantic search'
      };
    }
  }

  async getJobResults(jobId: string): Promise<SearchResponse> {
    try {
      console.log('🔍 Checking job results for:', jobId);
      
      // Check if results are in Supabase
      const { data: resultsData } = await this.supabase
        .from('semantic_search_results')
        .select('*')
        .eq('job_id', jobId)
        .single();
      
      if (resultsData) {
        console.log('✅ Found completed job results');
        return {
          status: 'complete',
          results: resultsData.results,
          query: resultsData.query
        };
      }
      
      // No results yet, return processing status
      return {
        status: 'processing',
        jobId,
        message: 'Your search is still being processed',
        query: 'Unknown query'
      };
    } catch (error) {
      console.error('❌ Error checking job results:', error);
      return {
        status: 'error',
        jobId,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to retrieve search results',
        query: 'Unknown query'
      };
    }
  }
} 