import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Get current file directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const loadEnv = () => {
  const envFile = process.argv.includes('--production') 
    ? '.env.production'
    : '.env.staging';
  
  console.log(`Loading environment from ${envFile}`);
  dotenv.config({ path: envFile });
  
  return {
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    environment: process.argv.includes('--production') ? 'production' : 'staging'
  };
};

const { supabaseUrl, supabaseKey, environment } = loadEnv();

// Define the environment file name for error messages
const envFile = process.argv.includes('--production') 
  ? '.env.production'
  : '.env.staging';

if (!supabaseUrl || !supabaseKey) {
  console.error(`Missing Supabase credentials. Please check your ${envFile} file.`);
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

const runMigration = async () => {
  try {
    console.log(`\n=== Running Cache Table Migration (${environment}) ===\n`);
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, '../db/newdb/012_add_cached_statistics_table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('Error running migration:', error);
      process.exit(1);
    }
    
    console.log('✅ Migration completed successfully');
    
    // Initialize the cache with current statistics
    console.log('\n=== Initializing Cache with Current Statistics ===\n');
    
    // Get count for 118th Congress
    const { count: congress118Count, error: error118 } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('congress', '118');
    
    if (error118) {
      console.error('Error fetching 118th Congress count:', error118);
      process.exit(1);
    }
    
    // Get count for 119th Congress
    const { count: congress119Count, error: error119 } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('congress', '119');
    
    if (error119) {
      console.error('Error fetching 119th Congress count:', error119);
      process.exit(1);
    }
    
    // Get the latest bill to determine cutoff date
    const { data: latestBills, error: latestError } = await supabase
      .from('bills')
      .select('introduction_date, latest_action_date')
      .order('latest_action_date', { ascending: false })
      .limit(1);
    
    if (latestError) {
      console.error('Error fetching latest bill date:', latestError);
      process.exit(1);
    }
    
    // Determine the latest date
    const latestBill = latestBills?.[0];
    const latestCutoffDate = latestBill 
      ? (latestBill.latest_action_date || latestBill.introduction_date)
      : new Date().toISOString();
    
    // Check if bills are vectorized
    const { count: vectorizedCount, error: vectorizedError } = await supabase
      .from('bill_embeddings')
      .select('*', { count: 'exact', head: true });
    
    if (vectorizedError) {
      console.error('Error checking vectorization status:', vectorizedError);
      process.exit(1);
    }
    
    // Prepare the stats object
    const stats = {
      congress118Count: congress118Count || 0,
      congress119Count: congress119Count || 0,
      latestCutoffDate,
      isVectorized: vectorizedCount > 0
    };
    
    // Calculate expiration time (1 hour from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);
    
    // Store in cache
    const { error: upsertError } = await supabase
      .from('cached_statistics')
      .upsert({
        id: 'global_bill_stats',
        data: stats,
        expires_at: expiresAt.toISOString()
      });
    
    if (upsertError) {
      console.error('Error initializing cache:', upsertError);
      process.exit(1);
    }
    
    console.log('✅ Cache initialized successfully with current statistics:');
    console.log(JSON.stringify(stats, null, 2));
    console.log(`\nCache will expire at: ${expiresAt.toLocaleString()}`);
    
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
};

runMigration(); 