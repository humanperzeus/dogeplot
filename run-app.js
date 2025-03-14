// Complete app launcher that runs both frontend and backend
// This script directly starts both the Vite dev server and Node.js server

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Function to clean up existing processes
function cleanProcesses() {
  console.log('🧹 Cleaning up existing processes...');
  
  try {
    if (process.platform === 'win32') {
      // Windows
      try { execSync('taskkill /F /IM node.exe /FI "WINDOWTITLE eq vite" /T', { stdio: 'ignore' }); } catch (e) {}
    } else {
      // MacOS/Linux
      try { execSync('pkill -f vite || true', { stdio: 'ignore' }); } catch (e) {}
      try { execSync('lsof -ti:5173 | xargs kill -9 || true', { stdio: 'ignore' }); } catch (e) {}
      try { execSync('lsof -ti:3001 | xargs kill -9 || true', { stdio: 'ignore' }); } catch (e) {}
    }
    
    console.log('✅ Processes cleaned up');
  } catch (error) {
    console.warn('⚠️ Could not clean up all processes, but continuing anyway');
  }
}

// Get environment mode from command line arguments
const mode = process.argv[2] === 'production' ? 'production' : 'staging';

// Set up common environment variables
const commonEnv = {
  ...process.env,
  DISABLE_HYBRID: 'true'
};

// Environment for frontend
const frontendEnv = {
  ...commonEnv,
  VITE_MODE: mode
};

// Environment for backend
const backendEnv = {
  ...commonEnv,
  NODE_ENV: 'development',
  VITE_MODE: mode
};

console.log(`
╔══════════════════════════════════════════╗
║  🐕 Direct App Launcher (LEGACY MODE)    ║
╚══════════════════════════════════════════╝

Environment:
- VITE_MODE: ${mode}
- NODE_ENV: development
- DISABLE_HYBRID: true

Starting both frontend and backend in LEGACY MODE...
Press Ctrl+C to exit
`);

// Clean up existing processes
cleanProcesses();

// Construct the backend paths
const serverDir = path.join(__dirname, 'src', 'server');
const serverFile = path.join(serverDir, 'index.ts');

// Check if the server file exists
if (!fs.existsSync(serverFile)) {
  console.error(`❌ Error: Server file not found at ${serverFile}`);
  process.exit(1);
}

// Start the frontend (Vite dev server)
console.log('🚀 Starting frontend (Vite)...');
const frontend = spawn('npx', ['vite', '--mode', mode], {
  env: frontendEnv,
  cwd: __dirname,
  stdio: 'inherit'
});

frontend.on('error', (err) => {
  console.error(`❌ Failed to start frontend: ${err.message}`);
});

// Start the backend server
console.log('🚀 Starting backend server...');
const backend = spawn('node', ['--loader', 'ts-node/esm', serverFile], {
  env: backendEnv,
  cwd: __dirname,
  stdio: 'inherit'
});

backend.on('error', (err) => {
  console.error(`❌ Failed to start backend: ${err.message}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n💤 Shutting down...');
  frontend.kill('SIGTERM');
  backend.kill('SIGTERM');
  setTimeout(() => {
    console.log('👋 Goodbye!');
    process.exit(0);
  }, 500);
});

// Handle process exits
let frontendExited = false;
let backendExited = false;

frontend.on('close', (code) => {
  frontendExited = true;
  console.log(`Frontend process exited with code ${code}`);
  if (backendExited) {
    process.exit(0);
  }
});

backend.on('close', (code) => {
  backendExited = true;
  console.log(`Backend process exited with code ${code}`);
  if (frontendExited) {
    process.exit(0);
  }
}); 