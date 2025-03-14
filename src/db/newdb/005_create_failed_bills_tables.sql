-- Create failed_bills table
CREATE TABLE IF NOT EXISTS failed_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    congress VARCHAR NOT NULL,
    bill_type VARCHAR NOT NULL,
    bill_number VARCHAR NOT NULL,
    title TEXT,
    error_message TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    last_retry TIMESTAMP WITH TIME ZONE,
    status VARCHAR NOT NULL DEFAULT 'failed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE(congress, bill_type, bill_number)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS failed_bills_retry_count_idx ON failed_bills(retry_count);
CREATE INDEX IF NOT EXISTS failed_bills_last_retry_idx ON failed_bills(last_retry);
CREATE INDEX IF NOT EXISTS failed_bills_status_idx ON failed_bills(status);

-- Add RLS (Row Level Security) policies
ALTER TABLE failed_bills ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access to failed_bills" ON failed_bills;
DROP POLICY IF EXISTS "Allow service role to insert failed_bills" ON failed_bills;
DROP POLICY IF EXISTS "Allow service role to update failed_bills" ON failed_bills;
DROP POLICY IF EXISTS "Allow service role to delete failed_bills" ON failed_bills;

-- Create policies for public read access
CREATE POLICY "Allow public read access to failed_bills"
    ON failed_bills FOR SELECT
    USING (true);

-- Create policies for service role write access
CREATE POLICY "Allow service role to insert failed_bills"
    ON failed_bills FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "Allow service role to update failed_bills"
    ON failed_bills FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow service role to delete failed_bills"
    ON failed_bills FOR DELETE
    TO service_role
    USING (true);

-- Grant necessary permissions to service_role
GRANT ALL ON failed_bills TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;

-- Add trigger for updated_at
CREATE TRIGGER update_failed_bills_updated_at
    BEFORE UPDATE ON failed_bills
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 