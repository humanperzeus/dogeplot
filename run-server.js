// Direct server launcher that doesn't rely on npm scripts
// This script directly starts the Node.js server with the right environment variables

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Set up environment variables
const env = {
  ...process.env,
  NODE_ENV: 'development',
  VITE_MODE: process.argv[2] === 'production' ? 'production' : 'staging',
  DISABLE_HYBRID: 'true'
};

console.log(`
╔══════════════════════════════════════════╗
║  🐕 Direct Server Launcher (LEGACY MODE) ║
╚══════════════════════════════════════════╝

Environment:
- VITE_MODE: ${env.VITE_MODE}
- NODE_ENV: ${env.NODE_ENV}
- DISABLE_HYBRID: ${env.DISABLE_HYBRID}

Starting server in LEGACY MODE...
Press Ctrl+C to exit
`);

// Construct the paths
const serverDir = path.join(__dirname, 'src', 'server');
const serverFile = path.join(serverDir, 'index.ts');

// Log the paths for debugging
console.log(`Server directory: ${serverDir}`);
console.log(`Server file: ${serverFile}`);

// Check if the file exists
if (!fs.existsSync(serverFile)) {
  console.error(`❌ Error: Server file not found at ${serverFile}`);
  process.exit(1);
}

// Start the server
const server = spawn('node', ['--loader', 'ts-node/esm', serverFile], {
  env,
  cwd: __dirname,
  stdio: 'inherit'
});

server.on('error', (err) => {
  console.error(`❌ Failed to start server: ${err.message}`);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n💤 Shutting down server...');
  server.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500);
});

// Handle server exit
server.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Server exited with code ${code}`);
    process.exit(code);
  }
}); 