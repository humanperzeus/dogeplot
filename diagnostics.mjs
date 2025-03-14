#!/usr/bin/env node

// Ultra-comprehensive diagnostic script for ESM/CommonJS/TypeScript issues
// Run with: node diagnostics.mjs
import { execSync, exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 COMPREHENSIVE DIAGNOSTICS');
console.log('===========================\n');

// Check Node.js environment
console.log('🖥️ NODE.JS ENVIRONMENT');
console.log('---------------------');
console.log('Node.js Version:', process.version);
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);

// Check package.json
console.log('\n📦 PACKAGE.JSON CHECK');
console.log('-------------------');

function checkPackageJson(path, name) {
  try {
    if (!fs.existsSync(path)) {
      console.log(`❌ ${name} not found at ${path}`);
      return null;
    }

    const content = fs.readFileSync(path, 'utf8');
    try {
      const json = JSON.parse(content);
      console.log(`✅ ${name} found and parsed successfully`);
      
      // Check module type
      if (json.type === 'module') {
        console.log(`ℹ️ ${name} has "type": "module" (ESM mode)`);
      } else {
        console.log(`ℹ️ ${name} is in CommonJS mode (no "type" field or "type": "commonjs")`);
      }
      
      // Check dependencies
      const deps = [
        ...Object.keys(json.dependencies || {}),
        ...Object.keys(json.devDependencies || {})
      ];
      
      const criticalDeps = ['typescript', 'ts-node', 'tsx'];
      criticalDeps.forEach(dep => {
        if (deps.some(d => d === dep)) {
          console.log(`✅ ${dep} is installed`);
        } else {
          console.log(`❌ ${dep} is not installed in ${name}`);
        }
      });
      
      return json;
    } catch (error) {
      console.log(`❌ Failed to parse ${name}:`, error.message);
      return null;
    }
  } catch (error) {
    console.log(`❌ Failed to read ${name}:`, error.message);
    return null;
  }
}

const rootPackageJson = checkPackageJson('./package.json', 'Root package.json');
const serverPackageJson = checkPackageJson('./src/server/package.json', 'Server package.json');

// Check TypeScript configuration
console.log('\n📝 TYPESCRIPT CONFIG CHECK');
console.log('------------------------');

function checkTsConfig(path) {
  try {
    if (!fs.existsSync(path)) {
      console.log(`❌ TypeScript config not found at ${path}`);
      return null;
    }

    const content = fs.readFileSync(path, 'utf8');
    try {
      const json = JSON.parse(
        content
          .replace(/\/\/.*$/gm, '') // Remove single line comments
          .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      );
      console.log(`✅ TypeScript config found and parsed successfully`);
      
      // Check module setting
      if (json.compilerOptions) {
        const moduleSystem = json.compilerOptions.module;
        console.log(`ℹ️ TypeScript module setting: ${moduleSystem || 'not specified'}`);
        
        if (moduleSystem) {
          if (['ES2020', 'ES2022', 'ESNext', 'NodeNext'].includes(moduleSystem)) {
            console.log(`✅ TypeScript module setting is compatible with ESM`);
          } else if (['CommonJS'].includes(moduleSystem)) {
            console.log(`✅ TypeScript module setting is compatible with CommonJS`);
          } else {
            console.log(`⚠️ TypeScript module setting might cause compatibility issues`);
          }
        }
        
        // Check moduleResolution
        const moduleResolution = json.compilerOptions.moduleResolution;
        console.log(`ℹ️ TypeScript moduleResolution setting: ${moduleResolution || 'not specified'}`);
      }
      
      return json;
    } catch (error) {
      console.log(`❌ Failed to parse TypeScript config:`, error.message);
      return null;
    }
  } catch (error) {
    console.log(`❌ Failed to read TypeScript config:`, error.message);
    return null;
  }
}

checkTsConfig('./tsconfig.json');

// Check server index file
console.log('\n📄 SERVER CODE CHECK');
console.log('------------------');

function checkServerCode(path) {
  try {
    if (!fs.existsSync(path)) {
      console.log(`❌ Server index not found at ${path}`);
      return false;
    }

    const content = fs.readFileSync(path, 'utf8');
    console.log(`✅ Server index file found`);
    
    // Check for CommonJS vs ESM
    if (content.includes('require(')) {
      console.log(`ℹ️ Server code uses CommonJS require() statements`);
    }
    
    if (content.includes('import ')) {
      console.log(`ℹ️ Server code uses ESM import statements`);
    }
    
    // Scan first 30 lines for import/require pattern
    const lines = content.split('\n').slice(0, 30);
    let commonjsCount = 0;
    let esmCount = 0;
    
    lines.forEach(line => {
      if (line.includes('require(')) commonjsCount++;
      if (line.includes('import ')) esmCount++;
    });
    
    if (commonjsCount > 0 && esmCount > 0) {
      console.log(`⚠️ Server code appears to mix CommonJS and ESM imports!`);
    } else if (commonjsCount > 0) {
      console.log(`⚠️ Server uses CommonJS but project is in ESM mode!`);
    } else if (esmCount > 0) {
      console.log(`✅ Server uses ESM imports`);
    }
    
    return true;
  } catch (error) {
    console.log(`❌ Failed to read server index:`, error.message);
    return false;
  }
}

checkServerCode('./src/server/index.ts');

// Test server start methods
console.log('\n🧪 SERVER START METHODS TEST');
console.log('--------------------------');

function testCommand(name, command) {
  console.log(`\nTesting: ${name}`);
  console.log(`Command: ${command}`);
  
  try {
    // Run with a timeout
    const child = exec(command);
    let output = '';
    
    child.stdout.on('data', (data) => {
      output += data;
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      output += data;
      process.stderr.write(data);
    });
    
    // Kill after 3 seconds
    setTimeout(() => {
      child.kill();
      console.log('\nTest completed - process terminated after timeout');
      
      // Analyze output
      if (output.includes('Error') || output.includes('error:')) {
        console.log('❌ Test detected errors');
      } else if (output.includes('Server running') || output.includes('listening') || output.includes('started')) {
        console.log('✅ Server appears to start successfully');
      } else {
        console.log('⚠️ Unclear if server started successfully');
      }
    }, 3000);
  } catch (error) {
    console.log(`❌ Failed to execute command:`, error.message);
  }
}

// Test direct ts-node
console.log("\nMethod 1: Direct ts-node");
testCommand("ts-node with esm flag", "cd src/server && npx ts-node --esm index.ts");

// Wait between tests
setTimeout(() => {
  // Test tsx
  console.log("\nMethod 2: tsx (ESM-compatible TypeScript runner)");
  testCommand("tsx", "cd src/server && npx tsx index.ts");

  // Wait between tests
  setTimeout(() => {
    // Test node with ts-node/esm loader
    console.log("\nMethod 3: node with ts-node/esm loader");
    testCommand("node with loader", "cd src/server && node --loader ts-node/esm index.ts");

    // Wait between tests
    setTimeout(() => {
      // Test node with ts-node register hook for CommonJS
      console.log("\nMethod 4: node with ts-node/register for CommonJS");
      testCommand("node with register", "cd src/server && node -r ts-node/register index.ts");

      // Final report after all tests
      setTimeout(() => {
        console.log('\n🧠 DIAGNOSIS');
        console.log('-----------');
        
        if (rootPackageJson && rootPackageJson.type === 'module') {
          console.log('1. Your project is configured for ESM modules with "type": "module"');
          
          if (serverPackageJson && serverPackageJson.type !== 'module') {
            console.log('✅ Server package.json is correctly set for CommonJS mode');
          } else {
            console.log('❌ Server code should not use "type": "module" if it contains CommonJS require() statements');
            console.log('   Solution: Remove "type": "module" from src/server/package.json');
          }
          
          console.log('\n🔧 RECOMMENDATION');
          console.log('---------------');
          console.log('Try these commands:');
          console.log('1. cd src/server && npx tsx index.ts');
          console.log('2. cd src/server && npx ts-node --esm index.ts');
          console.log('3. cd src/server && node -r ts-node/register index.ts');
          
        } else {
          console.log('1. Your project is configured for CommonJS modules (no "type": "module")');
          console.log('\n🔧 RECOMMENDATION');
          console.log('---------------');
          console.log('Try these commands:');
          console.log('1. cd src/server && npx ts-node index.ts');
          console.log('2. cd src/server && node -r ts-node/register index.ts');
        }
        
        console.log('\nIf all else fails:');
        console.log('1. cd src/server && npm init -y');
        console.log('2. cd src/server && npm install ts-node typescript nodemon express --save-dev');
        console.log('3. cd src/server && npx ts-node index.ts');
      }, 4000);
    }, 4000);
  }, 4000);
}, 4000); 