// Load environment variables first
import './loadEnv.js';
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase.js";
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Environment Manager for environment handling
class EnvironmentManager {
  private static instance: EnvironmentManager;
  private envCache: Map<string, string> = new Map();
  private currentEnvironment: 'staging' | 'production' = 'staging';

  private constructor() {}

  static getInstance(): EnvironmentManager {
    if (!this.instance) {
      this.instance = new EnvironmentManager();
    }
    return this.instance;
  }

  getEnvFile(mode: string): string {
    switch (mode) {
      case 'production':
      case 'production.proxy':
        return '.env.production';
      case 'staging':
      case 'staging.proxy':
      default:
        return '.env.staging';
    }
  }

  async loadEnvironment(mode: string): Promise<void> {
    const envFile = this.getEnvFile(mode);
    console.log('📂 Loading environment from:', envFile);
    
    try {
      const envConfig = readFileSync(envFile, 'utf-8');
      const envVars = envConfig.split('\n')
        .filter(line => line && !line.startsWith('#'))
        .reduce((acc, line) => {
          const [key, value] = line.split('=');
          if (key && value) {
            acc[key.trim()] = value.trim();
          }
          return acc;
        }, {} as Record<string, string>);

      // Cache the environment variables
      Object.entries(envVars).forEach(([key, value]) => {
        this.envCache.set(key, value);
        process.env[key] = value;
      });

      console.log('✅ Environment loaded successfully');
    } catch (error) {
      console.error('❌ Error loading environment:', error);
      throw error;
    }
  }
}

// Load environment variables
const envManager = EnvironmentManager.getInstance();
const mode = process.env.VITE_MODE || 'staging';
await envManager.loadEnvironment(mode);

// Now create the Supabase client with the loaded environment
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Supabase URL or service role key not found in environment variables");
}

console.log(`\n🔧 Resetting database in ${mode.toUpperCase()} environment`);
console.log(`URL: ${supabaseUrl}`);

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Migration files in order of execution
const newDbMigrations = [
  '000_reset.sql',
  '001_create_bills_tables.sql',
  '004_create_storage_buckets.sql',
  '006_create_ai_tables.sql'
];

const updateDbMigrations = [
  '002_add_pdf_url.sql',
  '003_fix_service_role_policies.sql',
  '007_fix_public_access.sql',
  '008_fix_schema_permissions.sql',
  '009_add_failed_bills_table.sql',
  '011_cleanup_and_optimize.sql'
];

async function executeMigration(sql: string): Promise<void> {
  try {
    console.log('Executing migration...');
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error('Migration error:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error executing migration:', error);
    throw error;
  }
}

async function runMigrations(migrations: string[], folder: string) {
  for (const migration of migrations) {
    console.log(`Running migration: ${migration}`);
    const sql = readFileSync(
      join(__dirname, `../db/${folder}`, migration),
      'utf8'
    );
    await executeMigration(sql);
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const isNewDb = args.includes('--new');
    const isUpdate = args.includes('--update');
    
    if (!isNewDb && !isUpdate) {
      console.log("\n🔧 Database Migration Options:");
      console.log("1. Complete reset and new setup (--new)");
      console.log("2. Apply updates only (--update)");
      console.log("\nUsage examples:");
      console.log("npm run db:reset -- --new");
      console.log("npm run db:reset -- --update");
      process.exit(0);
    }

    if (isNewDb) {
      console.log("\n🔄 Starting complete database reset and setup...");
      await runMigrations(newDbMigrations, 'newdb');
      console.log("✅ New database setup completed successfully");
    }

    if (isUpdate) {
      console.log("\n🔄 Applying database updates...");
      await runMigrations(updateDbMigrations, 'updatedb');
      console.log("✅ Database updates completed successfully");
    }

  } catch (error) {
    console.error("\n❌ Error during database migration:", error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error("\n❌ Unhandled error:", error);
  process.exit(1);
}); 