-- Create a table for caching statistics and other frequently accessed data
CREATE TABLE IF NOT EXISTS cached_statistics (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_cached_statistics_expires_at ON cached_statistics(expires_at);
CREATE INDEX IF NOT EXISTS idx_cached_statistics_id ON cached_statistics(id);

-- Add comment for documentation
COMMENT ON TABLE cached_statistics IS 'Stores cached application statistics to reduce database load';

-- Grant appropriate permissions - updated to allow full CRUD operations for anon users
GRANT SELECT, INSERT, UPDATE, DELETE ON cached_statistics TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON cached_statistics TO authenticated;
GRANT ALL ON cached_statistics TO service_role;

-- Enable Row Level Security
ALTER TABLE cached_statistics ENABLE ROW LEVEL SECURITY;

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

-- Create a function to automatically update the last_updated timestamp
CREATE OR REPLACE FUNCTION update_cached_statistics_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = timezone('utc', now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to call the function
DROP TRIGGER IF EXISTS update_cached_statistics_timestamp ON cached_statistics;
CREATE TRIGGER update_cached_statistics_timestamp
    BEFORE UPDATE ON cached_statistics
    FOR EACH ROW
    EXECUTE FUNCTION update_cached_statistics_timestamp(); 