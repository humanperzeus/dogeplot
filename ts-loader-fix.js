// TypeScript Loader Fix for ESM Mode
// Run with: node ts-loader-fix.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 TYPESCRIPT ESM LOADER FIX');
console.log('============================\n');

// Create a custom loader file for TypeScript
function createTsLoader() {
  try {
    const loaderContent = `
// Custom ts-node loader for ESM
import { resolve as resolveTs } from 'ts-node/esm';
import * as tsConfigPaths from 'tsconfig-paths';
import { pathToFileURL } from 'url';

// Initialize tsconfig-paths to resolve imports
const { absoluteBaseUrl, paths } = tsConfigPaths.loadConfig();
let matcher;
if (absoluteBaseUrl && paths) {
  matcher = tsConfigPaths.createMatchPath(absoluteBaseUrl, paths);
}

export function resolve(specifier, context, nextResolve) {
  // Try to resolve path aliases using tsconfig-paths
  if (matcher && specifier.startsWith('.')) {
    const resolved = matcher(specifier);
    if (resolved) {
      specifier = pathToFileURL(resolved).href;
    }
  }
  return resolveTs(specifier, context, nextResolve);
}

// Use ts-node's loader for loading TypeScript files
export { load, getFormat, transformSource } from 'ts-node/esm';
`;

    fs.writeFileSync('ts-node-loader.mjs', loaderContent);
    console.log('✅ Created custom TypeScript loader at ts-node-loader.mjs');
    return true;
  } catch (error) {
    console.log('❌ Failed to create TypeScript loader:', error.message);
    return false;
  }
}

// Update package.json with a new server start script that uses the loader
function updatePackageJson() {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const content = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(content);
    
    // Create a backup
    fs.writeFileSync(`${packageJsonPath}.tsloader.bak`, content);
    console.log('✅ Created package.json backup at package.json.tsloader.bak');
    
    // Add new script for running the server with the custom loader
    if (packageJson.scripts) {
      packageJson.scripts['server:ts-fix'] = 'node --experimental-specifier-resolution=node --loader ./ts-node-loader.mjs src/server/index.ts';
      packageJson.scripts['server:ts-fix:prod'] = 'cross-env VITE_MODE=production node --experimental-specifier-resolution=node --loader ./ts-node-loader.mjs src/server/index.ts';
      
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log('✅ Updated package.json with new server scripts using the custom loader');
      return true;
    }
    
    return false;
  } catch (error) {
    console.log('❌ Failed to update package.json:', error.message);
    return false;
  }
}

// Install required packages
function installDependencies() {
  try {
    console.log('Installing required dependencies...');
    execSync('npm install --save-dev tsconfig-paths', { stdio: 'inherit' });
    console.log('✅ Installed tsconfig-paths package');
    return true;
  } catch (error) {
    console.log('❌ Failed to install dependencies:', error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('Fixing TypeScript loader for ESM mode...\n');
  
  // Install required dependencies
  const depsInstalled = installDependencies();
  
  // Create custom loader
  const loaderCreated = createTsLoader();
  
  // Update package.json
  const packageUpdated = updatePackageJson();
  
  if (loaderCreated && packageUpdated && depsInstalled) {
    console.log('\n✅ TypeScript ESM loader fix applied successfully!');
    console.log('\nYou can now start the server with:');
    console.log('npm run server:ts-fix');
    console.log('\nOr for production mode:');
    console.log('npm run server:ts-fix:prod');
  } else {
    console.log('\n⚠️ Some fixes were not applied successfully. Check the logs above.');
  }
}

// Run the main function
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
}); 