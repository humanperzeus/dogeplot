import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { envLoader } from '../../scripts/loadEnv.js';
import { Command } from 'commander';
import chalk from 'chalk';

async function executeSQL(
  supabase: any,
  sql: string, 
  description: string
): Promise<boolean> {
  console.log(`➡️ ${description}...`);
  
  try {
    const { error } = await supabase.rpc('public_execute_sql', {
      sql_query: sql
    });
    
    if (error) {
      console.error(`❌ Error: ${error.message}`);
      return false;
    }
    
    console.log(`✅ Success`);
    return true;
  } catch (error) {
    console.error(`❌ Exception: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function setupVectorTables() {
  console.log('\n=== Setting Up Vector Tables ===');
  
  // Get Supabase credentials from environment
  const supabaseUrl = envLoader.getVariable('VITE_SUPABASE_URL');
  const supabaseServiceKey = envLoader.getVariable('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Missing Supabase credentials in environment');
    process.exit(1);
  }
  
  console.log(`🔌 Connecting to Supabase: ${supabaseUrl}`);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Read SQL file
  const sqlPath = path.join(process.cwd(), 'src', 'db', 'newdb', '008_create_vector_tables.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ SQL file not found: ${sqlPath}`);
    process.exit(1);
  }
  
  console.log(`📄 Loading SQL from: ${sqlPath}`);
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  
  // Split into statements
  const statements = sqlContent
    .split(';')
    .map(s => {
      // Remove comments and trim
      return s.replace(/--.*$/gm, '').trim();
    })
    .filter(s => s.length > 0);
  
  console.log(`📋 Found ${statements.length} SQL statements`);
  
  // Manual handling for key operations to provide better feedback
  let step = 1;
  let success = true;
  
  // Step 1: Enable vector extension
  console.log(`\n${chalk.blue(`Step ${step++}: Enabling vector extension`)}`);
  const extensionStatements = statements.filter(s => s.includes('CREATE EXTENSION'));
  if (extensionStatements.length > 0) {
    const extensionSuccess = await executeSQL(
      supabase, 
      extensionStatements[0], 
      'Enabling vector extension'
    );
    
    if (!extensionSuccess) {
      console.log(chalk.yellow('Note: The vector extension may need to be enabled via the Supabase dashboard'));
      console.log(chalk.yellow('Go to: https://supabase.com/dashboard/project/_/database/extensions'));
      console.log(chalk.yellow('Find "vector" in the list and click "Enable"'));
      console.log(chalk.yellow('Continuing with the rest of the setup...'));
    }
  }
  
  // Step 2: Create tables
  console.log(`\n${chalk.blue(`Step ${step++}: Creating bill_embeddings table`)}`);
  const tableStatements = statements.filter(s => 
    s.includes('CREATE TABLE') && s.includes('bill_embeddings')
  );
  
  if (tableStatements.length > 0) {
    success = await executeSQL(
      supabase, 
      tableStatements[0], 
      'Creating bill_embeddings table'
    ) && success;
  }
  
  // Step 3: Create indexes
  console.log(`\n${chalk.blue(`Step ${step++}: Creating indexes`)}`);
  const indexStatements = statements.filter(s => 
    s.includes('CREATE INDEX') && !s.includes('FUNCTION')
  );
  
  for (const statement of indexStatements) {
    const indexName = statement.match(/INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i)?.[1] || 'index';
    success = await executeSQL(
      supabase,
      statement,
      `Creating index ${indexName}`
    ) && success;
  }
  
  // Step 4: Create functions
  console.log(`\n${chalk.blue(`Step ${step++}: Creating search functions`)}`);
  const functionStatements = statements.filter(s => 
    s.includes('CREATE OR REPLACE FUNCTION') && 
    (s.includes('search_bills_by_embedding') || s.includes('find_similar_bills') || s.includes('get_embedding_stats'))
  );
  
  for (const statement of functionStatements) {
    const functionName = statement.match(/FUNCTION\s+(\w+)/i)?.[1] || 'function';
    success = await executeSQL(
      supabase,
      statement,
      `Creating function ${functionName}`
    ) && success;
  }
  
  // Step 5: Setup RLS
  console.log(`\n${chalk.blue(`Step ${step++}: Setting up permissions`)}`);
  const rlsStatements = statements.filter(s => 
    s.includes('ROW LEVEL SECURITY') || 
    s.includes('POLICY') || 
    s.includes('GRANT')
  );
  
  for (const statement of rlsStatements) {
    const isRls = statement.includes('ROW LEVEL SECURITY');
    const isPolicy = statement.includes('POLICY');
    const isGrant = statement.includes('GRANT');
    
    let description = 'Setting up permission';
    if (isRls) description = 'Enabling row level security';
    if (isPolicy) description = 'Creating policy ' + (statement.match(/POLICY\s+"([^"]+)"/)?.[1] || '');
    if (isGrant) description = 'Granting permissions';
    
    success = await executeSQL(supabase, statement, description) && success;
  }
  
  // Step 6: Setup triggers
  console.log(`\n${chalk.blue(`Step ${step++}: Setting up triggers`)}`);
  const triggerStatements = statements.filter(s => s.includes('TRIGGER'));
  
  for (const statement of triggerStatements) {
    const triggerName = statement.match(/TRIGGER\s+(\w+)/i)?.[1] || 'trigger';
    success = await executeSQL(
      supabase,
      statement,
      `Creating trigger ${triggerName}`
    ) && success;
  }
  
  // Final report
  if (success) {
    console.log(`\n${chalk.green('✅ Vector tables setup completed successfully!')}`);
  } else {
    console.log(`\n${chalk.yellow('⚠️ Vector tables setup completed with some warnings.')}`);
    console.log(`${chalk.yellow('Some operations may have failed. Check the logs above for details.')}`);
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
  await setupVectorTables();
}

main().catch(error => {
  console.error('Error running script:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}); 