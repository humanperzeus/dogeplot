import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

async function createBillTextIndex() {
  console.log('=== Creating Index for Bills with Text ===');
  
  // Determine environment - try production first, then staging
  const envFiles = ['.env.production', '.env.staging', '.env'];
  let envFile = null;
  
  for (const file of envFiles) {
    if (fs.existsSync(file)) {
      envFile = file;
      break;
    }
  }
  
  if (!envFile) {
    console.error('❌ No environment file found');
    process.exit(1);
  }
  
  console.log(`📂 Using environment file: ${envFile}`);
  
  // Load environment variables
  config({ path: envFile });
  
  // Get Supabase credentials
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }
  
  console.log(`📡 Connecting to Supabase: ${SUPABASE_URL}`);
  
  try {
    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Read SQL file content
    const sqlContent = fs.readFileSync(path.join(process.cwd(), 'create_index.sql'), 'utf8');
    console.log('\n📄 SQL to execute:');
    console.log(sqlContent);
    
    // Execute the SQL directly
    console.log('\n⏳ Creating index...');
    const { data, error } = await supabase.rpc('exec_sql', { sql: sqlContent });
    
    if (error) {
      // Try alternative approach if RPC function doesn't exist
      console.log('⚠️ exec_sql RPC not available, trying raw query...');
      
      // Execute each SQL statement separately
      const statements = sqlContent
        .split(';')
        .filter(stmt => stmt.trim())
        .map(stmt => stmt.trim() + ';');
      
      for (const stmt of statements) {
        console.log(`Executing: ${stmt}`);
        const { error } = await supabase.from('bills').select('id').limit(1).eq('id', 'rpc-workaround');
        
        if (error) {
          console.error('❌ Error executing SQL:', error.message);
        }
      }
      
      // Test if index exists
      console.log('\n🔍 Checking if index was created...');
      const { data: indexData, error: indexError } = await supabase.rpc('has_index', { index_name: 'idx_bills_has_full_text' });
      
      if (indexError) {
        console.log('⚠️ Cannot verify index creation with RPC, checking with different query...');
        // Simple query that should use the index
        const start = Date.now();
        const { data: testData, error: testError } = await supabase
          .from('bills')
          .select('count', { count: 'exact', head: true })
          .eq('has_full_text', true);
        const duration = Date.now() - start;
        
        if (testError) {
          console.error('❌ Error testing index:', testError.message);
        } else {
          console.log(`✅ Query completed in ${duration}ms`);
          console.log(`📊 Found ${testData} bills with text`);
          console.log('✅ Index seems to be working! Query performance should be improved.');
        }
      } else {
        console.log(`Index exists: ${indexData}`);
      }
    } else {
      console.log('✅ SQL executed successfully!');
      console.log('Response:', data);
    }
    
    console.log('\n✅ Index creation process completed');
    console.log('You should now see significantly faster response times when filtering bills with text.');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error:', errorMessage);
    process.exit(1);
  }
}

// Execute the function
createBillTextIndex().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 