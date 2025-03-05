// ESM/CommonJS compatibility fix script
// Run with: node fix-esm-issues.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 ESM/COMMONJS COMPATIBILITY FIX TOOL');
console.log('====================================\n');

// Function to create a CommonJS version of a file
function createCommonJSVersion(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`❌ ${filePath} doesn't exist`);
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const newFilePath = filePath.replace('.js', '.cjs');
    
    // Simple conversion of ESM to CommonJS
    let newContent = content
      .replace(/import\s+(\{[^}]+\})\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require("$2")')
      .replace(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require("$2")')
      .replace(/import\s+['"]([^'"]+)['"]/g, 'require("$1")')
      .replace(/export\s+default\s+(\w+)/g, 'module.exports = $1')
      .replace(/export\s+(\{[^}]+\})/g, 'module.exports = $1')
      .replace(/export\s+const\s+(\w+)\s+=\s+/g, 'const $1 = ')
      .replace(/export\s+function\s+(\w+)/g, 'function $1');
    
    fs.writeFileSync(newFilePath, newContent);
    console.log(`✅ Created CommonJS version: ${newFilePath}`);
    return true;
  } catch (error) {
    console.log(`❌ Failed to create CommonJS version of ${filePath}:`, error.message);
    return false;
  }
}

// Function to create a temporary package.json without "type": "module"
function createCompatiblePackageJson() {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const content = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(content);
    
    // Create a backup
    fs.writeFileSync(`${packageJsonPath}.bak`, content);
    console.log('✅ Created package.json backup at package.json.bak');
    
    // Create commonjs version (without type:module)
    const commonJsPackageJson = { ...packageJson };
    delete commonJsPackageJson.type;
    fs.writeFileSync('package.commonjs.json', JSON.stringify(commonJsPackageJson, null, 2));
    console.log('✅ Created CommonJS package.json at package.commonjs.json');
    
    console.log('\n⚠️ To temporarily use CommonJS mode, run:');
    console.log('mv package.json package.esm.json && mv package.commonjs.json package.json');
    console.log('\n⚠️ To switch back to ESM mode, run:');
    console.log('mv package.json package.commonjs.json && mv package.esm.json package.json');
    
    return true;
  } catch (error) {
    console.log('❌ Failed to create compatible package.json:', error.message);
    return false;
  }
}

// Function to create CommonJS versions of critical files
function createCompatibleVersions() {
  const criticalFiles = [
    'diagnose.js',
    'fix-installation.js',
    'direct-run.js',
    'run-server.js',
    'run-app.js'
  ];
  
  let success = true;
  for (const file of criticalFiles) {
    if (fs.existsSync(file)) {
      if (!createCommonJSVersion(file)) {
        success = false;
      }
    } else {
      console.log(`ℹ️ ${file} not found, skipping`);
    }
  }
  
  return success;
}

// Function to add new npm scripts for CommonJS versions
function updateNpmScripts() {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const content = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(content);
    
    // Add .cjs script versions
    let updated = false;
    if (packageJson.scripts) {
      const newScripts = {};
      
      if (packageJson.scripts.diagnose) {
        newScripts['diagnose:cjs'] = 'node diagnose.cjs';
        updated = true;
      }
      
      if (packageJson.scripts.fix) {
        newScripts['fix:cjs'] = 'node fix-installation.cjs';
        updated = true;
      }
      
      if (packageJson.scripts['direct:run']) {
        newScripts['direct:run:cjs'] = 'node direct-run.cjs';
        updated = true;
      }
      
      // Add the new scripts
      packageJson.scripts = { 
        ...packageJson.scripts, 
        ...newScripts,
        'compat': 'node fix-esm-issues.js' 
      };
      
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log('✅ Updated package.json with CommonJS script versions');
      
      console.log('\n⚠️ You can now run CommonJS versions with:');
      Object.keys(newScripts).forEach(script => {
        console.log(`npm run ${script}`);
      });
    }
    
    return updated;
  } catch (error) {
    console.log('❌ Failed to update npm scripts:', error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('🔍 Analyzing project structure...\n');
  
  // Check if we need to create CommonJS versions
  let packageType = 'unknown';
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const content = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(content);
    packageType = packageJson.type || 'commonjs';
    
    console.log(`Current package.json type: ${packageType}`);
    
    if (packageType === 'module') {
      console.log('This project is configured as an ES module.');
      console.log('This means .js files are treated as ES modules, which may cause issues with scripts using require().');
      console.log('\nApplying compatibility fixes...\n');
      
      // Create CommonJS versions of critical files
      const filesFixed = createCompatibleVersions();
      
      // Create a compatible package.json
      const packageFixed = createCompatiblePackageJson();
      
      // Update npm scripts
      const scriptsUpdated = updateNpmScripts();
      
      if (filesFixed && packageFixed && scriptsUpdated) {
        console.log('\n✅ ESM/CommonJS compatibility fixes applied successfully!');
      } else {
        console.log('\n⚠️ Some fixes were not applied successfully. Check the logs above.');
      }
    } else {
      console.log('This project is already configured as CommonJS. No fixes needed.');
    }
  } catch (error) {
    console.log('❌ Failed to analyze package.json:', error.message);
  }
  
  console.log('\n📋 INSTRUCTIONS');
  console.log('-------------');
  console.log('1. To run the diagnostics tool, use:');
  console.log('   node diagnose-esm.js');
  console.log('2. To run the CommonJS versions, use:');
  console.log('   npm run diagnose:cjs');
  console.log('   npm run fix:cjs');
  console.log('   npm run direct:run:cjs');
  console.log('3. If temporary CommonJS mode is needed:');
  console.log('   mv package.json package.esm.json && mv package.commonjs.json package.json');
  console.log('4. To switch back to ESM mode:');
  console.log('   mv package.json package.commonjs.json && mv package.esm.json package.json');
}

// Run the main function
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
}); 