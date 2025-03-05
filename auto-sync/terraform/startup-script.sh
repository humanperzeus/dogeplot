#!/bin/bash

# Enable exit on error and command trace
set -e
exec > >(tee /var/log/bills-sync-startup.log) 2>&1
echo "=============== STARTUP SCRIPT STARTED at $(date) ==============="

# Log start time 
echo "Starting bills sync script at $(date)"
echo "Environment: ${environment}"
echo "Bucket: ${bucket_name}"

# Install Node.js and npm
echo "Installing Node.js and npm..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get update
apt-get install -y nodejs

# Verify Node.js and npm versions
node --version
npm --version

# Install TypeScript and related tools globally
echo "Installing TypeScript and related tools globally..."
npm install -g typescript ts-node tsx

# Create working directory
mkdir -p /opt/bills-sync
cd /opt/bills-sync

# Download scripts and config files from GCS
echo "Downloading scripts from storage bucket..."
gsutil cp gs://${bucket_name}/syncBillsParallel.ts .
gsutil cp gs://${bucket_name}/loadEnv.ts .
gsutil cp gs://${bucket_name}/tsconfig.json .

# List the downloaded files
echo "Downloaded files:"
ls -la

# Create package.json with proper ESM configuration
echo "Creating package.json with ESM support..."
cat > package.json << EOL
{
  "name": "bills-sync",
  "version": "1.0.0",
  "description": "Bills synchronization script",
  "type": "module",
  "main": "syncBillsParallel.ts",
  "scripts": {
    "start": "tsx syncBillsParallel.ts"
  }
}
EOL

# Install dependencies
echo "Installing required dependencies..."
npm install @supabase/supabase-js dotenv axios uuid pdf.js-extract filesize date-fns
npm install --save-dev @types/node @types/uuid tslib typescript tsx

# Create .env.staging or .env.production file with required environment variables
echo "Creating environment file for ${environment}..."
cat > .env.${environment} << EOL
VITE_SUPABASE_URL=${source_supabase_url}
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=${source_supabase_key}
VITE_CONGRESS_API_KEY=${congress_api_key}
VITE_MODE=${environment}
EOL

# Create a basic .env file as well
cat > .env << EOL
VITE_SUPABASE_URL=${source_supabase_url}
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=${source_supabase_key}
VITE_CONGRESS_API_KEY=${congress_api_key}
VITE_MODE=${environment}
EOL

# Check file contents
echo "Environment files created:"
echo ".env.${environment}:"
cat .env.${environment}
echo ".env:"
cat .env

# Verify tsconfig.json
echo "tsconfig.json content:"
cat tsconfig.json

# Log start of sync
echo "Starting bill synchronization with parameters: environment=${environment}, limit=100, threads=5, congress=119, offset=0"

# Run the sync script (with parallel processing) and redirect output to a log file
echo "Executing sync script with tsx..."
npx tsx syncBillsParallel.ts --${environment} --limit=100 --threads=5 --congress=119 --offset=0 2>&1 | tee sync.log

# Wait for script to complete and get exit code
EXIT_CODE=$?

# Log completion status
if [ $EXIT_CODE -eq 0 ]; then
  echo "Bill sync completed successfully at $(date)"
else
  echo "Bill sync failed with exit code $EXIT_CODE at $(date)"
  echo "Last few lines of log:"
  tail -n 50 sync.log
fi

# Upload log file to the bucket for future reference
echo "Uploading log file to GCS bucket..."
gsutil cp sync.log gs://${bucket_name}/logs/sync-$(date +%Y%m%d-%H%M%S).log
gsutil cp /var/log/bills-sync-startup.log gs://${bucket_name}/logs/startup-$(date +%Y%m%d-%H%M%S).log

# Display completion message
echo "=============== STARTUP SCRIPT COMPLETED at $(date) ==============="

# Shutdown the instance
echo "Shutting down instance..."
shutdown -h now 