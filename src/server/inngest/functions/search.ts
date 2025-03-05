// Inngest functions for semantic search
// Note: To use Inngest, you'll need to run: npm install inngest

import { inngest } from '../client';
import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY } from '../../config';

// Initialize OpenAI and Supabase clients
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Create a function to process semantic search requests
export const processSemanticSearch = inngest.createFunction(
  { name: 'Process Semantic Search' },
  { event: 'semantic.search.requested' },
  async ({ event, step }) => {
    const { query, threshold = 0.2, limit = 20, modelFilter, versionFilter } = event.data;
    
    console.log(`🔍 Processing semantic search request: "${query}"`);
    
    try {
      // Check if we have a cached result first
      const { data: cachedResults } = await step.run('check-cache', async () => {
        const { data } = await supabase
          .from('semantic_search_cache')
          .select('*')
          .eq('query', query)
          .eq('threshold', threshold)
          .order('created_at', { ascending: false })
          .limit(1);
          
        return { data };
      });
      
      // If we have cached results, return them
      if (cachedResults && cachedResults.length > 0) {
        console.log('🔍 Found cached results for query');
        return { 
          success: true, 
          cached: true,
          count: cachedResults[0].results.length,
          results: cachedResults[0].results,
          query
        };
      }
      
      // Otherwise, generate embedding and search
      const embedding = await step.run('generate-embedding', async () => {
        console.log('🧠 Generating embedding for query');
        
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: query
        });
        
        return response.data[0].embedding;
      });
      
      const searchResults = await step.run('search-database', async () => {
        console.log('🔍 Searching database with embedding');
        
        const { data, error } = await supabase.rpc('search_bills_by_embedding', {
          input_embedding: embedding,
          input_match_threshold: threshold,
          input_match_count: limit,
          input_model_filter: modelFilter,
          input_version_filter: versionFilter
        });
        
        if (error) {
          console.error('❌ Supabase search error:', error);
          throw new Error(`Database search failed: ${error.message}`);
        }
        
        return data || [];
      });
      
      // Cache the results for future queries
      await step.run('cache-results', async () => {
        console.log('💾 Caching search results');
        
        await supabase.from('semantic_search_cache').insert({
          query,
          threshold,
          results: searchResults,
          created_at: new Date().toISOString()
        });
      });
      
      console.log(`✅ Semantic search complete, found ${searchResults.length} results`);
      
      return { 
        success: true, 
        count: searchResults.length,
        results: searchResults,
        query
      };
    } catch (error) {
      console.error('❌ Error in semantic search function:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error),
        query
      };
    }
  }
); 