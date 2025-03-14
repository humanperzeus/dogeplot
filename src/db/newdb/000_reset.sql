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