-- Create the bill_status ENUM type
CREATE TYPE bill_status AS ENUM (
  'introduced',
  'referred_to_committee',
  'reported_by_committee',
  'passed_chamber',
  'passed_both_chambers',
  'presented_to_president',
  'signed_into_law',
  'vetoed',
  'veto_overridden',
  'failed'
);

-- Create the text_source ENUM type
CREATE TYPE text_source_type AS ENUM ('api', 'pdf');

-- Create the bills table with ENUM status
CREATE TABLE IF NOT EXISTS bills (
    id UUID PRIMARY KEY,
    bill_number VARCHAR NOT NULL,
    congress VARCHAR NOT NULL,
    title TEXT NOT NULL,
    introduction_date TIMESTAMP WITH TIME ZONE,
    key_points TEXT[] DEFAULT '{}',
    analysis TEXT,
    status bill_status NOT NULL DEFAULT 'introduced',
    analysis_status VARCHAR NOT NULL DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'completed', 'failed')),
    sponsors TEXT[] DEFAULT '{}',
    committee TEXT,
    full_text TEXT,
    has_full_text BOOLEAN DEFAULT FALSE,
    text_source text_source_type NULL,
    related_bills JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    -- New fields
    bill_type VARCHAR,
    origin_chamber VARCHAR,
    origin_chamber_code VARCHAR,
    latest_action_date TIMESTAMP WITH TIME ZONE,
    latest_action_text TEXT,
    constitutional_authority_text TEXT,
    policy_area VARCHAR,
    subjects TEXT[] DEFAULT '{}',
    summary TEXT,
    cbo_cost_estimates JSONB DEFAULT '[]',
    laws JSONB DEFAULT '[]',
    committees_count INTEGER DEFAULT 0,
    cosponsors_count INTEGER DEFAULT 0,
    withdrawn_cosponsors_count INTEGER DEFAULT 0,
    actions_count INTEGER DEFAULT 0,
    update_date TIMESTAMP WITH TIME ZONE,
    update_date_including_text TIMESTAMP WITH TIME ZONE,
    pdf_url TEXT -- Add PDF URL field
);

COMMENT ON COLUMN bills.status IS 'Current status of the bill in the legislative process: introduced, referred_to_committee, reported_by_committee, passed_chamber, passed_both_chambers, presented_to_president, signed_into_law, vetoed, veto_overridden, failed';

-- Create the bill_status_history table
CREATE TABLE IF NOT EXISTS bill_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    status bill_status NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    action_text TEXT, -- Optional: store the triggering action from Congress API
    CONSTRAINT fk_bill_id FOREIGN KEY (bill_id) REFERENCES bills(id)
);

-- Create the bill_pdfs table
CREATE TABLE IF NOT EXISTS bill_pdfs (
    id UUID PRIMARY KEY REFERENCES bills(id) ON DELETE CASCADE,
    pdf_data BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Create stored procedures for getting counts
CREATE OR REPLACE FUNCTION get_status_counts()
RETURNS TABLE (status TEXT, count BIGINT) 
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT b.status::TEXT, COUNT(*)::BIGINT
  FROM bills b
  GROUP BY b.status
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_policy_area_counts()
RETURNS TABLE (policy_area TEXT, count BIGINT)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT b.policy_area::TEXT, COUNT(*)::BIGINT
  FROM bills b
  WHERE b.policy_area IS NOT NULL
  GROUP BY b.policy_area
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to automate 'failed' status updates
CREATE OR REPLACE FUNCTION update_failed_bills(target_congress VARCHAR)
RETURNS VOID AS $$
BEGIN
  -- Update bills to 'failed' if they haven't reached a terminal state by the session end
  UPDATE bills
  SET status = 'failed',
      updated_at = timezone('utc', now())
  WHERE congress = target_congress
    AND status NOT IN ('signed_into_law', 'vetoed', 'veto_overridden')
    AND (latest_action_date < (
      CASE target_congress
        WHEN '119' THEN '2027-01-03'::date -- Adjust for each Congress
        ELSE '2027-01-03'::date -- Default; update as needed
      END
    ) OR latest_action_date IS NULL);
END;
$$ LANGUAGE plpgsql;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_congress ON bills(congress);
CREATE INDEX IF NOT EXISTS idx_bills_bill_number ON bills(bill_number);
CREATE INDEX IF NOT EXISTS idx_bills_introduction_date ON bills(introduction_date);
CREATE INDEX IF NOT EXISTS idx_bill_status_history_bill_id ON bill_status_history(bill_id);
CREATE INDEX IF NOT EXISTS bills_bill_number_congress_idx ON bills(bill_number, congress);
CREATE INDEX IF NOT EXISTS bills_status_idx ON bills(status);
CREATE INDEX IF NOT EXISTS bills_introduction_date_idx ON bills(introduction_date);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update the updated_at column
CREATE TRIGGER update_bills_updated_at
    BEFORE UPDATE ON bills
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bill_pdfs_updated_at
    BEFORE UPDATE ON bill_pdfs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS (Row Level Security) policies
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_pdfs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_status_history ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Allow public read access to bills"
    ON bills FOR SELECT
    USING (true);

CREATE POLICY "Allow public read access to bill_pdfs"
    ON bill_pdfs FOR SELECT
    USING (true);

CREATE POLICY "Allow public read access to bill_status_history"
    ON bill_status_history FOR SELECT
    USING (true);

-- Create policies for service role write access
CREATE POLICY "Allow service role to insert bills"
    ON bills FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "Allow service role to update bills"
    ON bills FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow service role to insert bill_pdfs"
    ON bill_pdfs FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "Allow service role to update bill_pdfs"
    ON bill_pdfs FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow service role to insert bill_status_history"
    ON bill_status_history FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "Allow service role to update bill_status_history"
    ON bill_status_history FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create a new storage bucket for bill PDFs if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'bill_pdfs'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('bill_pdfs', 'bill_pdfs', true);
  END IF;
END $$;

-- Set up storage policy to allow authenticated users to upload PDFs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allow authenticated users to upload PDFs'
  ) THEN
    CREATE POLICY "Allow authenticated users to upload PDFs"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'bill_pdfs' 
      AND (storage.extension(name) = 'pdf')
    );
  END IF;
END $$;

-- Set up storage policy to allow public to read PDFs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allow public to read PDFs'
  ) THEN
    CREATE POLICY "Allow public to read PDFs"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'bill_pdfs');
  END IF;
END $$;