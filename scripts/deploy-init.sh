#!/bin/bash

# Check if we're in a CI environment
if [ "$CI" = true ]; then
    echo "🚀 Running in CI environment"
    
    # Create production env file from CI secrets
    echo "Creating .env.production from CI secrets..."
    
    # List of required environment variables
    required_vars=(
        "VITE_SUPABASE_URL"
        "VITE_SUPABASE_ANON_KEY"
        "SUPABASE_SERVICE_ROLE_KEY"
        "VITE_API_URL"
        "VITE_CONGRESS_API_KEY"
        "VITE_GOVINFO_API_KEY"
        "OPENROUTER_API_KEY"
        "OPENAI_API_KEY"
        "GEMINI_API_KEY"
    )
    
    # Check and write each variable
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            echo "❌ Error: $var is not set in CI environment"
            exit 1
        fi
        echo "$var=${!var}" >> .env.production
    done
    
    echo "✅ Environment file created successfully"
else
    echo "❌ Error: This script should only run in CI environment"
    exit 1
fi 