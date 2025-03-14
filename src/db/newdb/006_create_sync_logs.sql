-- Run this in your Supabase SQL editor
-- Create sync_logs table
CREATE TABLE IF NOT EXISTS public.sync_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    success BOOLEAN NOT NULL,
    duration_ms INTEGER NOT NULL,
    environment TEXT NOT NULL,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_sync_logs_timestamp ON public.sync_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_sync_logs_environment ON public.sync_logs(environment);

-- Add RLS policies
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Allow insert from service role
CREATE POLICY "Allow service role to insert sync logs"
ON public.sync_logs FOR INSERT
TO service_role
WITH CHECK (true);

-- Allow read access to authenticated users
CREATE POLICY "Allow authenticated users to view sync logs"
ON public.sync_logs FOR SELECT
TO authenticated
USING (true);