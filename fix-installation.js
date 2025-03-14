// Auto-fix script for common installation and setup issues

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('\n🔧 AUTOMATIC ISSUE FIXER 🔧');
console.log('===========================\n');

// Helper to run a command and report status
function runStep(stepName, command) {
  console.log(`⏳ ${stepName}...`);
  try {
    const output = execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(`✅ ${stepName} successful!`);
    return true;
  } catch (error) {
    console.log(`❌ ${stepName} failed: ${error.message}`);
    return false;
  }
}

// Check if we need to fix type: module in package.json
try {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Check if type: module exists and is causing issues
  if (packageJson.type === 'module') {
    console.log('Found type: module in package.json which might be causing issues.');
    console.log('Would you like to: ');
    console.log('1. Create a temporary copy of package.json with type: module removed');
    console.log('2. Skip this step');
    
    // We can't actually ask for input in this script, so we'll just create the backup
    console.log('Creating backup and modified package.json...');
    
    // Backup original
    fs.copyFileSync(packageJsonPath, path.join(process.cwd(), 'package.json.backup'));
    
    // Create modified version for tests
    const modifiedPackageJson = { ...packageJson };
    delete modifiedPackageJson.type;
    fs.writeFileSync(
      path.join(process.cwd(), 'package.json.commonjs'),
      JSON.stringify(modifiedPackageJson, null, 2)
    );
    
    console.log('✅ Created package.json.commonjs with type: module removed');
    console.log('✅ Original backed up to package.json.backup');
  }
} catch (e) {
  console.log('⚠️ Could not check package.json: ' + e.message);
}

// Run each fix step
console.log('\n📋 Running fix steps:');

const steps = [
  {
    name: 'Update npm',
    command: 'npm install -g npm'
  },
  {
    name: 'Install ts-node globally',
    command: 'npm install -g ts-node'
  },
  {
    name: 'Install cross-env globally',
    command: 'npm install -g cross-env'
  },
  {
    name: 'Install root dependencies',
    command: 'npm install'
  },
  {
    name: 'Install server dependencies',
    command: process.platform === 'win32' 
      ? 'cd src\\server && npm install && cd ..\\..'
      : 'cd src/server && npm install && cd ../..'
  },
  {
    name: 'Create a basic .env.staging file if missing',
    command: () => {
      const envPath = path.join(process.cwd(), '.env.staging');
      if (!fs.existsSync(envPath)) {
        fs.writeFileSync(envPath, 
          'VITE_SUPABASE_URL=your_supabase_url\n' +
          'VITE_SUPABASE_ANON_KEY=your_supabase_key\n' +
          'OPENAI_API_KEY=your_openai_key\n' +
          'DISABLE_HYBRID=true\n'
        );
        console.log('✅ Created basic .env.staging file');
        return true;
      } else {
        console.log('✅ .env.staging file already exists');
        return true;
      }
    }
  },
  {
    name: 'Create a basic .env.production file if missing',
    command: () => {
      const envPath = path.join(process.cwd(), '.env.production');
      if (!fs.existsSync(envPath)) {
        fs.writeFileSync(envPath, 
          'VITE_SUPABASE_URL=your_supabase_url\n' +
          'VITE_SUPABASE_ANON_KEY=your_supabase_key\n' +
          'OPENAI_API_KEY=your_openai_key\n' +
          'DISABLE_HYBRID=true\n'
        );
        console.log('✅ Created basic .env.production file');
        return true;
      } else {
        console.log('✅ .env.production file already exists');
        return true;
      }
    }
  }
];

// Run each step
let successCount = 0;
for (const step of steps) {
  if (typeof step.command === 'function') {
    if (step.command()) successCount++;
  } else {
    if (runStep(step.name, step.command)) successCount++;
  }
}

console.log(`\n✅ Completed ${successCount}/${steps.length} fix steps.`);

console.log('\n📝 NEXT STEPS:');
console.log('1. Run the diagnostic tool: node diagnose.js');
console.log('2. Try running the server directly:');
console.log('   NODE_OPTIONS="--experimental-specifier-resolution=node" DISABLE_HYBRID=true VITE_MODE=staging node --loader ts-node/esm src/server/index.ts');
console.log('3. If you see ESM-related errors, try using the package.json.commonjs:');
console.log('   mv package.json package.json.esm && mv package.json.commonjs package.json');

console.log('\nGood luck! 🍀'); 