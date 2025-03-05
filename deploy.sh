#!/bin/bash

# Store current date for backup naming
DATE=$(date '+%Y%m%d_%H%M%S')

# 1. Backup .gitignore if it exists
if [ -f .gitignore ]; then
    cp .gitignore .gitignore.backup.$DATE
    echo "✅ Backed up .gitignore"
fi

# 2. Create deployment-safe .gitignore (excluding .env.* from ignore)
cat > .gitignore << EOL
# Dependencies
node_modules
.pnp
.pnp.js

# Testing
coverage

# Production
build
dist

# Logs
logs
*.log
npm-debug.log*

# Runtime data
pids
*.pid
*.seed

# Directory for instrumented libs
lib-cov

# Coverage directory
coverage

# IDEs and editors
.idea
.project
.classpath
*.launch
.settings/
*.sublime-workspace
.vscode/*

# System Files
.DS_Store
Thumbs.db

# Temporary files
*.swp
*.swo
*~
EOL

echo "✅ Created deployment-safe .gitignore"

# 3. Run deployment
echo "🚀 Running deployment..."
npm run deploy:cloud:prod

# 4. Restore original .gitignore
if [ -f .gitignore.backup.$DATE ]; then
    mv .gitignore.backup.$DATE .gitignore
    echo "✅ Restored original .gitignore"
fi

echo "✨ Deployment complete!" 