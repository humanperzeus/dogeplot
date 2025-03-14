-- Drop existing policies if they exist
DO $$ 
BEGIN
    -- Drop storage policies if they exist
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects') THEN
        DROP POLICY IF EXISTS "Allow authenticated users to upload PDFs" ON storage.objects;
        DROP POLICY IF EXISTS "Allow public to read PDFs" ON storage.objects;
    END IF;

    -- Delete all objects in the bill_pdfs bucket
    DELETE FROM storage.objects WHERE bucket_id = 'bill_pdfs';
    
    -- Delete the bill_pdfs bucket
    DELETE FROM storage.buckets WHERE id = 'bill_pdfs';

    -- Drop policies if they exist
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bills') THEN
        DROP POLICY IF EXISTS "Allow public read access to bills" ON bills;
        DROP POLICY IF EXISTS "Allow public read access to bill_pdfs" ON bill_pdfs;
        DROP POLICY IF EXISTS "Allow service role to insert bills" ON bills;
        DROP POLICY IF EXISTS "Allow service role to update bills" ON bills;
        DROP POLICY IF EXISTS "Allow service role to insert bill_pdfs" ON bill_pdfs;
        DROP POLICY IF EXISTS "Allow service role to update bill_pdfs" ON bill_pdfs;
    END IF;

    -- Drop bill_actions policies if they exist
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bill_actions') THEN
        DROP POLICY IF EXISTS "Allow public read access to bill_actions" ON bill_actions;
        DROP POLICY IF EXISTS "Allow service role to insert bill_actions" ON bill_actions;
        DROP POLICY IF EXISTS "Allow service role to update bill_actions" ON bill_actions;
    END IF;

    -- Drop triggers if they exist
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_bills_updated_at') THEN
        DROP TRIGGER IF EXISTS update_bills_updated_at ON bills;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_bill_pdfs_updated_at') THEN
        DROP TRIGGER IF EXISTS update_bill_pdfs_updated_at ON bill_pdfs;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ai_models_updated_at') THEN
        DROP TRIGGER IF EXISTS update_ai_models_updated_at ON ai_models;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ai_prompts_updated_at') THEN
        DROP TRIGGER IF EXISTS update_ai_prompts_updated_at ON ai_prompts;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_bill_analyses_updated_at') THEN
        DROP TRIGGER IF EXISTS update_bill_analyses_updated_at ON bill_analyses;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_bill_actions_updated_at') THEN
        DROP TRIGGER IF EXISTS update_bill_actions_updated_at ON bill_actions;
    END IF;

    -- Drop tables if they exist
    DROP TABLE IF EXISTS bill_analyses CASCADE;
    DROP TABLE IF EXISTS ai_prompts CASCADE;
    DROP TABLE IF EXISTS ai_models CASCADE;
    DROP TABLE IF EXISTS bill_pdfs CASCADE;
    DROP TABLE IF EXISTS bill_actions CASCADE;
    DROP TABLE IF EXISTS bills CASCADE;
    DROP TABLE IF EXISTS bill_status_history CASCADE;

    -- Drop function if it exists
    DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

    -- Drop indexes if they exist
    DROP INDEX IF EXISTS idx_bills_status;
    DROP INDEX IF EXISTS idx_bills_congress;
    DROP INDEX IF EXISTS idx_bills_bill_number;
    DROP INDEX IF EXISTS idx_bills_introduction_date;
    DROP INDEX IF EXISTS idx_bill_actions_bill_id;
    DROP INDEX IF EXISTS idx_bill_actions_action_date;

    -- Drop types if they exist
    DROP TYPE IF EXISTS bill_status CASCADE;
    DROP TYPE IF EXISTS text_source_type CASCADE;

    -- Reset sequences
    DO $inner$ 
    DECLARE 
        r RECORD;
    BEGIN
        FOR r IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'public') LOOP
            EXECUTE 'DROP SEQUENCE IF EXISTS ' || r.sequencename || ' CASCADE';
        END LOOP;
    END $inner$;
END $$; 

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

-- Create AI model configuration table
CREATE TABLE IF NOT EXISTS ai_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR NOT NULL,
    provider VARCHAR NOT NULL DEFAULT 'openrouter',
    model_id VARCHAR NOT NULL,
    is_active BOOLEAN DEFAULT false,
    cost_per_1k_tokens DECIMAL(10,6),
    max_tokens INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Create prompts table
CREATE TABLE IF NOT EXISTS ai_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR NOT NULL,
    system_prompt TEXT NOT NULL,
    user_prompt TEXT NOT NULL,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Create bill analysis table
CREATE TABLE IF NOT EXISTS bill_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
    model_id UUID REFERENCES ai_models(id),
    prompt_id UUID REFERENCES ai_prompts(id),
    raw_response TEXT,
    processed_response JSONB,
    tokens INTEGER,
    cost DECIMAL(10,6),
    processing_duration DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Add triggers for updated_at
CREATE TRIGGER update_ai_models_updated_at
    BEFORE UPDATE ON ai_models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_prompts_updated_at
    BEFORE UPDATE ON ai_prompts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bill_analyses_updated_at
    BEFORE UPDATE ON bill_analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_analyses ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY "Enable full access for service role on ai_models"
ON ai_models FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Enable full access for service role on ai_prompts"
ON ai_prompts FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Enable full access for service role on bill_analyses"
ON bill_analyses FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Read access for authenticated users
CREATE POLICY "Enable read access for authenticated users on ai_models"
ON ai_models FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Enable read access for authenticated users on ai_prompts"
ON ai_prompts FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Enable read access for authenticated users on bill_analyses"
ON bill_analyses FOR SELECT
TO authenticated
USING (true);

-- Grant permissions
GRANT ALL ON ai_models TO service_role;
GRANT ALL ON ai_prompts TO service_role;
GRANT ALL ON bill_analyses TO service_role;
GRANT SELECT ON ai_models TO authenticated;
GRANT SELECT ON ai_prompts TO authenticated;
GRANT SELECT ON bill_analyses TO authenticated; 

-- Create the bill_actions table
CREATE TABLE IF NOT EXISTS bill_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    action_text TEXT NOT NULL,
    action_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    CONSTRAINT fk_bill_id FOREIGN KEY (bill_id) REFERENCES bills(id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bill_actions_bill_id ON bill_actions(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_actions_action_date ON bill_actions(action_date);

-- Add RLS (Row Level Security) policies
ALTER TABLE bill_actions ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Allow public read access to bill_actions"
    ON bill_actions FOR SELECT
    USING (true);

-- Create policies for service role write access
CREATE POLICY "Allow service role to insert bill_actions"
    ON bill_actions FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "Allow service role to update bill_actions"
    ON bill_actions FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_bill_actions_updated_at
    BEFORE UPDATE ON bill_actions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 

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

-- Drop existing function first
DROP FUNCTION IF EXISTS exec_sql(text);

-- Create a function to execute arbitrary SQL
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$; 

-- Comprehensive permissions fix for all roles and tables

-- Step 1: Temporarily disable RLS on all tables
ALTER TABLE IF EXISTS bills DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bill_status_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS failed_bills DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bill_pdfs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_analysis DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_analysis_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS storage.buckets DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS storage.objects DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop all existing policies to ensure clean state
DO $$
BEGIN
    -- Drop policies for regular tables
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bills') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Enable full access for service role on bills" ON bills';
        EXECUTE 'DROP POLICY IF EXISTS "Enable read access for authenticated users on bills" ON bills';
        EXECUTE 'DROP POLICY IF EXISTS "Enable read access for all users on bills" ON bills';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bill_status_history') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Enable full access for service role on bill_status_history" ON bill_status_history';
        EXECUTE 'DROP POLICY IF EXISTS "Enable read access for authenticated users on bill_status_history" ON bill_status_history';
        EXECUTE 'DROP POLICY IF EXISTS "Enable read access for all users on bill_status_history" ON bill_status_history';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'failed_bills') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Enable full access for service role on failed_bills" ON failed_bills';
        EXECUTE 'DROP POLICY IF EXISTS "Enable read access for all users on failed_bills" ON failed_bills';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bill_pdfs') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Enable full access for service role on bill_pdfs" ON bill_pdfs';
        EXECUTE 'DROP POLICY IF EXISTS "Enable read access for all users on bill_pdfs" ON bill_pdfs';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_analysis') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Enable full access for service role on ai_analysis" ON ai_analysis';
        EXECUTE 'DROP POLICY IF EXISTS "Enable read access for all users on ai_analysis" ON ai_analysis';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_analysis_history') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Enable full access for service role on ai_analysis_history" ON ai_analysis_history';
        EXECUTE 'DROP POLICY IF EXISTS "Enable read access for all users on ai_analysis_history" ON ai_analysis_history';
    END IF;

    -- Drop policies for storage tables
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Enable read access for all users on storage.objects" ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "Enable full access for service role on storage.objects" ON storage.objects';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Enable read access for all users on storage.buckets" ON storage.buckets';
        EXECUTE 'DROP POLICY IF EXISTS "Enable full access for service role on storage.buckets" ON storage.buckets';
    END IF;
END $$;

-- Step 3: Revoke all existing permissions to ensure clean state
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON SCHEMA public FROM anon;
REVOKE ALL ON SCHEMA storage FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA storage FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA storage FROM authenticated;

-- Step 4: Create new policies for service_role (full access) - only for existing tables
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bills') THEN
        EXECUTE 'CREATE POLICY "Enable full access for service role on bills" ON bills FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bill_status_history') THEN
        EXECUTE 'CREATE POLICY "Enable full access for service role on bill_status_history" ON bill_status_history FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'failed_bills') THEN
        EXECUTE 'CREATE POLICY "Enable full access for service role on failed_bills" ON failed_bills FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bill_pdfs') THEN
        EXECUTE 'CREATE POLICY "Enable full access for service role on bill_pdfs" ON bill_pdfs FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_analysis') THEN
        EXECUTE 'CREATE POLICY "Enable full access for service role on ai_analysis" ON ai_analysis FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_analysis_history') THEN
        EXECUTE 'CREATE POLICY "Enable full access for service role on ai_analysis_history" ON ai_analysis_history FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;

-- Step 5: Create policies for public access - only for existing tables
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bills') THEN
        EXECUTE 'CREATE POLICY "Enable read access for all users on bills" ON bills FOR SELECT TO public USING (true)';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bill_status_history') THEN
        EXECUTE 'CREATE POLICY "Enable read access for all users on bill_status_history" ON bill_status_history FOR SELECT TO public USING (true)';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'failed_bills') THEN
        EXECUTE 'CREATE POLICY "Enable read access for all users on failed_bills" ON failed_bills FOR SELECT TO public USING (true)';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bill_pdfs') THEN
        EXECUTE 'CREATE POLICY "Enable read access for all users on bill_pdfs" ON bill_pdfs FOR SELECT TO public USING (true)';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_analysis') THEN
        EXECUTE 'CREATE POLICY "Enable read access for all users on ai_analysis" ON ai_analysis FOR SELECT TO public USING (true)';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_analysis_history') THEN
        EXECUTE 'CREATE POLICY "Enable read access for all users on ai_analysis_history" ON ai_analysis_history FOR SELECT TO public USING (true)';
    END IF;
END $$;

-- Storage bucket policies - only if storage tables exist
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
        EXECUTE 'CREATE POLICY "Enable read access for all users on storage.objects" ON storage.objects FOR SELECT TO public USING (true)';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
        EXECUTE 'CREATE POLICY "Enable read access for all users on storage.buckets" ON storage.buckets FOR SELECT TO public USING (true)';
    END IF;
END $$;

-- Step 6: Grant schema permissions first (needed for table operations)
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA storage TO service_role;

-- Step 7: Grant table permissions (these will only affect existing tables)
-- For anon role (public read access)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- For authenticated role
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA storage TO authenticated;

-- For service_role (full access)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role;

-- Step 8: Grant storage permissions (only if tables exist)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
        EXECUTE 'GRANT SELECT ON storage.objects TO anon';
        EXECUTE 'GRANT SELECT ON storage.objects TO authenticated';
        EXECUTE 'GRANT ALL ON storage.objects TO service_role';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
        EXECUTE 'GRANT SELECT ON storage.buckets TO anon';
        EXECUTE 'GRANT SELECT ON storage.buckets TO authenticated';
        EXECUTE 'GRANT ALL ON storage.buckets TO service_role';
    END IF;
END $$;

-- Step 9: Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage 
    GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage 
    GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage 
    GRANT ALL ON TABLES TO service_role;

-- Step 10: Re-enable RLS on all tables that exist
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bills') THEN
        EXECUTE 'ALTER TABLE bills ENABLE ROW LEVEL SECURITY';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bill_status_history') THEN
        EXECUTE 'ALTER TABLE bill_status_history ENABLE ROW LEVEL SECURITY';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'failed_bills') THEN
        EXECUTE 'ALTER TABLE failed_bills ENABLE ROW LEVEL SECURITY';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bill_pdfs') THEN
        EXECUTE 'ALTER TABLE bill_pdfs ENABLE ROW LEVEL SECURITY';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_analysis') THEN
        EXECUTE 'ALTER TABLE ai_analysis ENABLE ROW LEVEL SECURITY';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_analysis_history') THEN
        EXECUTE 'ALTER TABLE ai_analysis_history ENABLE ROW LEVEL SECURITY';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
        EXECUTE 'ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY';
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
        EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
    END IF;
END $$; 