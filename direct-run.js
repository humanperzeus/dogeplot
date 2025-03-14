// Last resort script to run the server
// This tries multiple Node.js options to get around ESM/CommonJS issues

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Helper to run a command with better output
function runCommand(command, args, env) {
  console.log(`\n🚀 Running: ${command} ${args.join(' ')}`);
  console.log('Environment variables:');
  Object.keys(env).forEach(key => {
    if (key.startsWith('VITE_') || key === 'DISABLE_HYBRID' || key === 'NODE_ENV') {
      console.log(`  ${key}=${env[key]}`);
    }
  });
  
  const child = spawn(command, args, {
    env,
    stdio: 'inherit'
  });
  
  child.on('error', err => {
    console.error(`\n❌ Failed to start process: ${err.message}`);
  });
  
  return new Promise((resolve) => {
    child.on('close', code => {
      console.log(`\nProcess exited with code ${code}`);
      resolve(code);
    });
  });
}

// ======== CONFIGURATION ========
// Set these to match your environment
const SERVER_FILE = 'src/server/index.ts';  // Path to server entry file
const env = {
  ...process.env,
  NODE_ENV: 'development',
  VITE_MODE: 'staging',     // 'staging' or 'production'
  DISABLE_HYBRID: 'true'    // 'true' or undefined
};
// ==============================

async function main() {
  console.log('🔥 DIRECT SERVER RUNNER - LAST RESORT 🔥');
  console.log('=======================================');
  console.log('This script will try multiple ways to start the server');
  console.log('Press Ctrl+C at any time to stop');
  
  // Kill any existing processes
  try {
    if (process.platform === 'win32') {
      // Windows
      try { execSync('taskkill /F /IM node.exe /FI "WINDOWTITLE eq node" /T', { stdio: 'ignore' }); } catch (e) {}
    } else {
      // MacOS/Linux
      try { execSync('pkill -f "node.*server" || true', { stdio: 'ignore' }); } catch (e) {}
      try { execSync('lsof -ti:3001 | xargs kill -9 || true', { stdio: 'ignore' }); } catch (e) {}
    }
  } catch (e) {
    // Ignore errors
  }
  
  // Attempt 1: Basic ts-node with experimental flags
  console.log('\n\n🧪 ATTEMPT 1: ts-node with experimental flags');
  
  env.NODE_OPTIONS = '--experimental-specifier-resolution=node --experimental-modules';
  
  await runCommand('node', [
    '--loader', 'ts-node/esm', 
    SERVER_FILE
  ], env);
  
  // Attempt 2: Direct TypeScript execution with ts-node-esm
  console.log('\n\n🧪 ATTEMPT 2: Using ts-node-esm');
  
  delete env.NODE_OPTIONS;
  
  await runCommand('npx', [
    'ts-node-esm',
    SERVER_FILE
  ], env);
  
  // Attempt 3: Compile TypeScript first, then run
  console.log('\n\n🧪 ATTEMPT 3: Compile TypeScript first, then run');
  
  try {
    console.log('Compiling TypeScript...');
    execSync('npx tsc', { stdio: 'inherit' });
    
    console.log('Running compiled JavaScript...');
    const outDir = 'dist'; // Adjust based on your tsconfig
    const compiledFile = path.join(outDir, SERVER_FILE.replace('.ts', '.js'));
    
    await runCommand('node', [
      compiledFile
    ], env);
  } catch (e) {
    console.error('Compilation failed:', e.message);
  }
  
  console.log('\n\n💥 All attempts completed. If none worked, check the diagnostic output.');
  console.log('Run "npm run diagnose" for detailed troubleshooting.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
}); 