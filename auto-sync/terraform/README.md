# Bill Auto-Sync Infrastructure

This directory contains Terraform configuration to automate daily bill synchronization for the Bill Tracker application.

## Infrastructure Overview

The infrastructure consists of:

1. **Google Cloud Storage Bucket** - Stores the synchronization scripts
2. **Service Account** - Dedicated identity with necessary permissions
3. **VM Instance Template** - Defines VM configuration for sync operations
4. **Cloud Scheduler Job** - Triggers the sync process at 13:00 UTC (1 PM UTC) daily

## Setup and Deployment

### Prerequisites

- [Terraform](https://www.terraform.io/downloads) v0.14+ installed
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed
- Appropriate permissions in the Google Cloud project

### Deployment Steps

#### 1. Initialize Terraform

```bash
cd auto-sync/terraform
terraform init
```

#### 2. Plan Changes

For staging environment:
```bash
terraform plan -var-file=staging.tfvars
```

For production environment:
```bash
terraform plan -var-file=production.tfvars
```

#### 3. Apply Changes

For staging environment:
```bash
terraform apply -var-file=staging.tfvars
```

For production environment:
```bash
terraform apply -var-file=production.tfvars
```

### Configuration Files

- `main.tf` - Primary Terraform configuration
- `variables.tf` - Variable definitions
- `staging.tfvars` - Staging environment values
- `production.tfvars` - Production environment values

## Auto-Sync Process

1. **Trigger**: Cloud Scheduler triggers the VM creation at 13:00 UTC daily (based on Congress.gov update frequency)
2. **VM Creation**: A new VM is created from the instance template
3. **Script Execution**: The VM downloads and runs syncBillsParallel.ts
4. **Logging**: Execution logs are uploaded to the GCS bucket
5. **Cleanup**: The VM automatically shuts down after completion

## Current Deployment

The system is currently deployed in **production** mode:

- **Schedule**: Daily at 13:00 UTC (1 PM UTC)
- **VM Type**: e2-standard-2 (2 vCPUs, 8GB memory)
- **Service Account**: Uses existing `bills-sync-production@dogeplotfun.iam.gserviceaccount.com`
- **Storage Bucket**: `dogeplotfun-sync-scripts-production`
- **Synchronization Settings**:
  - Environment: production
  - Limit: 100 bills per batch
  - Threads: 5 parallel processes
  - Congress: 119th Congress

### Important Changes

- Service accounts are now managed as data sources rather than resources
- Storage buckets include `force_destroy = true` to prevent deletion issues
- Cloud Scheduler timing has been optimized for Congress.gov update frequency (every 4 hours)

## Monitoring and Logs

- Execution logs are stored in the bucket at `gs://<bucket-name>/logs/`
- You can access the logs via the Google Cloud Console or using gsutil:
  ```bash
  gsutil ls gs://dogeplotfun-sync-scripts-production/logs/
  gsutil cat gs://dogeplotfun-sync-scripts-production/logs/sync-<timestamp>.log
  ```

## Troubleshooting

### Common Issues

1. **Permission Errors**
   - Verify the service account has necessary IAM permissions
   - Check Cloud Scheduler service account permissions

2. **Script Execution Failures**
   - Check the logs in the GCS bucket
   - Verify environment variables are correctly set

3. **Cloud Scheduler Trigger Failures**
   - Check Cloud Scheduler execution logs
   - Verify HTTP target authentication

4. **VM Creation Issues**
   - Check project quotas and limits
   - Verify instance template configuration

5. **Service Account Already Exists**
   - If deploying to a new environment where service accounts already exist, use the data source approach

### Helpful Commands

View the last sync log:
```bash
gsutil ls -l gs://dogeplotfun-sync-scripts-production/logs/ | sort -k2 | tail -1 | awk '{print $3}' | xargs gsutil cat
```

Check if the VM is running:
```bash
gcloud compute instances list --filter="name~bills-sync"
```

Manually trigger a sync job:
```bash
gcloud scheduler jobs run bills-sync-production-job --location=asia-southeast1
```

## Manual Testing

To test the auto-sync process without waiting for the scheduler:

1. Trigger the Cloud Scheduler job manually:
   ```bash
   gcloud scheduler jobs run bills-sync-production-job --location=asia-southeast1
   ```

2. Monitor the VM creation and execution:
   ```bash
   gcloud compute instances list
   ```

3. Check the VM serial port output:
   ```bash
   gcloud compute instances get-serial-port-output bills-sync-production-<timestamp> --zone=asia-southeast1-a
   ```

4. Check the logs after completion:
   ```bash
   gsutil ls -l gs://dogeplotfun-sync-scripts-production/logs/
   ``` 