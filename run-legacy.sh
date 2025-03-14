#!/bin/bash

# Kill any processes running on ports 3001 and 5173
echo "Killing any processes on ports 3001 and 5173..."
lsof -ti:3001,5173 | xargs kill -9 2>/dev/null || true

# Set environment variables for legacy mode
export DISABLE_HYBRID=true
export VITE_MODE=staging
export NODE_ENV=development

# Start frontend in one terminal
echo "Starting frontend on port 5173..."
npx vite --mode staging &
FRONTEND_PID=$!

# Start backend in another terminal
echo "Starting backend on port 3001..."
cd src/server && node --loader ts-node/esm index.ts &
BACKEND_PID=$!

# Function to handle termination
function cleanup {
  echo "Shutting down..."
  kill $FRONTEND_PID $BACKEND_PID 2>/dev/null || true
  exit 0
}

# Set up termination handler
trap cleanup SIGINT SIGTERM

# Wait for user to press Ctrl+C
echo ""
echo "=========================="
echo "App running in legacy mode"
echo "Frontend: http://localhost:5173"
echo "Backend: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop"
echo "=========================="

# Keep the script running
wait 