#!/bin/bash

# Reset Cache Script
# This script attempts to run either reset-stats.js or reset-stats.mjs
# to reset the server-side caches

echo "🧹 DOGEPLOT Cache Reset Tool"
echo "============================"
echo "This tool resets both bill statistics and trending bills caches."
echo "Make sure your server is running before proceeding."
echo ""

# Check if server is running
echo "🔍 Checking if server is running..."
if curl -s http://localhost:3001/api/bill-stats > /dev/null; then
  echo "✅ Server is running."
else
  echo "❌ Server is not running at http://localhost:3001"
  echo "Please start the server first with one of these commands:"
  echo "  nr dev:local:staging    # For staging environment"
  echo "  nr dev:local:production # For production environment"
  echo ""
  read -p "Do you want to continue anyway? (y/N): " continue_anyway
  if [[ ! "$continue_anyway" =~ ^[Yy]$ ]]; then
    echo "Exiting."
    exit 1
  fi
  echo "Continuing despite server not running..."
fi

# Try to run reset-stats.js first (ES Modules version)
echo "🔄 Attempting to run reset-stats.js..."
if node reset-stats.js; then
  echo "✅ Cache reset completed successfully using reset-stats.js"
  exit 0
else
  echo "⚠️ reset-stats.js failed, trying reset-stats.mjs..."
  
  # If that fails, try reset-stats.mjs (ES Modules version)
  if node reset-stats.mjs; then
    echo "✅ Cache reset completed successfully using reset-stats.mjs"
    exit 0
  else
    echo "❌ Both reset scripts failed. Please check the error messages above."
    exit 1
  fi
fi 