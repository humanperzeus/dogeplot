import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Missing Supabase credentials. Please check your .env file');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function setupVectorTables() {
  try {
    console.log('=== Setting Up Vector Tables ===');

    // Read the SQL file
    const sqlPath = path.join(process.cwd(), 'src', 'db', 'newdb', '008_create_vector_tables.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Split the SQL into individual statements
    const statements = sqlContent
      .replace(/--.*$/gm, '') // Remove comments
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        // Execute the SQL statement using Supabase
        const { error } = await supabase.rpc('public_execute_sql', {
          sql_query: statement
        });

        if (error) {
          console.error(`Error executing statement ${i + 1}:`, error.message);
          
          // For certain errors (like extension not enabled), try fallback approach
          if (statement.includes('CREATE EXTENSION')) {
            console.warn('Note: The vector extension might need to be enabled via the Supabase dashboard');
            console.warn('Go to: https://supabase.com/dashboard/project/_/database/extensions');
            console.warn('Find "vector" in the list and click "Enable"');
          }
          
          // Continue with the next statement
          continue;
        }
        
        console.log(`Statement ${i + 1} executed successfully`);
      } catch (err) {
        console.error(`Error executing statement ${i + 1}:`, err.message);
      }
    }

    console.log('=== Vector Tables Setup Complete ===');
  } catch (error) {
    console.error('Error setting up vector tables:', error.message);
    process.exit(1);
  }
}

// Run the setup
setupVectorTables().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
}); 