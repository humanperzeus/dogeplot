#!/bin/bash

# ======= BASIC LEGACY DEPLOYMENT SCRIPT =======
# This script deploys the application in legacy mode (without hybrid features)
# to Google Cloud Run.

# Function to print error and exit
function error_exit {
  echo "ERROR: $1" >&2
  exit 1
}

# Get environment input with validation
while true; do
  read -p "Deploy to [s]taging or [p]roduction? (s/p): " env
  case $env in
    s|S) 
      DEPLOY_ENV="staging"
      ENV_FILE=".env.staging"
      SERVICE_NAME="bill-tracker-legacy-staging"
      break
      ;;
    p|P) 
      DEPLOY_ENV="production"
      ENV_FILE=".env.production"
      SERVICE_NAME="bill-tracker-legacy-production"
      
      # Confirm production deployment
      read -p "⚠️ Are you sure you want to deploy to PRODUCTION? (y/N): " confirm
      if [[ ! $confirm =~ ^[Yy]$ ]]; then
        echo "Cancelled deployment to production"
        exit 0
      fi
      break
      ;;
    *) echo "Please enter s or p";;
  esac
done

echo "=== Building and Deploying to $DEPLOY_ENV in LEGACY MODE ==="

# Check if files exist
if [ ! -f "$ENV_FILE" ]; then
  error_exit "Environment file $ENV_FILE not found!"
fi

# Build the application in legacy mode
echo "📦 Building application in legacy mode..."
DISABLE_HYBRID=true npm run build || error_exit "Build failed"

# Create a temporary Dockerfile.legacy
echo "📝 Creating Dockerfile.legacy..."
cat > Dockerfile.legacy << EOF
# Legacy mode deployment
FROM node:18-alpine

WORKDIR /app

# Copy built app
COPY dist ./dist
COPY package.json ./
COPY src/server ./src/server
COPY $ENV_FILE ./

# Install dependencies
RUN npm install --omit=dev
RUN npm install ts-node

# Environment variables
ENV PORT=8080
ENV NODE_ENV=production
ENV VITE_MODE=$DEPLOY_ENV
ENV DISABLE_HYBRID=true

# Expose port
EXPOSE 8080

# Start the server
CMD ["node", "--loader", "ts-node/esm", "src/server/index.ts"]
EOF

# Get project ID
echo "🔍 Getting Google Cloud project ID..."
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  error_exit "No Google Cloud project ID found. Please set with: gcloud config set project YOUR_PROJECT_ID"
fi

# Build and push Docker image
TAG="gcr.io/$PROJECT_ID/$SERVICE_NAME:$(date +%Y%m%d-%H%M%S)"
echo "📦 Building Docker image: $TAG"
docker build -t $TAG -f Dockerfile.legacy . || error_exit "Docker build failed"

echo "📤 Pushing Docker image..."
docker push $TAG || error_exit "Docker push failed"

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image=$TAG \
  --platform=managed \
  --region=us-central1 \
  --allow-unauthenticated || error_exit "Deployment failed"

echo "✅ Successfully deployed to $DEPLOY_ENV in legacy mode!"
echo "🌐 Service URL: https://$SERVICE_NAME-{hash}.a.run.app"

# Clean up temporary file
rm Dockerfile.legacy 