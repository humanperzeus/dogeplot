import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import http from 'http';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Enhanced environment validation
const requiredEnvVars = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  VITE_CONGRESS_API_KEY: process.env.VITE_CONGRESS_API_KEY,
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT
};

console.log('\n=== Environment Validation ===');
let missingVars = [];
for (const [key, value] of Object.entries(requiredEnvVars)) {
  console.log(`${key}: ${value ? (key.includes('KEY') ? '[SET]' : value) : 'NOT SET'}`);
  if (!value) {
    missingVars.push(key);
  }
}

if (missingVars.length > 0) {
  console.error('\n❌ Missing required environment variables:');
  missingVars.forEach(v => console.error(`   - ${v}`));
  process.exit(1);
}

// Initialize Supabase client
console.log('\n=== Initializing Supabase Client ===');
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Enhanced logging function that also saves to database
async function log(message, type = 'info', syncId = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  
  // Format for console
  const colors = {
    info: '\x1b[36m',    // Cyan
    error: '\x1b[31m',   // Red
    warn: '\x1b[33m',    // Yellow
    success: '\x1b[32m', // Green
    reset: '\x1b[0m'     // Reset
  };

  const color = colors[type.toLowerCase()] || colors.reset;
  console.log(`${color}${logMessage}${colors.reset}`);

  try {
    await supabase.from('sync_logs').insert({
      sync_id: syncId,
      timestamp: timestamp,
      level: type.toLowerCase(),
      message: message,
      environment: process.env.NODE_ENV || 'staging'
    });
  } catch (error) {
    console.error(`${colors.error}Failed to write to sync_logs: ${error}${colors.reset}`);
  }
}

// Log environment info at startup
async function logEnvironmentInfo(syncId) {
  await log('=== Environment Information ===', 'info', syncId);
  await log(`Node Version: ${process.version}`, 'info', syncId);
  await log(`Environment: ${process.env.NODE_ENV}`, 'info', syncId);
  await log(`Port: ${process.env.PORT}`, 'info', syncId);
  await log(`Working Directory: ${process.cwd()}`, 'info', syncId);
  await log(`Debug Mode: ${process.env.DEBUG ? 'Enabled' : 'Disabled'}`, 'info', syncId);
  await log(`Supabase URL: ${process.env.VITE_SUPABASE_URL ? 'Set' : 'Not Set'}`, 'info', syncId);
  await log(`Service Role Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not Set'}`, 'info', syncId);
  await log(`Congress API Key: ${process.env.VITE_CONGRESS_API_KEY ? 'Set' : 'Not Set'}`, 'info', syncId);
  
  // Check file system
  await log('\n=== File System Check ===', 'info', syncId);
  try {
    const files = await fs.readdir(join(__dirname));
    await log(`Files in scripts directory: ${files.join(', ')}`, 'info', syncId);
  } catch (error) {
    await log(`Error reading directory: ${error.message}`, 'error', syncId);
  }
}

// Enhanced error handling
async function handleError(error, context, syncId) {
  await log(`Error in ${context}: ${error.message}`, 'error', syncId);
  await log(`Stack trace: ${error.stack}`, 'error', syncId);
  
  // Additional error context
  await log('Error context:', 'error', syncId);
  await log(`- Working directory: ${process.cwd()}`, 'error', syncId);
  await log(`- Node version: ${process.version}`, 'error', syncId);
  await log(`- Platform: ${process.platform}`, 'error', syncId);
  await log(`- Architecture: ${process.arch}`, 'error', syncId);
  
  return {
    success: false,
    error: error.message,
    context,
    timestamp: new Date().toISOString(),
    stack: error.stack
  };
}

// Enhanced command execution with detailed logging
async function runCommand(command, args, syncId) {
  const fullCommand = `${command} ${args.join(' ')}`;
  await log(`📋 Executing command: ${fullCommand}`, 'info', syncId);
  await log(`🔧 Environment:`, 'info', syncId);
  await log(`   • NODE_ENV: ${process.env.NODE_ENV}`, 'info', syncId);
  await log(`   • Working directory: ${process.cwd()}`, 'info', syncId);
  
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        FORCE_COLOR: true,
        NODE_ENV: process.env.NODE_ENV || 'staging'
      }
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        await log(`✅ Command completed successfully with code ${code}`, 'success', syncId);
        resolve();
      } else {
        const error = new Error(`Command failed with code ${code}`);
        await log(`❌ Command failed with code ${code}`, 'error', syncId);
        reject(error);
      }
    });

    proc.on('error', async (err) => {
      await log(`❌ Command error: ${err.message}`, 'error', syncId);
      await log(`   Stack trace: ${err.stack}`, 'error', syncId);
      reject(err);
    });
  });
}

async function sleep(ms, syncId) {
  await log(`⏳ Sleeping for ${ms}ms...`, 'info', syncId);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDailySync() {
  const syncId = `sync_${Date.now()}`;
  try {
    await log('🚀 Starting Daily Sync Process', 'info', syncId);
    await logEnvironmentInfo(syncId);
    
    // STEP 1: Sync new bills using npm script
    await log('📥 STEP 1: Syncing New Bills', 'info', syncId);
    await runCommand('npm', [
      'run',
      'sync:bills:parallel',
      '--',
      `--${process.env.NODE_ENV || 'staging'}`,
      '--limit=100',
      '--threads=5',
      '--congress=119',
      '--offset=0'
    ], syncId);

    await log('⏳ Waiting 1 minute before next step...', 'info', syncId);
    await sleep(60 * 1000, syncId);

    // STEP 2: Retry failed bills using npm script
    await log('🔄 STEP 2: Retrying Failed Bills', 'info', syncId);
    await runCommand('npm', [
      'run',
      'sync:bills:parallel',
      '--',
      `--${process.env.NODE_ENV || 'staging'}`,
      '--threads=5'
    ], syncId);

    await log('⏳ Waiting 1 minute before next step...', 'info', syncId);
    await sleep(60 * 1000, syncId);

    // STEP 3: Run OCR on bills with PDFs but no text
    await log('📝 STEP 3: Running OCR on Bills', 'info', syncId);
    await runCommand('npm', ['run', 'ocr:bills'], syncId);

    await log('✨ Daily Sync Process Complete', 'success', syncId);
    return { success: true, timestamp: new Date().toISOString(), syncId };
  } catch (error) {
    return handleError(error, 'runDailySync', syncId);
  }
}

// Create HTTP server to handle Cloud Run requests
const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const syncId = `sync_${startTime}`;
  await log(`Received ${req.method} request to ${req.url}`, 'info', syncId);

  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // Health check endpoint
    if (req.method === 'GET' && req.url === '/') {
      const healthCheck = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        memory_usage: process.memoryUsage(),
        cpu_usage: process.cpuUsage()
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(healthCheck));
      await log(`Health check completed in ${Date.now() - startTime}ms`, 'info', syncId);
      return;
    }

    // Sync trigger endpoint
    if (req.method === 'POST' && req.url === '/') {
      await log('Starting sync process from HTTP trigger', 'info', syncId);
      const result = await runDailySync();
      res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...result,
        duration: Date.now() - startTime
      }));
      await log(`Sync process completed in ${Date.now() - startTime}ms with status: ${result.success ? 'success' : 'failure'}`, 'info', syncId);
      return;
    }

    // Not found
    await log(`404 Not Found: ${req.method} ${req.url}`, 'warn', syncId);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: req.url }));
  } catch (error) {
    const errorResponse = await handleError(error, `HTTP ${req.method} ${req.url}`, syncId);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
  }
});

// Start the server with enhanced logging
const port = process.env.PORT || 8080;
server.listen(port, async () => {
  const syncId = `startup_${Date.now()}`;
  await logEnvironmentInfo(syncId);
  await log(`Server listening on port ${port}`, 'info', syncId);
  await log('Ready to handle sync requests', 'info', syncId);
}); 