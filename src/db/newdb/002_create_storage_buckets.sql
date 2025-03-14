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