// config.ts - Environment configuration for services

// Processor type: 'google-cloud' or 'inngest'
export const PROCESSOR_TYPE = process.env.DISABLE_HYBRID === 'true' 
  ? 'legacy' 
  : (process.env.PROCESSOR_TYPE || 'google-cloud');

// API Keys and credentials
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
export const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

// Service-specific settings
export const PDF_CACHE_DURATION = parseInt(process.env.PDF_CACHE_DURATION || '3600'); // 1 hour in seconds
export const SEMANTIC_SEARCH_CACHE_DURATION = parseInt(process.env.SEMANTIC_SEARCH_CACHE_DURATION || '86400'); // 24 hours in seconds

// Rate limiting
export const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS || '50');
export const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000'); // 30 seconds

// Storage settings for Inngest-based approach
export const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'bill-tracker-cache';

// Function to validate required configuration
export function validateConfig() {
  const missing = [];
  
  if (!OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_KEY) missing.push('SUPABASE_KEY');
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Log current processor type
  console.log(`🔧 Using processor type: ${PROCESSOR_TYPE}`);
}

// Helper to determine if we're using Inngest
export function isUsingInngest() {
  return PROCESSOR_TYPE === 'inngest';
}

// Helper to determine if we're using Google Cloud
export function isUsingGoogleCloud() {
  return PROCESSOR_TYPE === 'google-cloud';
} 