import { createClient } from '@supabase/supabase-js';
import { envLoader } from './loadEnv.js';
import { Command } from 'commander';
import axios from 'axios';

async function setupVectorTable() {
  console.log('\n=== Setting Up Vector Table ===');
  
  // Get Supabase credentials from environment
  const supabaseUrl = envLoader.getVariable('VITE_SUPABASE_URL');
  const supabaseServiceKey = envLoader.getVariable('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Missing Supabase credentials in environment');
    process.exit(1);
  }
  
  console.log(`🔌 Connecting to Supabase: ${supabaseUrl}`);
  
  // Try to use the Supabase Management API approach
  console.log('Attempting to set up vector extension using Supabase dashboard...');
  console.log('Please ensure vector extension is enabled in the Supabase dashboard:');
  console.log('1. Go to https://supabase.com/dashboard/project/_/database/extensions');
  console.log('2. Find "vector" in the list and click "Enable"');
  console.log('3. If not available, you may need to upgrade your plan to enable the extension');
  console.log('\nProceeding with table creation (which may work if extension is already enabled)...');
  
  try {
    // We'll use direct SQL via REST API instead of RPC
    const restUrl = `${supabaseUrl}/rest/v1/`;
    const headers = {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    
    // Step 2: Create the bill_embeddings table
    console.log('Creating bill_embeddings table...');
    try {
      const response = await axios.post(
        `${restUrl}sql`,
        { 
          query: `
            CREATE TABLE IF NOT EXISTS bill_embeddings (
              id UUID PRIMARY KEY REFERENCES bills(id) ON DELETE CASCADE,
              embedding vector(1536),
              embedding_model VARCHAR NOT NULL,
              embedding_version INTEGER NOT NULL DEFAULT 1,
              text_processed TEXT,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
            );
          `
        },
        { headers }
      );
      console.log('   ✅ bill_embeddings table created');
      console.log('   Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('   ❌ Error creating bill_embeddings table:');
      console.error('   Status:', error.response?.status);
      console.error('   Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('   Message:', error.message);
      
      // If we got a 400 with a specific error about vector, it means the vector extension is not enabled
      if (error.response?.status === 400 && 
          (error.response?.data?.message?.includes('type "vector" does not exist') || 
           error.response?.data?.details?.includes('type "vector" does not exist'))) {
        console.error('\n❌ ERROR: The vector extension is not enabled in Supabase.');
        console.error('Please enable it via the Supabase dashboard before continuing.');
        console.error('Go to: https://supabase.com/dashboard/project/_/database/extensions');
        console.error('Find "vector" in the list and click "Enable"');
        process.exit(1);
      }
      
      process.exit(1);
    }
    
    // Step 3: Create index for faster similarity searches
    console.log('Creating vector search index...');
    try {
      const response = await axios.post(
        `${restUrl}sql`,
        { 
          query: `
            CREATE INDEX IF NOT EXISTS bill_embeddings_embedding_idx 
            ON bill_embeddings 
            USING ivfflat (embedding vector_cosine_ops) 
            WITH (lists = 100);
          `
        },
        { headers }
      );
      console.log('   ✅ Vector search index created');
    } catch (error) {
      console.error('   ❌ Error creating index:');
      console.error('   Status:', error.response?.status);
      console.error('   Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('   Message:', error.message);
      // This might fail if the index already exists, which is fine
      console.log('   ⚠️ Continuing despite index error...');
    }
    
    // Step 4: Create function for similarity search
    console.log('Creating similarity search function...');
    try {
      const response = await axios.post(
        `${restUrl}sql`,
        { 
          query: `
            CREATE OR REPLACE FUNCTION search_bills_by_embedding(
              query_embedding vector(1536),
              match_threshold float,
              match_count int
            )
            RETURNS TABLE (
              id UUID,
              bill_number VARCHAR,
              congress VARCHAR,
              title TEXT,
              similarity float
            )
            LANGUAGE plpgsql
            SECURITY DEFINER
            AS $$
            BEGIN
              RETURN QUERY
              SELECT
                b.id,
                b.bill_number,
                b.congress,
                b.title,
                1 - (be.embedding <=> query_embedding) as similarity
              FROM
                bill_embeddings be
              JOIN
                bills b ON b.id = be.id
              WHERE
                1 - (be.embedding <=> query_embedding) > match_threshold
              ORDER BY
                similarity DESC
              LIMIT match_count;
            END;
            $$;
          `
        },
        { headers }
      );
      console.log('   ✅ Similarity search function created');
    } catch (error) {
      console.error('   ❌ Error creating search function:');
      console.error('   Status:', error.response?.status);
      console.error('   Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('   Message:', error.message);
      process.exit(1);
    }
    
    // Step 5: Set up RLS policies
    console.log('Setting up RLS policies...');
    try {
      const response = await axios.post(
        `${restUrl}sql`,
        { 
          query: `
            -- Enable RLS
            ALTER TABLE bill_embeddings ENABLE ROW LEVEL SECURITY;
            
            -- Allow public read access
            DROP POLICY IF EXISTS "Enable read access for all users on bill_embeddings" ON bill_embeddings;
            CREATE POLICY "Enable read access for all users on bill_embeddings"
              ON bill_embeddings FOR SELECT
              TO public
              USING (true);
            
            -- Allow service role full access
            DROP POLICY IF EXISTS "Enable full access for service role on bill_embeddings" ON bill_embeddings;
            CREATE POLICY "Enable full access for service role on bill_embeddings"
              ON bill_embeddings FOR ALL
              TO service_role
              USING (true)
              WITH CHECK (true);
            
            -- Grant permissions
            GRANT SELECT ON bill_embeddings TO anon;
            GRANT SELECT ON bill_embeddings TO authenticated;
            GRANT ALL ON bill_embeddings TO service_role;
          `
        },
        { headers }
      );
      console.log('   ✅ RLS policies configured');
    } catch (error) {
      console.error('   ❌ Error setting up RLS policies:');
      console.error('   Status:', error.response?.status);
      console.error('   Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('   Message:', error.message);
      process.exit(1);
    }
    
    // Step 6: Set up updated_at trigger
    console.log('Setting up updated_at trigger...');
    try {
      const response = await axios.post(
        `${restUrl}sql`,
        { 
          query: `
            -- Create trigger function if it doesn't exist
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = timezone('utc'::text, now());
                RETURN NEW;
            END;
            $$ language 'plpgsql';
            
            -- Create trigger on bill_embeddings
            DROP TRIGGER IF EXISTS update_bill_embeddings_updated_at ON bill_embeddings;
            CREATE TRIGGER update_bill_embeddings_updated_at
                BEFORE UPDATE ON bill_embeddings
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
          `
        },
        { headers }
      );
      console.log('   ✅ updated_at trigger configured');
    } catch (error) {
      console.error('   ❌ Error setting up updated_at trigger:');
      console.error('   Status:', error.response?.status);
      console.error('   Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('   Message:', error.message);
      process.exit(1);
    }
    
    console.log('\n✅ Vector table setup complete! Database is ready for embeddings.');
    
  } catch (error) {
    console.error('Unexpected error during setup:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('Error message:', error.message);
    process.exit(1);
  }
}

async function main() {
  const program = new Command();
  
  program
    .option('--production', 'Use production environment')
    .option('--staging', 'Use staging environment (default)')
    .parse(process.argv);
  
  const options = program.opts();
  
  // Determine environment
  const env = options.production ? 'production' : 'staging';
  
  // Load environment
  console.log(`Loading ${env} environment...`);
  await envLoader.load(env);
  
  // Run setup
  await setupVectorTable();
}

main().catch(error => {
  console.error('Error running script:', error.message);
  if (error.response) {
    console.error('Response status:', error.response.status);
    console.error('Response data:', JSON.stringify(error.response.data, null, 2));
  }
  process.exit(1); });
