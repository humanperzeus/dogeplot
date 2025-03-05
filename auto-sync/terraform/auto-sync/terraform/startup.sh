#!/bin/bash

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Create work directory
mkdir -p /opt/bills-sync
cd /opt/bills-sync

# Download sync script from GCS
gsutil cp gs://dogeplotfun-sync-scripts-staging/syncBillsParallel.ts .
gsutil cp gs://dogeplotfun-sync-scripts-staging/package.json .
gsutil cp gs://dogeplotfun-sync-scripts-staging/tsconfig.json .

# Install dependencies
npm install

# Run sync script with appropriate environment
if [[ "${ENVIRONMENT}" == "production" ]]; then
  npx ts-node syncBillsParallel.ts --production --limit=5 --threads=5 --congress=119 --offset=0
else
  npx ts-node syncBillsParallel.ts --staging --limit=100 --threads=5 --congress=119 --offset=0
fi 