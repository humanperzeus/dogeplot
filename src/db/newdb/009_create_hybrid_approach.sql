-- Create table for semantic search results
CREATE TABLE IF NOT EXISTS semantic_search_results (
  job_id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  results JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for semantic search cache
CREATE TABLE IF NOT EXISTS semantic_search_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  threshold FLOAT NOT NULL,
  results JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for PDF proxy results
CREATE TABLE IF NOT EXISTS pdf_proxy_results (
  job_id TEXT PRIMARY KEY,
  pdf_url TEXT NOT NULL,
  content_type TEXT,
  content_length INTEGER,
  cached BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_search_cache_query_threshold 
ON semantic_search_cache (query, threshold);