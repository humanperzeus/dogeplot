// Simple server start script
// This uses the ESM-compatible tsx runner and sets dummy environment variables
// Run with: node start-server.js

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 STARTING SERVER (DUMMY MODE)');
console.log('============================\n');

// Default mode
const mode = process.argv[2] || 'staging';
console.log(`Mode: ${mode}`);

// Check for .env file
const envFilePath = `./.env.${mode}`;
let envVars = {};

if (fs.existsSync(envFilePath)) {
  console.log(`✅ Found env file: ${envFilePath}`);
  const envContent = fs.readFileSync(envFilePath, 'utf8');
  
  // Parse the env file (simple version)
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
      envVars[key] = value;
    }
  });
} else {
  console.log(`⚠️ Env file not found: ${envFilePath}, using defaults`);
}

// Set fallback/dummy environment variables for testing
const env = {
  ...process.env,
  NODE_ENV: 'development',
  VITE_MODE: mode,
  
  // Add any missing required variables with dummy values
  OPENAI_API_KEY: envVars.OPENAI_API_KEY || 'dummy-openai-key',
  OPENROUTER_API_KEY: envVars.OPENROUTER_API_KEY || 'dummy-openrouter-key',
  SUPABASE_URL: envVars.SUPABASE_URL || 'https://example.supabase.co',
  SUPABASE_ANON_KEY: envVars.SUPABASE_ANON_KEY || 'dummy-anon-key',
  SUPABASE_KEY: envVars.SUPABASE_KEY || 'dummy-supabase-key',
  VITE_SUPABASE_URL: envVars.VITE_SUPABASE_URL || 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: envVars.VITE_SUPABASE_ANON_KEY || 'dummy-anon-key',
  VITE_CONGRESS_API_KEY: envVars.VITE_CONGRESS_API_KEY || 'dummy-congress-key',
  VITE_GOVINFO_API_KEY: envVars.VITE_GOVINFO_API_KEY || 'dummy-govinfo-key',
};

console.log('Starting server with tsx (ESM-compatible TypeScript runner)');
console.log('Using dummy environment variables for missing values');

// Run with tsx (ESM-compatible TypeScript runner)
const serverProcess = spawn('npx', ['tsx', 'src/server/index.ts'], {
  env,
  stdio: 'inherit'
});

serverProcess.on('error', (error) => {
  console.error('Failed to start server:', error);
});

serverProcess.on('close', (code) => {
  if (code !== 0) {
    console.log(`Server process exited with code ${code}`);
  }
});

console.log('Server process started. Press Ctrl+C to stop.'); 