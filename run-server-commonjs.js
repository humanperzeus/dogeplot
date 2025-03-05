// CommonJS Server Runner
// This script runs the server using ts-node in CommonJS mode
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting server in CommonJS mode');
const serverDir = path.join(__dirname, 'src', 'server');

// Default to development mode unless specified
const mode = process.argv[2] || 'development';
console.log(`Mode: ${mode}`);

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
    console.log(`Server process exited with code ${code}`);
  }
});

console.log('Server process started. Press Ctrl+C to stop.');
