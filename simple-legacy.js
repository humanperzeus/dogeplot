// Super simple legacy mode launcher
// This script has minimal dependencies and should work in any environment

const { execSync } = require('child_process');
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Simple function to get user input
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Simple function to run a command and log output
function runCommand(command) {
  console.log(`\n🚀 Running: ${command}`);
  try {
    // Use execSync so we get output directly in the console
    execSync(command, { 
      stdio: 'inherit',
      env: { ...process.env, DISABLE_HYBRID: 'true' }
    });
    return true;
  } catch (error) {
    console.error(`\n❌ Command failed: ${error.message}`);
    return false;
  }
}

// Kill any existing processes that might interfere
function killExistingProcesses() {
  try {
    console.log('\n🔄 Stopping any running processes...');
    
    if (process.platform === 'win32') {
      // Windows
      try { execSync('taskkill /F /IM node.exe /T', { stdio: 'ignore' }); } catch (e) {}
    } else {
      // MacOS/Linux
      try { execSync('pkill -f "node.*server" || true', { stdio: 'ignore' }); } catch (e) {}
      try { execSync('lsof -ti:3001,5173 | xargs kill -9 || true', { stdio: 'ignore' }); } catch (e) {}
    }
    
    console.log('✅ Cleaned up processes');
    return true;
  } catch (error) {
    console.log('⚠️ Could not clean up processes, but continuing anyway');
    return false;
  }
}

// Main function
async function main() {
  console.clear();
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  🐕 Ultra Simple Bill Tracker Launcher   ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("\nThis script will run the app in legacy mode without the hybrid approach.\n");
  
  console.log("Choose an option:");
  console.log("1. Run in Legacy Mode (Staging Environment)");
  console.log("2. Run in Legacy Mode (Production Environment)");
  console.log("3. Deploy in Legacy Mode");
  console.log("0. Exit\n");
  
  const choice = await askQuestion("Enter your choice (0-3): ");
  
  // Kill existing processes before starting
  killExistingProcesses();
  
  let success = false;
  
  switch (choice) {
    case '1':
      console.log("\n🚀 Starting in LEGACY MODE (staging)...");
      console.log("This will run without the hybrid approach using direct environment variables.");
      
      // Try running with direct environment variables
      if (process.platform === 'win32') {
        // Windows
        success = runCommand('set DISABLE_HYBRID=true && set VITE_MODE=staging && npm run dev:legacy');
      } else {
        // MacOS/Linux
        success = runCommand('DISABLE_HYBRID=true VITE_MODE=staging npm run dev:legacy');
      }
      break;
      
    case '2':
      console.log("\n🚀 Starting in LEGACY MODE (production)...");
      console.log("This will run without the hybrid approach using direct environment variables.");
      
      // Try running with direct environment variables
      if (process.platform === 'win32') {
        // Windows
        success = runCommand('set DISABLE_HYBRID=true && set VITE_MODE=production && npm run dev:legacy:prod');
      } else {
        // MacOS/Linux
        success = runCommand('DISABLE_HYBRID=true VITE_MODE=production npm run dev:legacy:prod');
      }
      break;
      
    case '3':
      console.log("\n🚀 Deploying in LEGACY MODE...");
      console.log("This will deploy the app to Google Cloud Run without the hybrid approach.");
      
      // Make sure the deploy script is executable
      if (process.platform !== 'win32') {
        try { execSync('chmod +x ./deploy-legacy.sh', { stdio: 'ignore' }); } catch (e) {}
      }
      
      success = runCommand('npm run deploy:legacy');
      break;
      
    case '0':
      console.log("\nExiting. Goodbye! 👋");
      rl.close();
      return;
      
    default:
      console.log("\n❌ Invalid choice.");
      break;
  }
  
  if (success) {
    console.log("\n✅ Command completed successfully!");
  } else {
    console.log("\n❌ Command failed. See errors above.");
  }
  
  const again = await askQuestion("\nDo you want to run another command? (y/n): ");
  if (again.toLowerCase() === 'y') {
    await main();
  } else {
    console.log("\nGoodbye! 👋");
    rl.close();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log("\n\nExiting... 👋");
  rl.close();
  process.exit(0);
});

// Start the program
main().catch(error => {
  console.error("Fatal error:", error);
  rl.close();
  process.exit(1);
}); 