import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import fs from 'fs';
import { config } from 'dotenv';

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
      
      // In legacy mode, we'll use the original implementation
      if (LEGACY_MODE) {
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
          
          console.log('✅ Successfully processed semantic search');
          return res.json({
            query,
            threshold,
            bills: billsWithSimilarity,
            count: billsWithSimilarity.length
          });
        } else {
          console.log('✅ Successfully processed search but found no matches');
          return res.json({
            query,
            threshold,
            bills: [],
            count: 0
          });
        }
      } else {
        // In hybrid mode, use the service factory
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
        
        // Get appropriate search service based on configuration
        const searchService = await getSearchService();
        
        const searchResponse = await searchService.search({
          query,
          threshold,
          limit,
          modelFilter,
          versionFilter
        });
        
        // Return the search response
        return res.json(searchResponse);
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