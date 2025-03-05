terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
  required_version = ">= 0.14"
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# Create a Cloud Storage bucket for the sync script
resource "google_storage_bucket" "scripts_bucket" {
  name     = "${var.project_id}-sync-scripts-${var.environment}"
  location = var.region
  
  uniform_bucket_level_access = true
  force_destroy               = true

  # Create folder structure
  lifecycle {
    ignore_changes = [
      lifecycle_rule,
    ]
  }
}

# Create logs folder in the bucket
resource "google_storage_bucket_object" "logs_folder" {
  name          = "logs/"
  content       = " "  # Empty content for folder
  bucket        = google_storage_bucket.scripts_bucket.name
  content_type  = "application/x-directory"
}

# Upload the syncBillsParallel.ts script to Cloud Storage
resource "google_storage_bucket_object" "sync_script" {
  name   = "syncBillsParallel.ts"
  bucket = google_storage_bucket.scripts_bucket.name
  source = "${path.module}/../../src/scripts/syncBillsParallel.ts"
}

# Upload loadEnv.ts to bucket
resource "google_storage_bucket_object" "load_env_script" {
  name   = "loadEnv.ts"
  source = "${path.module}/../../src/scripts/loadEnv.ts"
  bucket = google_storage_bucket.scripts_bucket.name
}

# Upload custom tsconfig.cloud.json to bucket
resource "google_storage_bucket_object" "tsconfig_cloud_json" {
  name   = "tsconfig.json"
  source = "${path.module}/tsconfig.cloud.json"
  bucket = google_storage_bucket.scripts_bucket.name
}

# Use existing service account for the sync job
data "google_service_account" "sync_service_account" {
  account_id = "bills-sync-${var.environment}"
}

# Grant storage object viewer role to the service account
resource "google_project_iam_binding" "storage_viewer" {
  project = var.project_id
  role    = "roles/storage.objectViewer"
  
  members = [
    "serviceAccount:${data.google_service_account.sync_service_account.email}",
  ]
}

# Grant storage object creator role to the service account
resource "google_project_iam_binding" "storage_creator" {
  project = var.project_id
  role    = "roles/storage.objectCreator"
  
  members = [
    "serviceAccount:${data.google_service_account.sync_service_account.email}",
  ]
}

# Add compute instance admin role for the service account
resource "google_project_iam_binding" "compute_admin" {
  project = var.project_id
  role    = "roles/compute.admin"
  
  members = [
    "serviceAccount:${data.google_service_account.sync_service_account.email}",
  ]
}

# Add service account user role
resource "google_project_iam_binding" "service_account_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  
  members = [
    "serviceAccount:${data.google_service_account.sync_service_account.email}",
  ]
}

# Create an instance template for the sync VM
resource "google_compute_instance_template" "sync_instance_template" {
  name        = "bills-sync-${var.environment}-template"
  description = "Template for bills sync VM instances"
  
  machine_type = "e2-standard-2"
  
  disk {
    source_image = "debian-cloud/debian-11"
    boot         = true
    auto_delete  = true
    disk_size_gb = 20
  }
  
  network_interface {
    network = "default"
    access_config {}
  }
  
  service_account {
    email  = data.google_service_account.sync_service_account.email
    scopes = ["cloud-platform"]
  }
  
  metadata = {
    source_supabase_url = var.source_supabase_url
    source_supabase_key = var.source_supabase_key
    congress_api_key    = var.congress_api_key
    environment         = var.environment
  }
  
  metadata_startup_script = templatefile("${path.module}/startup-script.sh", {
    bucket_name = google_storage_bucket.scripts_bucket.name
    source_supabase_url = var.source_supabase_url
    source_supabase_key = var.source_supabase_key
    congress_api_key = var.congress_api_key
    environment = var.environment
  })
}

# Create a Cloud Scheduler job to trigger the sync
resource "google_cloud_scheduler_job" "bills_sync_job" {
  name             = "bills-sync-${var.environment}-job"
  description      = "Triggers bills sync job every day"
  schedule         = var.schedule
  time_zone        = "UTC"
  attempt_deadline = "320s"
  region           = var.region

  http_target {
    http_method = "POST"
    uri         = "https://compute.googleapis.com/compute/v1/projects/${var.project_id}/zones/${var.zone}/instances?sourceInstanceTemplate=projects/${var.project_id}/global/instanceTemplates/bills-sync-${var.environment}-template"
    
    oauth_token {
      service_account_email = data.google_service_account.sync_service_account.email
    }
    
    body = base64encode(jsonencode({
      name = "bills-sync-${var.environment}-${formatdate("YYYYMMDDhhmmss", timestamp())}"
    }))
  }
} 