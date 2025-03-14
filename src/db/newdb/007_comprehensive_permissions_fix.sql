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