// Basic diagnostic script to identify what's failing

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('📊 DIAGNOSTIC TOOL - LEGACY MODE TROUBLESHOOTER');
console.log('==============================================\n');

// Helper to check if a command is available
function commandExists(command) {
  try {
    execSync(command + ' --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// Helper to run a command and get output
function runCommand(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

// Check Node.js version
console.log('1. Node.js Environment:');
console.log('   Node Version: ' + process.version);
console.log('   Platform: ' + process.platform);
console.log('   Architecture: ' + process.arch);
console.log('   Working Directory: ' + process.cwd());

// Check npm availability
console.log('\n2. Package Manager:');
console.log('   npm: ' + (commandExists('npm') ? 'Available' : 'Not available'));
console.log('   npm Version: ' + (commandExists('npm') ? runCommand('npm --version') : 'N/A'));

// Check vite availability
console.log('\n3. Vite:');
console.log('   npx: ' + (commandExists('npx') ? 'Available' : 'Not available'));
console.log('   vite: ' + (commandExists('npx vite') ? 'Available' : 'Not available'));

// Check TypeScript
console.log('\n4. TypeScript:');
console.log('   tsc: ' + (commandExists('npx tsc') ? 'Available' : 'Not available'));
console.log('   ts-node: ' + (commandExists('npx ts-node') ? 'Available' : 'Not available'));

// Check file structure
console.log('\n5. Critical Files:');
const criticalFiles = [
  { path: 'package.json', desc: 'Main package.json' },
  { path: 'src/server/index.ts', desc: 'Server entry point' },
  { path: 'src/server/package.json', desc: 'Server package.json' },
  { path: 'src/server/tsconfig.json', desc: 'Server TypeScript config' },
  { path: '.env.staging', desc: 'Staging environment variables' },
  { path: '.env.production', desc: 'Production environment variables' }
];

criticalFiles.forEach(file => {
  const exists = fs.existsSync(path.resolve(process.cwd(), file.path));
  console.log(`   ${file.desc}: ${exists ? '✅ Found' : '❌ Missing'}`);
});

// Check for ts-node executable
console.log('\n6. ts-node Executable:');
try {
  const tsNodePath = runCommand('npm root -g') + '/ts-node/dist/bin.js';
  const localTsNodePath = path.resolve(process.cwd(), 'node_modules/ts-node/dist/bin.js');
  console.log(`   Global ts-node: ${fs.existsSync(tsNodePath) ? '✅ Found' : '❌ Missing'}`);
  console.log(`   Local ts-node: ${fs.existsSync(localTsNodePath) ? '✅ Found' : '❌ Missing'}`);
} catch (e) {
  console.log('   Error checking for ts-node: ' + e.message);
}

// Attempt a basic server startup
console.log('\n7. Basic Server Test:');
try {
  console.log('   Attempting to start the server for 2 seconds...');
  const serverProcess = require('child_process').spawn(
    'node', 
    ['--loader', 'ts-node/esm', 'src/server/index.ts'],
    {
      env: { ...process.env, DISABLE_HYBRID: 'true', VITE_MODE: 'staging' },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  
  let serverOutput = '';
  let errorOutput = '';
  
  serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });
  
  serverProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });
  
  // Kill the server after 2 seconds
  setTimeout(() => {
    serverProcess.kill();
    
    console.log('   Server output summary:');
    if (serverOutput) {
      console.log('   ✅ Server started successfully (partial output):');
      console.log('   ' + serverOutput.split('\n').slice(0, 5).join('\n   '));
    } else if (errorOutput) {
      console.log('   ❌ Server failed to start. Error:');
      console.log('   ' + errorOutput.split('\n').slice(0, 10).join('\n   '));
    } else {
      console.log('   ⚠️ No output received from server');
    }
    
    console.log('\n8. DIAGNOSIS:');
    if (errorOutput && errorOutput.includes('Cannot use import statement outside a module')) {
      console.log('   ❌ ERROR: Your Node.js ESM configuration is incorrect.');
      console.log('   🔧 SOLUTION: Try running with: NODE_OPTIONS="--experimental-specifier-resolution=node" node --loader ts-node/esm src/server/index.ts');
    } else if (errorOutput && errorOutput.includes('ERR_MODULE_NOT_FOUND')) {
      console.log('   ❌ ERROR: Missing dependencies. Try running "npm install" first.');
      console.log('   🔧 SOLUTION: Run: cd src/server && npm install && cd ../..');
    } else if (errorOutput && errorOutput.includes('SyntaxError')) {
      console.log('   ❌ ERROR: TypeScript syntax error in server code.');
      console.log('   🔧 SOLUTION: Check src/server/index.ts for syntax errors. You might need to update ts-node or your TypeScript version.');
    }
    
    console.log('\n9. SUGGESTED COMMANDS:');
    console.log('   • npm install');
    console.log('   • cd src/server && npm install && cd ../..');
    console.log('   • npm install -g ts-node');
    console.log('   • npm install cross-env');
    console.log('   • NODE_OPTIONS="--experimental-specifier-resolution=node" DISABLE_HYBRID=true VITE_MODE=staging node --loader ts-node/esm src/server/index.ts');
    
    console.log('\nDiagnostic complete! Please share this output to get more help.');
  }, 3000);
} catch (e) {
  console.log('   ❌ Error attempting to start server: ' + e.message);
} 