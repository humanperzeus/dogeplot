// Ultra-basic diagnostic script
// Run with: node basic.js

console.log('🔍 ULTRA-BASIC DIAGNOSTICS');
console.log('========================\n');

// Check Node.js
console.log('Node.js Version:', process.version);
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);
console.log('Current Directory:', process.cwd());

// Check if we can access the file system
try {
  const fs = require('fs');
  console.log('\nFile System Access: ✅');
  
  // Try to read package.json
  try {
    const packageJson = fs.readFileSync('./package.json', 'utf8');
    console.log('package.json exists: ✅');
    
    // Try to parse it
    try {
      const parsed = JSON.parse(packageJson);
      console.log('package.json is valid JSON: ✅');
      console.log('Node.js type:', parsed.type || 'commonjs');
      console.log('Main entry point:', parsed.main || 'N/A');
      
      // Check if it has a "type": "module" that might cause issues
      if (parsed.type === 'module') {
        console.log('\n⚠️ WARNING: Your package.json has "type": "module" which can cause issues with ts-node.');
        console.log('You might need to temporarily remove this line for compatibility with some tools.');
      }
    } catch (e) {
      console.log('package.json is NOT valid JSON: ❌');
      console.log('Error:', e.message);
    }
  } catch (e) {
    console.log('package.json NOT found: ❌');
    console.log('Error:', e.message);
  }
  
  // Try to access server directory
  try {
    fs.accessSync('./src/server', fs.constants.F_OK);
    console.log('\nsrc/server directory exists: ✅');
    
    // Check if server index file exists
    try {
      fs.accessSync('./src/server/index.ts', fs.constants.F_OK);
      console.log('src/server/index.ts exists: ✅');
    } catch (e) {
      console.log('src/server/index.ts NOT found: ❌');
    }
    
    // Check if server package.json exists
    try {
      fs.accessSync('./src/server/package.json', fs.constants.F_OK);
      console.log('src/server/package.json exists: ✅');
    } catch (e) {
      console.log('src/server/package.json NOT found: ❌');
    }
  } catch (e) {
    console.log('\nsrc/server directory NOT found: ❌');
  }
  
  // Try to read .env files
  console.log('\nEnvironment Files:');
  ['staging', 'production'].forEach(env => {
    try {
      fs.accessSync(`./.env.${env}`, fs.constants.F_OK);
      console.log(`.env.${env} exists: ✅`);
    } catch (e) {
      console.log(`.env.${env} NOT found: ❌`);
    }
  });
  
} catch (e) {
  console.log('\nError accessing file system:', e.message);
}

// Try to use child_process
try {
  const { exec } = require('child_process');
  console.log('\nChild Process Module: ✅');
  
  // Try to run a basic command
  exec('node --version', (error, stdout, stderr) => {
    if (error) {
      console.log('Failed to execute node --version:', error.message);
      return;
    }
    if (stderr) {
      console.log('stderr:', stderr);
      return;
    }
    console.log('Verified can run commands: ✅ (Node.js version:', stdout.trim() + ')');
    
    // Now try npm
    exec('npm --version', (error, stdout, stderr) => {
      if (error) {
        console.log('Failed to execute npm --version:', error.message);
        console.log('\n🔴 DIAGNOSIS: npm appears to be broken or not installed correctly.');
        console.log('Try reinstalling Node.js from https://nodejs.org/');
        return;
      }
      console.log('npm available: ✅ (version:', stdout.trim() + ')');
      
      // Check for TypeScript
      exec('npx tsc --version', (error, stdout, stderr) => {
        if (error) {
          console.log('TypeScript not found or not installed:', error.message);
          console.log('\n🔴 DIAGNOSIS: TypeScript is not installed.');
          console.log('Try installing it with: npm install -g typescript');
          return;
        }
        console.log('TypeScript available: ✅ (version:', stdout.trim() + ')');
        
        // Check for ts-node
        exec('npx ts-node --version', (error, stdout, stderr) => {
          if (error) {
            console.log('ts-node not found or not installed:', error.message);
            console.log('\n🔴 DIAGNOSIS: ts-node is not installed.');
            console.log('Try installing it with: npm install -g ts-node');
            return;
          }
          console.log('ts-node available: ✅ (version:', stdout.trim() + ')');
          
          // Now print summary
          console.log('\n✅ SUMMARY: Basic environment checks passed.');
          console.log('If you still can\'t run npm commands, try:');
          console.log('1. Reinstall Node.js from https://nodejs.org/');
          console.log('2. Run: node fix-installation.js');
          console.log('3. Try a different terminal or command prompt');
        });
      });
    });
  });
} catch (e) {
  console.log('\nError using child_process:', e.message);
}

// End message (will appear before async operations finish)
console.log('\n🕰️ Running async checks... (results will appear above)');
console.log('If no more output appears, there may be an issue with async operations.');
console.log('In that case, try restarting your computer and trying again.'); 