import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import fs from 'fs';
import { config } from 'dotenv';
// Add the server cache import
const serverCache = require('./cache');

// LEGACY MODE CHECK - If DISABLE_HYBRID=true, we'll skip loading the hybrid services
const LEGACY_MODE = process.env.DISABLE_HYBRID === 'true';
console.log(`\n${LEGACY_MODE ? '🔄 RUNNING IN LEGACY MODE (Original Implementation)' : '🔄 RUNNING IN HYBRID MODE'}`);

// @ts-ignore - The following lines declare variables that may be conditionally loaded
let validateConfig, isUsingInngest, getSearchService, getPdfProxyService, checkDatabaseSetup, setupTables, registerInngestFunctions;

if (!LEGACY_MODE) {
  try {
    // Import our new service infrastructure
    ({ validateConfig, isUsingInngest } = require('./config'));
    ({ getSearchService, getPdfProxyService } = require('./service-factory'));
    ({ checkDatabaseSetup, setupTables } = require('./db-setup'));
    ({ registerInngestFunctions } = require('./inngest/client'));
    
    console.log('✅ Hybrid mode services loaded successfully');
  } catch (error) {
    console.warn('⚠️ Failed to load hybrid services:', error);
    console.warn('⚠️ Falling back to legacy mode');
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize environment
console.log('\n=== Server Initialization ===');

// Load environment based on mode
const mode = process.env.VITE_MODE || 'staging';
const envFile = mode === 'production' ? '.env.production' : 
                mode === 'production.proxy' ? '.env.production.proxy' :
                mode === 'staging.proxy' ? '.env.staging.proxy' : 
                '.env.staging';

console.log('🌍 Server Mode:', mode);
console.log('📂 Using env file:', envFile);

// Load environment variables
config({ path: resolve(__dirname, `../../${envFile}`) });

try {
  // Validate configuration
  validateConfig();
  
  const app = express();
  
  // Configure CORS
  const corsOptions = {
    origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      // Log the origin for debugging
      console.log('🔒 CORS Request from:', origin);
      
      // In development or when no origin is provided (like local requests)
      if (!origin || process.env.NODE_ENV === 'development') {
        console.log('✅ Allowing request (development or no origin)');
        callback(null, true);
        return;
      }

      // Get the current domain from the origin
      try {
        const originUrl = new URL(origin);
        const domain = originUrl.hostname;

        // Allow localhost in all environments
        if (domain === 'localhost') {
          console.log('✅ Allowing localhost request');
          callback(null, true);
          return;
        }

        // In production proxy mode, be more permissive
        if (process.env.VITE_MODE?.includes('proxy')) {
          console.log('✅ Allowing request in proxy mode');
          callback(null, true);
          return;
        }

        // Allow all subdomains of dogeplot.fun and cloud run domains
        if (
          domain === 'dogeplot.fun' ||
          domain === 'staging.dogeplot.fun' ||
          domain.endsWith('.dogeplot.fun') || 
          domain.endsWith('run.app') ||
          domain.endsWith('cloudflare.com')
        ) {
          console.log('✅ Allowing request from authorized domain:', domain);
          callback(null, true);
          return;
        }

        // Log unauthorized attempts
        console.warn('⚠️ Rejected CORS request from:', origin);
        callback(new Error('Not allowed by CORS'));
      } catch (error) {
        console.error('❌ Error parsing origin:', error);
        callback(new Error('Invalid origin'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    optionsSuccessStatus: 200
  };

  app.use(cors(corsOptions));

  // Add POST handler for root path to handle Cloudflare challenge
  app.post('/', (req, res) => {
    // Redirect to GET /
    res.redirect(307, '/');
  });

  // Serve static files from the dist directory
  const distPath = resolve(__dirname, '../../dist');
  app.use(express.static(distPath));
  console.log('📂 Serving static files from:', distPath);

  // Verify Supabase configuration
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured');
  }
  console.log('🔌 Supabase URL configured:', supabaseUrl);

  // Setup proxy routes
  app.get('/proxy/pdf', async (req, res) => {
    try {
      const pdfUrl = req.query.url as string;
      if (!pdfUrl) {
        console.error('❌ Missing PDF URL in request');
        return res.status(400).json({
          error: 'PDF URL is required',
          code: 'MISSING_URL'
        });
      }

      // Decode and validate URL
      let decodedUrl;
      try {
        decodedUrl = decodeURIComponent(pdfUrl);
        new URL(decodedUrl); // Validate URL format
      } catch (urlError) {
        console.error('❌ Invalid URL format:', pdfUrl);
        return res.status(400).json({
          error: 'Invalid URL format',
          code: 'INVALID_URL',
          url: pdfUrl
        });
      }

      console.log('📄 Proxying PDF request for:', decodedUrl);
      
      // Add headers that might help with CORS or authentication
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept': 'application/pdf,application/octet-stream,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.congress.gov/',
        'Origin': 'https://www.congress.gov'
      };

      // Set a timeout of 30 seconds
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(decodedUrl, { 
          headers,
          signal: controller.signal,
          redirect: 'follow'  // Follow redirects
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
          const errorMessage = `Failed to fetch PDF: ${response.status} ${response.statusText}`;
          console.error('❌', errorMessage);
          console.error('URL:', decodedUrl);
          console.error('Response headers:', response.headers);
          return res.status(response.status).json({
            error: errorMessage,
            code: 'FETCH_ERROR',
            status: response.status,
            statusText: response.statusText
          });
        }

        const contentType = response.headers.get('content-type');
        const contentLength = response.headers.get('content-length');

        // Get origin for CORS
        const origin = req.get('origin');
        if (origin) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
        } else {
          res.setHeader('Access-Control-Allow-Origin', '*');
        }
        
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

        if (contentType) {
          res.setHeader('Content-Type', contentType);
          console.log('📝 Content-Type:', contentType);
        }

        if (contentLength) {
          res.setHeader('Content-Length', contentLength);
          console.log('📦 Content-Length:', parseInt(contentLength).toLocaleString(), 'bytes');
        }

        // Check if response body exists
        if (!response.body) {
          throw new Error('Response body is null');
        }

        // Stream the response
        response.body.pipe(res);

        // Log success after streaming starts
        console.log('✅ Started streaming PDF response');

      } catch (fetchError: any) {
        clearTimeout(timeout);
        if (fetchError.name === 'AbortError') {
          console.error('❌ Request timed out after 30 seconds');
          return res.status(504).json({
            error: 'Request timed out',
            code: 'TIMEOUT',
            url: decodedUrl
          });
        }
        throw fetchError;
      }

    } catch (error: any) {
      console.error('❌ Error proxying PDF:', {
        message: error.message,
        stack: error.stack,
        url: req.query.url
      });
      
      return res.status(500).json({
        error: 'Error proxying PDF',
        code: 'PROXY_ERROR',
        message: error.message
      });
    }
  });

  // Semantic search proxy endpoint
  app.get('/proxy/semantic-search', async (req, res) => {
    try {
      console.log('📞 Received semantic search request');
      
      // Get query parameters
      const query = req.query.query as string;
      const threshold = parseFloat(req.query.threshold as string || '0.2');
      const limit = parseInt(req.query.limit as string || '20');
      const modelFilter = req.query.modelFilter as string;
      const versionFilter = req.query.versionFilter ? parseInt(req.query.versionFilter as string) : undefined;
      
      if (!query) {
        console.error('❌ Missing query in semantic search request');
        return res.status(400).json({
          error: 'Search query is required',
          code: 'MISSING_QUERY'
        });
      }
      
      // Create a cache key based on the search parameters
      const cacheKey = `semantic_search_${query}_${threshold}_${limit}_${modelFilter || 'any'}_${versionFilter || 'any'}`;
      
      // Check if we have cached results
      const cachedResults = serverCache.get(cacheKey);
      if (cachedResults) {
        console.log('📦 Returning cached semantic search results');
        return res.json(cachedResults);
      }
      
      // In legacy mode, we'll use the original implementation
      if (LEGACY_MODE) {
        console.log('🔍 Processing semantic search in LEGACY mode:', query);
        console.log('  Threshold:', threshold);
        console.log('  Limit:', limit);
        
        // Load OpenAI configuration
        const openaiApiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
        if (!openaiApiKey) {
          console.error('❌ Missing OpenAI API key');
          return res.status(500).json({
            error: 'Server configuration error',
            code: 'MISSING_API_KEY'
          });
        }
        
        // Load Supabase configuration
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
          console.error('❌ Missing Supabase credentials');
          return res.status(500).json({
            error: 'Server configuration error',
            code: 'MISSING_SUPABASE_CONFIG'
          });
        }
        
        try {
          // Generate embedding for the query
          console.log('  Generating embedding via OpenAI...');
          const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              input: query
            })
          });
          
          if (!embeddingResponse.ok) {
            const errorData = await embeddingResponse.json();
            console.error('❌ OpenAI API error:', errorData);
            return res.status(502).json({
              error: 'Failed to generate embedding',
              code: 'EMBEDDING_GENERATION_ERROR',
              details: errorData
            });
          }
          
          interface EmbeddingData {
            data: [{
              embedding: number[]
            }]
          }
          
          const embeddingData = await embeddingResponse.json() as EmbeddingData;
          const embedding = embeddingData.data[0].embedding;
          
          console.log('  Embedding generated, searching in Supabase...');
          
          // Search in Supabase with the embedding
          const supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/search_bills_by_embedding`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
              input_embedding: embedding,
              input_match_threshold: threshold,
              input_match_count: limit,
              input_model_filter: modelFilter,
              input_version_filter: versionFilter
            })
          });
          
          if (!supabaseResponse.ok) {
            const errorText = await supabaseResponse.text();
            console.error('❌ Supabase search error:', errorText);
            return res.status(502).json({
              error: 'Database search failed',
              code: 'SUPABASE_SEARCH_ERROR'
            });
          }
          
          interface SearchResult {
            id: string;
            bill_number: string;
            congress: string;
            title: string;
            similarity: number;
            embedding_model: string;
            embedding_version: number;
          }
          
          const searchResults = await supabaseResponse.json() as SearchResult[];
          console.log(`  Found ${searchResults.length} semantic matches`);
          
          // Get full bill details for all results
          if (searchResults.length > 0) {
            const billIds = searchResults.map((r: SearchResult) => r.id);
            
            // Create a comma-separated list of UUIDs in quotes for SQL
            const idList = billIds.map((id: string) => `"${id}"`).join(',');
            
            // Fetch the full bill details
            const billsResponse = await fetch(`${supabaseUrl}/rest/v1/bills?id=in.(${idList})`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
              }
            });
            
            if (!billsResponse.ok) {
              console.error('❌ Failed to fetch bill details');
              return res.status(502).json({
                error: 'Failed to fetch bill details',
                code: 'BILL_DETAILS_ERROR'
              });
            }
            
            interface Bill {
              id: string;
              bill_number: string;
              congress: string;
              title: string;
              [key: string]: any;
            }
            
            // Get the full bills data
            const billsData = await billsResponse.json() as Bill[];
            
            // Add similarity scores to the bill objects
            const billsWithSimilarity = billsData.map((bill: Bill) => {
              const resultMatch = searchResults.find((r: SearchResult) => r.id === bill.id);
              return {
                ...bill,
                similarity: resultMatch ? resultMatch.similarity : 0
              };
            });
            
            // Sort by similarity score (highest first)
            billsWithSimilarity.sort((a: any, b: any) => b.similarity - a.similarity);
            
            // Cache the results for 24 hours (86400000 ms)
            const responseData = {
              query,
              threshold,
              bills: billsWithSimilarity,
              count: billsWithSimilarity.length
            };
            serverCache.set(cacheKey, responseData, 86400000);
            console.log(`📦 Cached semantic search results for "${query}" (24 hour TTL)`);
            
            console.log('✅ Successfully processed semantic search');
            return res.json(responseData);
          } else {
            const emptyResponseData = {
              query,
              threshold,
              bills: [],
              count: 0
            };
            // Cache empty results too (24 hour TTL)
            serverCache.set(cacheKey, emptyResponseData, 86400000);
            
            console.log('✅ Successfully processed search but found no matches');
            return res.json(emptyResponseData);
          }
        } catch (searchError) {
          console.error('❌ Error in semantic search processing:', searchError);
          return res.status(502).json({
            error: 'Search processing failed',
            code: 'SEARCH_PROCESSING_ERROR'
          });
        }
      } else {
        // In hybrid mode, use the service factory
        console.log('🔍 Processing semantic search in HYBRID mode:', query);
        
        try {
          // Get appropriate search service based on configuration
          const searchService = await getSearchService();
          
          const searchResponse = await searchService.search({
            query,
            threshold,
            limit,
            modelFilter,
            versionFilter
          });
          
          // Cache the results for 24 hours (86400000 ms)
          serverCache.set(cacheKey, searchResponse, 86400000);
          console.log(`📦 Cached semantic search results for "${query}" (24 hour TTL)`);
          
          // Return the search response
          return res.json(searchResponse);
        } catch (searchError) {
          console.error('❌ Error in hybrid search processing:', searchError);
          return res.status(502).json({
            error: 'Search processing failed',
            code: 'SEARCH_PROCESSING_ERROR'
          });
        }
      }
    } catch (error) {
      console.error('❌ Error in semantic search:', error);
      return res.status(500).json({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        message: 'Error processing semantic search'
      });
    }
  });

  // Get semantic search job results (for Inngest async processing)
  app.get('/proxy/semantic-search/job/:jobId', async (req, res) => {
    try {
      const jobId = req.params.jobId;
      
      if (!jobId) {
        return res.status(400).json({
          error: 'Job ID is required',
          code: 'MISSING_JOB_ID'
        });
      }
      
      const searchService = await getSearchService();
      
      if (!searchService.getJobResults) {
        return res.status(400).json({
          error: 'Current processor does not support job polling',
          code: 'NOT_SUPPORTED'
        });
      }
      
      const results = await searchService.getJobResults(jobId);
      return res.json(results);
    } catch (error) {
      console.error('❌ Error retrieving job results:', error);
      return res.status(500).json({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        message: 'Error retrieving search results'
      });
    }
  });

  // Add this new endpoint for bill statistics
  app.get('/api/bill-stats', async (req, res) => {
    try {
      console.log('📊 Bill statistics API endpoint called');
      
      // Check if we have cached stats
      const cachedStats = serverCache.get('bill_stats');
      if (cachedStats) {
        console.log('📦 Returning cached bill statistics');
        return res.json(cachedStats);
      }
      
      console.log('🔄 No cached stats found, fetching fresh data');
      
      // Create Supabase client for this request
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Missing Supabase credentials' });
      }
      
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Get count for 118th Congress
      const { count: congress118Count, error: error118 } = await supabase
        .from('bills')
        .select('*', { count: 'exact', head: true })
        .eq('congress', '118');
      
      if (error118) {
        console.error('Error fetching 118th Congress count:', error118);
        return res.status(500).json({ error: 'Failed to fetch 118th Congress count' });
      }
      
      // Get count for 119th Congress
      const { count: congress119Count, error: error119 } = await supabase
        .from('bills')
        .select('*', { count: 'exact', head: true })
        .eq('congress', '119');
      
      if (error119) {
        console.error('Error fetching 119th Congress count:', error119);
        return res.status(500).json({ error: 'Failed to fetch 119th Congress count' });
      }
      
      // Check if bills are vectorized
      const { count: vectorizedCount, error: vectorizedError } = await supabase
        .from('bill_embeddings')
        .select('*', { count: 'exact', head: true });
      
      if (vectorizedError) {
        console.error('Error checking vectorization status:', vectorizedError);
        return res.status(500).json({ error: 'Failed to check vectorization status' });
      }
      
      // Create fresh statistics
      const freshStats = {
        congress118Count: congress118Count || 0,
        congress119Count: congress119Count || 0,
        latestCutoffDate: new Date().toISOString().split('T')[0],
        isVectorized: vectorizedCount > 0,
        lastRefreshed: new Date().toISOString()
      };
      
      // Store in server cache (24 hour TTL)
      serverCache.set('bill_stats', freshStats);
      
      // Also update the database cache for other services
      try {
        await supabase
          .from('cached_statistics')
          .upsert({
            id: 'bill_stats',
            data: freshStats,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          });
        
        console.log('✅ Database cache also updated');
      } catch (dbError) {
        console.warn('⚠️ Failed to update database cache:', dbError);
        // Continue anyway since we have the server cache
      }
      
      return res.json(freshStats);
    } catch (error) {
      console.error('Error in bill-stats endpoint:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Add this new endpoint to reset the bill statistics cache
  app.post('/api/bill-stats/reset', async (req, res) => {
    try {
      console.log('🧹 Bill statistics cache reset requested');
      
      // Clear the server cache
      serverCache.del('bill_stats');
      serverCache.del('trending_bills'); // Also clear trending bills cache
      
      // Also clear the database cache
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
          return res.status(500).json({ error: 'Missing Supabase credentials' });
        }
        
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Delete bill stats cache
        await supabase
          .from('cached_statistics')
          .delete()
          .eq('id', 'bill_stats');
        
        // Delete trending bills cache
        await supabase
          .from('cached_statistics')
          .delete()
          .eq('id', 'trending_bills');
        
        console.log('✅ Database cache cleared for bill stats and trending bills');
      } catch (dbError) {
        console.warn('⚠️ Failed to clear database cache:', dbError);
        // Continue anyway since we cleared the server cache
      }
      
      // Return success
      return res.json({ success: true, message: 'Bill statistics and trending bills cache cleared' });
    } catch (error) {
      console.error('Error in bill-stats reset endpoint:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Add this new endpoint for trending bills
  app.get('/api/trending-bills', async (req, res) => {
    try {
      console.log('🔥 Trending bills API endpoint called');
      
      // Check if we have cached trending bills
      const cachedTrendingBills = serverCache.get('trending_bills');
      if (cachedTrendingBills) {
        console.log('📦 Returning cached trending bills');
        return res.json(cachedTrendingBills);
      }
      
      console.log('🔄 No cached trending bills found, fetching fresh data');
      
      // Create Supabase client for this request
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Missing Supabase credentials' });
      }
      
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Define the limit for trending bills
      const TRENDING_BILLS_LIMIT = 3;
      
      // Get the most recently updated bills with text
      const { data: bills, error: billsError } = await supabase
        .from('bills')
        .select(`
          id,
          bill_number,
          congress,
          title,
          introduction_date,
          latest_action_date,
          latest_action_text,
          sponsors,
          status,
          bill_type,
          has_full_text,
          pdf_url,
          summary
        `)
        .eq('has_full_text', true)
        .order('latest_action_date', { ascending: false })
        .limit(TRENDING_BILLS_LIMIT * 2); // Fetch more than needed to filter
      
      if (billsError) {
        console.error('Error fetching trending bills:', billsError);
        return res.status(500).json({ error: 'Failed to fetch trending bills' });
      }
      
      // Filter to get a mix of bills from different congresses if possible
      let congress118Bills = bills.filter(bill => bill.congress === '118');
      let congress119Bills = bills.filter(bill => bill.congress === '119');
      
      // Ensure we have at least some bills from each congress if available
      let trendingBills = [];
      
      // Try to get an even mix, but prioritize newer bills
      if (congress119Bills.length >= TRENDING_BILLS_LIMIT) {
        // If we have enough 119th congress bills, use those
        trendingBills = congress119Bills.slice(0, TRENDING_BILLS_LIMIT);
      } else if (congress119Bills.length > 0) {
        // Use all 119th congress bills and fill the rest with 118th
        trendingBills = [
          ...congress119Bills,
          ...congress118Bills.slice(0, TRENDING_BILLS_LIMIT - congress119Bills.length)
        ];
      } else {
        // If no 119th congress bills, use 118th
        trendingBills = congress118Bills.slice(0, TRENDING_BILLS_LIMIT);
      }
      
      // Limit to the desired number
      trendingBills = trendingBills.slice(0, TRENDING_BILLS_LIMIT);
      
      // Transform the data to match what the frontend expects
      const transformedBills = trendingBills.map(bill => {
        // Extract bill type from bill_number (e.g., "HR 1234" -> "hr")
        const billNumberParts = bill.bill_number.split(' ');
        const billType = billNumberParts[0].toLowerCase();
        
        return {
          ...bill,
          // Ensure bill_type is never null or undefined
          bill_type: bill.bill_type || billType,
          // Add any other required fields with defaults
          billNumber: bill.bill_number,
          billType: bill.bill_type || billType,
          latestActionText: bill.latest_action_text || '',
          sponsors: bill.sponsors || [],
          subjects: [],
          committeesCount: 0,
          cosponsorsCount: 0,
          withdrawnCosponsorsCount: 0,
          actionsCount: 0
        };
      });
      
      // Store in server cache (24 hour TTL)
      serverCache.set('trending_bills', transformedBills);
      
      // Also update the database cache for other services
      try {
        await supabase
          .from('cached_statistics')
          .upsert({
            id: 'trending_bills',
            data: transformedBills,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          });
        
        console.log('✅ Database cache also updated for trending bills');
      } catch (dbError) {
        console.warn('⚠️ Failed to update database cache for trending bills:', dbError);
        // Continue anyway since we have the server cache
      }
      
      return res.json(transformedBills);
    } catch (error) {
      console.error('Error in trending-bills endpoint:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Add this new endpoint to reset the semantic search cache
  app.post('/api/semantic-search/reset', handleSemanticSearchReset);
  // Add an alias route in case the path is different
  app.post('/proxy/semantic-search/reset', handleSemanticSearchReset);

  // Handler function for semantic search reset
  async function handleSemanticSearchReset(req, res) {
    try {
      console.log('🧹 Semantic search cache reset requested');
      
      // Get all cache keys
      const cacheStats = serverCache.stats();
      const semanticSearchKeys = cacheStats.keys.filter(key => key.startsWith('semantic_search_'));
      
      // Clear all semantic search cache keys
      let clearedCount = 0;
      for (const key of semanticSearchKeys) {
        serverCache.del(key);
        clearedCount++;
      }
      
      console.log(`✅ Cleared ${clearedCount} semantic search cache entries`);
      
      // Return success
      return res.json({ 
        success: true, 
        message: `Semantic search cache cleared (${clearedCount} entries)` 
      });
    } catch (error) {
      console.error('Error in semantic-search reset endpoint:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Handle client-side routing - serve index.html for all routes
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });

  // Get port from environment variable with fallback and alternative
  const primaryPort = parseInt(process.env.PORT || '3001');
  const alternativePort = parseInt(process.env.PORT || '3002');
  
  // Try primary port first
  try {
    app.listen(primaryPort, () => {
      console.log(`\n🚀 Server running on port ${primaryPort}`);
      console.log('✅ PDF proxy enabled');
      console.log('═══════════════════════════════\n');
    });
  } catch (error: any) {
    if (error.code === 'EADDRINUSE') {
      console.log(`\n⚠️ Port ${primaryPort} is in use, trying port ${alternativePort}...`);
      // Try alternative port
      app.listen(alternativePort, () => {
        console.log(`\n🚀 Server running on port ${alternativePort}`);
        console.log('✅ PDF proxy enabled');
        console.log('═══════════════════════════════\n');
      });
    } else {
      throw error;
    }
  }

  // Setup database tables and Inngest if configured
  if (isUsingInngest()) {
    // Use an IIFE to contain the async code
    (async () => {
      try {
        console.log('🔧 Using Inngest processor, checking database setup...');
        const tablesExist = await checkDatabaseSetup();
        
        if (!tablesExist) {
          console.log('🔧 Setting up required database tables...');
          await setupTables();
        }
      } catch (error) {
        console.warn('⚠️ Failed to set up database:', error);
      }
    })().catch(error => {
      console.error('❌ Database setup failed:', error);
    });
    
    // Register Inngest functions with Express
    try {
      registerInngestFunctions(app);
    } catch (error) {
      console.warn('⚠️ Failed to register Inngest functions:', error);
      console.warn('This is normal if you haven\'t installed Inngest yet.');
      console.warn('You can install it with: npm install inngest inngest/express');
    }
  } else {
    console.log('🔧 Using Google Cloud processor');
  }

} catch (error) {
  console.error('❌ Server initialization failed:', error);
  process.exit(1);
} 