variable "project_id" {
  description = "The ID of the Google Cloud project"
  type        = string
}

variable "region" {
  description = "The region where resources will be created"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "The zone where the VM instance will be created"
  type        = string
  default     = "us-central1-a"
}

variable "environment" {
  description = "Environment (staging or production)"
  type        = string
  default     = "staging"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be either 'staging' or 'production'."
  }
}

variable "source_supabase_url" {
  description = "URL for the source Supabase instance"
  type        = string
  sensitive   = true
}

variable "source_supabase_key" {
  description = "Service role key for the source Supabase instance"
  type        = string
  sensitive   = true
}

variable "congress_api_key" {
  description = "API key for the Congress.gov API"
  type        = string
  sensitive   = true
}

variable "schedule" {
  description = "Cron schedule for the sync job (default: midnight UTC every day)"
  type        = string
  default     = "0 0 * * *"
  validation {
    condition     = can(regex("^[0-9*,-/]+ [0-9*,-/]+ [0-9*,-/]+ [0-9*,-/]+ [0-9*,-/]+$", var.schedule))
    error_message = "Schedule must be a valid cron expression."
  }
} 