#!/bin/bash

# Function to check if a port is in use
is_port_in_use() {
  lsof -i:"$1" > /dev/null 2>&1
  return $?
}

# Kill any running server processes
echo "🔄 Stopping any running server processes..."
pkill -f "node run-server.js" || true
pkill -f "tsx src/server" || true
pkill -f "node start-server.js" || true

# Wait a moment for processes to terminate
sleep 1

# Try different ports
PORT=3001
BACKUP_PORT=3002
LAST_RESORT_PORT=3003

if is_port_in_use $PORT; then
  echo "⚠️ Port $PORT is in use, trying port $BACKUP_PORT"
  export PORT=$BACKUP_PORT
  
  if is_port_in_use $BACKUP_PORT; then
    echo "⚠️ Port $BACKUP_PORT is also in use, trying port $LAST_RESORT_PORT"
    export PORT=$LAST_RESORT_PORT
  fi
fi

# Start the server in the background
echo "🚀 Starting server on port $PORT..."
NODE_ENV=development VITE_MODE=staging node start-server.js &

# Wait for server to initialize
sleep 2

echo "✅ Server should now be running on port $PORT"
echo "👉 Try using semantic search on http://localhost:5173"
