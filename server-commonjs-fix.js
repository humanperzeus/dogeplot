// Server CommonJS Compatibility Fix
// Run with: node server-commonjs-fix.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 SERVER COMMONJS FIX');
console.log('=====================\n');

// Create package.json in server directory if it doesn't exist
function setupServerPackageJson() {
  try {
    const serverDir = path.join(process.cwd(), 'src', 'server');
    const packageJsonPath = path.join(serverDir, 'package.json');
    
    // Create server dir if it doesn't exist
    if (!fs.existsSync(serverDir)) {
      fs.mkdirSync(serverDir, { recursive: true });
      console.log('✅ Created server directory');
    }
    
    // Check if package.json exists, and if not, create it
    let packageJson = {};
    if (fs.existsSync(packageJsonPath)) {
      try {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        console.log('✅ Found existing server package.json');
      } catch (error) {
        console.log('⚠️ Server package.json exists but is invalid, will create a new one');
      }
    } else {
      console.log('⚠️ No server package.json found, creating one');
    }
    
    // Make sure it's set to CommonJS mode
    if (packageJson.type === 'module') {
      delete packageJson.type;
      console.log('✅ Removed "type": "module" from server package.json');
    }
    
    // Add necessary fields if they don't exist
    packageJson.name = packageJson.name || 'server';
    packageJson.version = packageJson.version || '1.0.0';
    packageJson.description = packageJson.description || 'Server component';
    packageJson.main = packageJson.main || 'index.ts';
    
    // Add or update scripts
    packageJson.scripts = packageJson.scripts || {};
    packageJson.scripts.dev = 'ts-node index.ts';
    packageJson.scripts['dev:watch'] = 'nodemon --exec ts-node index.ts';
    
    // Make sure dependencies are set
    packageJson.dependencies = packageJson.dependencies || {};
    packageJson.devDependencies = packageJson.devDependencies || {};
    
    // Write the file
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log('✅ Updated server package.json to CommonJS mode');
    
    return true;
  } catch (error) {
    console.log('❌ Failed to set up server package.json:', error.message);
    return false;
  }
}

// Add Run Server scripts to main package.json
function updateMainPackageJson() {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Create a backup
    fs.writeFileSync(`${packageJsonPath}.server.bak`, JSON.stringify(packageJson, null, 2));
    console.log('✅ Created package.json backup at package.json.server.bak');
    
    // Add new scripts
    if (packageJson.scripts) {
      packageJson.scripts['server:commonjs'] = 'cd src/server && ts-node index.ts';
      packageJson.scripts['server:commonjs:prod'] = 'cd src/server && cross-env VITE_MODE=production ts-node index.ts';
      packageJson.scripts['server:watch'] = 'cd src/server && nodemon --exec ts-node index.ts';
      
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log('✅ Updated main package.json with new server scripts');
      return true;
    }
    
    return false;
  } catch (error) {
    console.log('❌ Failed to update main package.json:', error.message);
    return false;
  }
}

// Make sure server dependencies are installed
function installServerDependencies() {
  try {
    console.log('Installing server dependencies...');
    console.log('cd src/server && npm install');
    
    try {
      execSync('cd src/server && npm install', { stdio: 'inherit' });
      console.log('✅ Installed server dependencies');
    } catch (error) {
      console.log('⚠️ Could not install server dependencies, attempting to create package.json first');
      setupServerPackageJson();
      try {
        execSync('cd src/server && npm install', { stdio: 'inherit' });
        console.log('✅ Installed server dependencies after creating package.json');
      } catch (innerError) {
        throw new Error('Failed to install server dependencies: ' + innerError.message);
      }
    }
    
    // Make sure ts-node and nodemon are installed in the server directory
    execSync('cd src/server && npm install --save-dev ts-node nodemon', { stdio: 'inherit' });
    console.log('✅ Installed ts-node and nodemon for the server');
    
    return true;
  } catch (error) {
    console.log('❌ Failed to install server dependencies:', error.message);
    return false;
  }
}

// Create a run-server-commonjs.js script
function createRunServerScript() {
  try {
    const scriptContent = `// CommonJS Server Runner
// This script runs the server using ts-node in CommonJS mode
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting server in CommonJS mode');
const serverDir = path.join(__dirname, 'src', 'server');

// Default to development mode unless specified
const mode = process.argv[2] || 'development';
console.log(\`Mode: \${mode}\`);

const env = {
  ...process.env,
  NODE_ENV: mode === 'production' ? 'production' : 'development',
  VITE_MODE: mode === 'production' ? 'production' : 'staging',
};

// Run the server
const serverProcess = spawn('npx', ['ts-node', 'index.ts'], {
  cwd: serverDir,
  env,
  stdio: 'inherit'
});

serverProcess.on('error', (error) => {
  console.error('Failed to start server:', error);
});

serverProcess.on('close', (code) => {
  if (code !== 0) {
    console.log(\`Server process exited with code \${code}\`);
  }
});

console.log('Server process started. Press Ctrl+C to stop.');
`;

    fs.writeFileSync('run-server-commonjs.js', scriptContent);
    console.log('✅ Created run-server-commonjs.js script');
    
    // Add to package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    if (packageJson.scripts) {
      packageJson.scripts['direct:server:commonjs'] = 'node run-server-commonjs.js';
      packageJson.scripts['direct:server:commonjs:prod'] = 'node run-server-commonjs.js production';
      
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log('✅ Added direct server scripts to package.json');
    }
    
    return true;
  } catch (error) {
    console.log('❌ Failed to create run server script:', error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('Setting up server for CommonJS compatibility...\n');
  
  // Setup server package.json
  const serverPackageSetup = setupServerPackageJson();
  
  // Update main package.json
  const mainPackageUpdated = updateMainPackageJson();
  
  // Install server dependencies
  const dependenciesInstalled = installServerDependencies();
  
  // Create run server script
  const scriptCreated = createRunServerScript();
  
  if (serverPackageSetup && mainPackageUpdated && dependenciesInstalled && scriptCreated) {
    console.log('\n✅ Server CommonJS fix applied successfully!');
    console.log('\nYou can now start the server with:');
    console.log('npm run server:commonjs');
    console.log('\nOr for production mode:');
    console.log('npm run server:commonjs:prod');
    console.log('\nOr directly with:');
    console.log('npm run direct:server:commonjs');
  } else {
    console.log('\n⚠️ Some fixes were not applied successfully. Check the logs above.');
  }
}

// Run the main function
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
}); 