# Terraform Configuration Setup

This directory contains Terraform configurations for deploying infrastructure. To use these configurations, you need to set up your environment variables.

## Setting Up Terraform Variables

1. Copy the example files to create your own variable files:

```bash
# For production environment
cp production.tfvars.example production.tfvars

# For staging environment
cp staging.tfvars.example staging.tfvars
```

2. Edit the `.tfvars` files with your actual values:

```
project_id          = "your_project_id"           # Your GCP project ID
region              = "your_region"               # e.g., "us-central1"
zone                = "your_zone"                 # e.g., "us-central1-a"
environment         = "production" or "staging"   # Environment name
source_supabase_url = "your_supabase_url"         # Your Supabase URL
source_supabase_key = "your_supabase_key"         # Your Supabase API key
congress_api_key    = "your_congress_api_key"     # Your Congress API key
schedule            = "0 13 * * *"                # Cron schedule for sync jobs
```

## Important Security Notes

- The `.tfvars` files contain sensitive information and are excluded from Git via `.gitignore`
- Never commit these files to the repository
- Keep your API keys and credentials secure
- If you accidentally commit sensitive information, consider it compromised and rotate your keys immediately

## Running Terraform

After setting up your variable files, you can run Terraform commands:

```bash
# Initialize Terraform
terraform init

# Plan deployment (staging)
terraform plan -var-file=staging.tfvars

# Apply deployment (staging)
terraform apply -var-file=staging.tfvars

# Plan deployment (production)
terraform plan -var-file=production.tfvars

# Apply deployment (production)
terraform apply -var-file=production.tfvars
``` 