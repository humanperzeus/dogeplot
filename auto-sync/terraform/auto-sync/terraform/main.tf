terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
  backend "gcs" {
    bucket = "dogeplotfun-terraform-state"
    prefix = "bill-sync"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

locals {
  environment = terraform.workspace
  instance_name_prefix = "bills-sync-${local.environment}"
  bucket_name = "${var.project_id}-sync-scripts-${local.environment}"
  
  startup_script = templatefile("startup-script.sh", {
    bucket_name = local.bucket_name
    supabase_url = var.supabase_url
    supabase_key = var.supabase_key
    environment = local.environment
  })
}

# Cloud Storage bucket for sync script
resource "google_storage_bucket" "sync_scripts" {
  name          = "${var.project_id}-sync-scripts-${terraform.workspace}"
  location      = var.region
  force_destroy = true
  versioning {
    enabled = true
  }
}

# Upload sync script to bucket
resource "google_storage_bucket_object" "sync_script" {
  name   = "syncBillsParallel.ts"
  source = "${path.root}/../../src/scripts/syncBillsParallel.ts"
  bucket = google_storage_bucket.sync_scripts.name
}

# Upload package.json to bucket
resource "google_storage_bucket_object" "package_json" {
  name   = "package.json"
  source = "${path.root}/../../package.json"
  bucket = google_storage_bucket.sync_scripts.name
}

# Upload tsconfig.json to bucket
resource "google_storage_bucket_object" "tsconfig_json" {
  name   = "tsconfig.json"
  source = "${path.root}/../../tsconfig.json"
  bucket = google_storage_bucket.sync_scripts.name
}

# Service account for the GCE instance
resource "google_service_account" "bills_sync" {
  account_id   = "bills-sync-sa-${terraform.workspace}"
  display_name = "Bills Sync Service Account ${title(terraform.workspace)}"
}

# IAM binding for the service account
resource "google_project_iam_binding" "storage_viewer" {
  project = var.project_id
  role    = "roles/storage.objectViewer"
  members = [
    "serviceAccount:${google_service_account.bills_sync.email}"
  ]
}

# GCE instance template
resource "google_compute_instance_template" "bills_sync" {
  name_prefix  = "bills-sync-${terraform.workspace}-template-"
  machine_type = "e2-standard-2"
  region       = var.region

  disk {
    source_image = "debian-cloud/debian-11"
    auto_delete  = true
    boot         = true
    disk_size_gb = 20
  }

  network_interface {
    network = "default"
    access_config {}
  }

  service_account {
    email  = google_service_account.bills_sync.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    startup-script = local.startup_script
    ENVIRONMENT = terraform.workspace
    SOURCE_SUPABASE_URL  = var.source_supabase_url
    SOURCE_SUPABASE_KEY  = var.source_supabase_key
    TARGET_SUPABASE_URL  = var.target_supabase_url
    TARGET_SUPABASE_KEY  = var.target_supabase_key
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Cloud Scheduler job
resource "google_cloud_scheduler_job" "bills_sync" {
  name             = "bills-sync-${terraform.workspace}-daily"
  description      = "Trigger bills sync job daily"
  schedule         = "0 0 * * *"
  time_zone        = "UTC"
  attempt_deadline = "320s"

  http_target {
    http_method = "POST"
    uri         = "https://compute.googleapis.com/compute/v1/projects/${var.project_id}/zones/${var.zone}/instances"
    oauth_token {
      service_account_email = google_service_account.bills_sync.email
    }

    body = base64encode(jsonencode({
      name = "bills-sync-${terraform.workspace}-${formatdate("YYYYMMDDhhmmss", timestamp())}"
      sourceInstanceTemplate = google_compute_instance_template.bills_sync.self_link
    }))
  }
} 