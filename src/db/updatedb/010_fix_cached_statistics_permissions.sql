-- This file fixes permissions for the cached_statistics table in existing installations
-- It ensures that anon and authenticated users have proper CRUD permissions
-- to avoid the permission denied errors

-- Make sure the table exists (should already exist in production)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'cached_statistics'
  ) THEN
    CREATE TABLE cached_statistics (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      last_updated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
    );

    -- Add indexes for faster lookups
    CREATE INDEX idx_cached_statistics_expires_at ON cached_statistics(expires_at);
    CREATE INDEX idx_cached_statistics_id ON cached_statistics(id);
    
    -- Add comment for documentation
    COMMENT ON TABLE cached_statistics IS 'Stores cached application statistics to reduce database load';
  END IF;
END
$$;

-- Update table structure if needed (add created_at if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cached_statistics' 
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE cached_statistics ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now());
  END IF;
END
$$;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow anon select on cached_statistics" ON cached_statistics;
DROP POLICY IF EXISTS "Allow anon full access to cached_statistics" ON cached_statistics;
DROP POLICY IF EXISTS "Allow authenticated full access to cached_statistics" ON cached_statistics;

-- Make sure RLS is enabled
ALTER TABLE cached_statistics ENABLE ROW LEVEL SECURITY;

-- Grant appropriate permissions - full CRUD for anon and authenticated
-- This fixes the "permission denied" errors
GRANT SELECT, INSERT, UPDATE, DELETE ON cached_statistics TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON cached_statistics TO authenticated;
GRANT ALL ON cached_statistics TO service_role;

-- Create policies to allow anon users to perform all operations
CREATE POLICY "Allow anon full access to cached_statistics" 
  ON cached_statistics 
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Create policies to allow authenticated users to perform all operations
CREATE POLICY "Allow authenticated full access to cached_statistics" 
  ON cached_statistics 
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create or replace the timestamp update function
CREATE OR REPLACE FUNCTION update_cached_statistics_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = timezone('utc', now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to call the function (if not exists)
DROP TRIGGER IF EXISTS update_cached_statistics_timestamp ON cached_statistics;
CREATE TRIGGER update_cached_statistics_timestamp
    BEFORE UPDATE ON cached_statistics
    FOR EACH ROW
    EXECUTE FUNCTION update_cached_statistics_timestamp(); 