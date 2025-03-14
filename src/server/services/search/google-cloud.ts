// Google Cloud implementation of semantic search service

import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import { 
  BaseSearchService, 
  SearchParams, 
  SearchResponse
} from './base-service';
import { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY } from '../../config';

export class GoogleCloudSearchService implements BaseSearchService {
  private openai: OpenAI;
  private supabase: any; // Supabase client

  constructor() {
    // Initialize clients
    this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  async search(params: SearchParams): Promise<SearchResponse> {
    try {
      console.log('🔍 Performing Google Cloud semantic search:', params.query);
      
      // Generate embedding for the query
      const embeddingResponse = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: params.query
      });
      
      const embedding = embeddingResponse.data[0].embedding;
      
      // Search for similar bills using the embedding
      const { data: searchResults, error } = await this.supabase.rpc('search_bills_by_embedding', {
        input_embedding: embedding,
        input_match_threshold: params.threshold || 0.2,
        input_match_count: params.limit || 20,
        input_model_filter: params.modelFilter,
        input_version_filter: params.versionFilter
      });
      
      if (error) {
        console.error('❌ Supabase search error:', error);
        throw error;
      }
      
      console.log(`✅ Found ${searchResults.length} semantic matches`);
      
      // Return complete response with results
      return {
        status: 'complete',
        results: searchResults,
        query: params.query
      };
    } catch (error) {
      console.error('❌ Error in Google Cloud semantic search:', error);
      return {
        status: 'error',
        query: params.query,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to perform semantic search'
      };
    }
  }
} 