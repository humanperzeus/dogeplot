import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the appropriate .env file
const envPath = join(__dirname, '../../.env.staging');
console.log(`Loading environment from: ${envPath}`);
config({ path: envPath });

// Check if we have the required environment variables
if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables. Please check your .env.staging file.');
  process.exit(1);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function cleanupAndRecreateFailedBills() {
  try {
    console.log('Creating exec_sql function...');

    // First create the exec_sql function
    const { error: funcError } = await supabase.from('_sql').select('*').eq('name', 'exec_sql').maybeSingle().then(
      async ({ data, error }) => {
        if (!data) {
          return await supabase.from('_sql').insert([{
            name: 'exec_sql',
            definition: `
              CREATE OR REPLACE FUNCTION exec_sql(sql text)
              RETURNS void
              LANGUAGE plpgsql
              SECURITY DEFINER
              AS $$
              BEGIN
                EXECUTE sql;
              END;
              $$;
            `
          }]);
        }
        return { error: null };
      }
    );

    if (funcError) {
      console.error('Error creating exec_sql function:', funcError);
      return;
    }

    console.log('Cleaning up failed_bills table...');

    // Drop the existing table and all its dependencies
    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql: `
        -- Drop policies if they exist
        DROP POLICY IF EXISTS "Allow public read access to failed_bills" ON failed_bills;
        DROP POLICY IF EXISTS "Allow service role to insert failed_bills" ON failed_bills;
        DROP POLICY IF EXISTS "Allow service role to update failed_bills" ON failed_bills;
        DROP POLICY IF EXISTS "Allow service role to delete failed_bills" ON failed_bills;

        -- Drop trigger if it exists
        DROP TRIGGER IF EXISTS update_failed_bills_updated_at ON failed_bills;

        -- Drop indexes if they exist
        DROP INDEX IF EXISTS failed_bills_retry_count_idx;
        DROP INDEX IF EXISTS failed_bills_last_retry_idx;
        DROP INDEX IF EXISTS failed_bills_status_idx;

        -- Drop the table if it exists
        DROP TABLE IF EXISTS failed_bills CASCADE;
      `
    });

    if (dropError) {
      console.error('Error dropping table:', dropError);
      return;
    }

    console.log('Creating new failed_bills table...');

    // Create the new table with all its dependencies
    const { error: createError } = await supabase.rpc('exec_sql', {
      sql: `
        -- Create failed_bills table
        CREATE TABLE IF NOT EXISTS failed_bills (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            congress VARCHAR NOT NULL,
            bill_type VARCHAR NOT NULL,
            bill_number VARCHAR NOT NULL,
            title TEXT,
            error_message TEXT NOT NULL,
            retry_count INTEGER DEFAULT 0,
            last_retry TIMESTAMP WITH TIME ZONE,
            status VARCHAR NOT NULL DEFAULT 'failed',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
            UNIQUE(congress, bill_type, bill_number)
        );

        -- Create indexes for better query performance
        CREATE INDEX IF NOT EXISTS failed_bills_retry_count_idx ON failed_bills(retry_count);
        CREATE INDEX IF NOT EXISTS failed_bills_last_retry_idx ON failed_bills(last_retry);
        CREATE INDEX IF NOT EXISTS failed_bills_status_idx ON failed_bills(status);

        -- Add RLS (Row Level Security) policies
        ALTER TABLE failed_bills ENABLE ROW LEVEL SECURITY;

        -- Create policies for public read access
        CREATE POLICY "Allow public read access to failed_bills"
            ON failed_bills FOR SELECT
            USING (true);

        -- Create policies for service role write access
        CREATE POLICY "Allow service role to insert failed_bills"
            ON failed_bills FOR INSERT
            TO service_role
            WITH CHECK (true);

        CREATE POLICY "Allow service role to update failed_bills"
            ON failed_bills FOR UPDATE
            TO service_role
            USING (true)
            WITH CHECK (true);

        CREATE POLICY "Allow service role to delete failed_bills"
            ON failed_bills FOR DELETE
            TO service_role
            USING (true);

        -- Add trigger for updated_at
        CREATE TRIGGER update_failed_bills_updated_at
            BEFORE UPDATE ON failed_bills
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
      `
    });

    if (createError) {
      console.error('Error creating table:', createError);
      return;
    }

    console.log('Successfully recreated failed_bills table!');

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the cleanup and recreation process
cleanupAndRecreateFailedBills().catch(console.error); 