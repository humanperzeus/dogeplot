// ESM-compatible diagnostic script
// Run with: node diagnose-esm.js

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 DIAGNOSTICS TOOL (ESM VERSION)');
console.log('================================\n');

// Check Node.js environment
console.log('🖥️ ENVIRONMENT CHECK');
console.log('-------------------');
console.log('Node.js Version:', process.version);
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);

// Check if we're in a git repository
let isGitRepo = false;
try {
  execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  isGitRepo = true;
  console.log('Git Repository: ✅');
} catch (error) {
  console.log('Git Repository: ❌');
}

// Check if critical directories and files exist
console.log('\n📁 FILE STRUCTURE CHECK');
console.log('---------------------');

const criticalPaths = [
  'package.json',
  'src/server',
  'src/server/package.json',
  'src/server/index.ts',
  '.env.staging',
  '.env.production'
];

criticalPaths.forEach(filePath => {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    console.log(`${filePath}: ✅`);
  } catch (error) {
    console.log(`${filePath}: ❌ (not found)`);
  }
});

// Check package.json settings
console.log('\n📦 PACKAGE.JSON CHECK');
console.log('-------------------');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log('Package Name:', packageJson.name);
  console.log('Module Type:', packageJson.type || 'commonjs');
  
  if (packageJson.type === 'module') {
    console.log('⚠️ NOTE: This project is configured as an ES module. This may cause issues with CommonJS scripts.');
    console.log('If you encounter "require is not defined" errors, you need to use ESM style imports.');
  }
  
  // Check dependencies
  const criticalDeps = ['typescript', 'ts-node', 'express', 'supabase'];
  criticalDeps.forEach(dep => {
    const found = Object.keys(packageJson.dependencies || {})
      .concat(Object.keys(packageJson.devDependencies || {}))
      .some(d => d === dep || d.includes(dep));
    
    console.log(`${dep}: ${found ? '✅' : '❌ (missing)'}`);
  });
} catch (error) {
  console.log('Failed to parse package.json:', error.message);
}

// Check Node.js versions and npm
console.log('\n🔄 NODEJS VERSION CHECK');
console.log('---------------------');
try {
  console.log('node --version:', execSync('node --version').toString().trim());
  console.log('npm --version:', execSync('npm --version').toString().trim());
  console.log('Node.js and npm: ✅');
} catch (error) {
  console.log('Failed to check Node.js/npm versions:', error.message);
}

// Test server start with minimal settings
console.log('\n🚀 SERVER START TEST');
console.log('------------------');
console.log('Attempting to start server with minimal settings...');

// Log the command we're about to run
const command = 'ts-node';
const args = ['--transpileOnly', '--compilerOptions', '{"module":"ESNext"}', 'src/server/index.ts'];
console.log(`Running: ${command} ${args.join(' ')}`);

// Set timeout to kill server after 5 seconds
console.log('This will timeout after 5 seconds');
setTimeout(() => {
  console.log('Server start test timeout - killing process');
  process.exit(0);
}, 5000);

// Try starting the server
try {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    VITE_MODE: 'staging',
    DISABLE_HYBRID: 'true',
    DEBUG: 'express:*'
  };
  
  const serverProcess = spawn(command, args, {
    env,
    stdio: 'pipe'
  });
  
  // Collect output
  let output = '';
  serverProcess.stdout.on('data', (data) => {
    output += data.toString();
    console.log(`[Server] ${data.toString().trim()}`);
  });
  
  serverProcess.stderr.on('data', (data) => {
    output += data.toString();
    console.log(`[Server Error] ${data.toString().trim()}`);
  });
  
  serverProcess.on('error', (error) => {
    console.log('Server process error:', error.message);
  });
  
  serverProcess.on('close', (code) => {
    if (code === 0) {
      console.log('\nServer started successfully (but was terminated by timeout)');
    } else {
      console.log(`\nServer process exited with code ${code}`);
      
      // Analyze output for common errors
      if (output.includes('Error: Cannot find module')) {
        console.log('🔴 DIAGNOSIS: Missing dependencies. Try running:');
        console.log('  npm install');
        console.log('  cd src/server && npm install');
      } else if (output.includes('TSError')) {
        console.log('🔴 DIAGNOSIS: TypeScript compilation error. Check your code for errors.');
      } else if (output.includes('Cannot use import statement outside a module')) {
        console.log('🔴 DIAGNOSIS: ESM/CommonJS module conflict. Try changing package.json "type" field.');
      }
    }
  });
} catch (error) {
  console.log('Failed to start server test:', error.message);
}

console.log('\n✅ BASIC DIAGNOSTICS COMPLETE');
console.log('If server test fails, try fixing node module or TypeScript issues.');
console.log('To fix ESM/CommonJS issues, run: node fix-esm-issues.js'); 