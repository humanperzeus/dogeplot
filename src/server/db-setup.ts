// Database setup for hybrid approach
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Create necessary tables for hybrid approach
export async function setupTables() {
  console.log('🗄️ Setting up database tables for hybrid approach...');
  
  try {
    // 1. Create table for semantic search results
    const createSearchResultsTable = await supabase.rpc('create_table_if_not_exists', {
      table_name: 'semantic_search_results',
      table_definition: `
        job_id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        results JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      `
    });
    
    if (createSearchResultsTable.error) {
      console.error('❌ Failed to create semantic_search_results table:', createSearchResultsTable.error);
    } else {
      console.log('✅ semantic_search_results table created or already exists');
    }
    
    // 2. Create table for semantic search cache
    const createSearchCacheTable = await supabase.rpc('create_table_if_not_exists', {
      table_name: 'semantic_search_cache',
      table_definition: `
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        query TEXT NOT NULL,
        threshold FLOAT NOT NULL,
        results JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      `
    });
    
    if (createSearchCacheTable.error) {
      console.error('❌ Failed to create semantic_search_cache table:', createSearchCacheTable.error);
    } else {
      console.log('✅ semantic_search_cache table created or already exists');
    }
    
    // 3. Create table for PDF proxy results
    const createPdfProxyResultsTable = await supabase.rpc('create_table_if_not_exists', {
      table_name: 'pdf_proxy_results',
      table_definition: `
        job_id TEXT PRIMARY KEY,
        pdf_url TEXT NOT NULL,
        content_type TEXT,
        content_length INTEGER,
        cached BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      `
    });
    
    if (createPdfProxyResultsTable.error) {
      console.error('❌ Failed to create pdf_proxy_results table:', createPdfProxyResultsTable.error);
    } else {
      console.log('✅ pdf_proxy_results table created or already exists');
    }
    
    // 4. Create indexes for better performance
    const createSearchCacheIndex = await supabase.rpc('create_index_if_not_exists', {
      index_name: 'idx_search_cache_query_threshold',
      table_name: 'semantic_search_cache',
      index_definition: '(query, threshold)'
    });
    
    if (createSearchCacheIndex.error) {
      console.error('❌ Failed to create search cache index:', createSearchCacheIndex.error);
    } else {
      console.log('✅ search cache index created or already exists');
    }
    
    // 5. Create function for cleaning up old cache entries (auto maintenance)
    const createMaintenanceFunction = await supabase.rpc('create_function_if_not_exists', {
      function_name: 'cleanup_old_cache_entries',
      function_definition: `
        BEGIN
          -- Delete semantic search cache older than 7 days
          DELETE FROM semantic_search_cache 
          WHERE created_at < NOW() - INTERVAL '7 days';
          
          -- Delete job results older than 1 day
          DELETE FROM semantic_search_results
          WHERE created_at < NOW() - INTERVAL '1 day';
          
          DELETE FROM pdf_proxy_results
          WHERE created_at < NOW() - INTERVAL '1 day';
          
          RETURN 'Cache cleanup complete';
        END;
      `
    });
    
    if (createMaintenanceFunction.error) {
      console.error('❌ Failed to create maintenance function:', createMaintenanceFunction.error);
    } else {
      console.log('✅ Maintenance function created or already exists');
    }
    
    console.log('🎉 Database setup complete!');
    return true;
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    console.error('You may need to add the following RPC functions manually in the SQL editor:');
    console.error('- create_table_if_not_exists(table_name TEXT, table_definition TEXT)');
    console.error('- create_index_if_not_exists(index_name TEXT, table_name TEXT, index_definition TEXT)');
    console.error('- create_function_if_not_exists(function_name TEXT, function_definition TEXT)');
    return false;
  }
}

// Helper to check if all required database objects exist
export async function checkDatabaseSetup(): Promise<boolean> {
  try {
    // Check if semantic_search_results table exists
    const { data: searchResultsTable, error: searchResultsError } = await supabase
      .from('information_schema.tables')
      .select('*')
      .eq('table_name', 'semantic_search_results')
      .single();
    
    // Check if semantic_search_cache table exists
    const { data: searchCacheTable, error: searchCacheError } = await supabase
      .from('information_schema.tables')
      .select('*')
      .eq('table_name', 'semantic_search_cache')
      .single();
    
    // Check if pdf_proxy_results table exists
    const { data: pdfProxyTable, error: pdfProxyError } = await supabase
      .from('information_schema.tables')
      .select('*')
      .eq('table_name', 'pdf_proxy_results')
      .single();
    
    const allTablesExist = !!searchResultsTable && !!searchCacheTable && !!pdfProxyTable;
    
    if (!allTablesExist) {
      console.warn('⚠️ Some required tables are missing. Run setupTables() to create them.');
    }
    
    return allTablesExist;
  } catch (error) {
    console.error('❌ Error checking database setup:', error);
    return false;
  }
} 