#!/usr/bin/env node

// This is a super-simple script to run the app in legacy mode
// without any fancy menus or complex options

const { spawn, execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function runCommand(command) {
  console.log(`📌 Running: ${command}`);
  try {
    // Kill any existing processes on ports 3001 and 5173
    try {
      execSync('lsof -ti:3001,5173 | xargs kill -9 2>/dev/null || true');
    } catch (e) {
      // Ignore errors
    }
    
    const child = spawn(command, { 
      shell: true, 
      stdio: 'inherit',
      env: { ...process.env, DISABLE_HYBRID: 'true' }
    });
    
    return new Promise((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });
      
      child.on('error', (err) => {
        reject(err);
      });
    });
  } catch (error) {
    console.error(`❌ Command failed: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.clear();
  console.log("=".repeat(50));
  console.log("🐕 Super Simple Bill Tracker App Runner");
  console.log("=".repeat(50));
  console.log("\nThis script helps you run the app in legacy mode without any fancy options.\n");
  
  console.log("Options:");
  console.log("1. Run in Legacy Mode (Staging)");
  console.log("2. Run in Legacy Mode (Production)");
  console.log("3. Deploy in Legacy Mode");
  console.log("0. Exit\n");
  
  const choice = await question("Enter your choice (0-3): ");
  
  try {
    switch (choice) {
      case '1':
        console.log("\n🚀 Running app in LEGACY mode (staging)...");
        await runCommand('npm run legacy');
        break;
        
      case '2':
        console.log("\n🚀 Running app in LEGACY mode (production)...");
        await runCommand('npm run legacy:prod');
        break;
        
      case '3':
        console.log("\n🚀 Deploying app in LEGACY mode...");
        await runCommand('npm run deploy:legacy');
        break;
        
      case '0':
        console.log("\nGoodbye! 👋");
        rl.close();
        return;
        
      default:
        console.log("\n❌ Invalid choice. Try again.\n");
        await main();
        return;
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.log("\nPress Enter to try again...");
    await question("");
    await main();
    return;
  }
}

// Handle Ctrl+C to exit gracefully
process.on('SIGINT', () => {
  console.log("\nExiting... 👋");
  rl.close();
  process.exit(0);
});

// Run the script
main().then(() => {
  rl.close();
}).catch((err) => {
  console.error('Fatal error:', err);
  rl.close();
  process.exit(1);
}); 