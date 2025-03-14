-- Enable vector extension for embedding functionality
-- (Requires Supabase Vector extension enabled on the project)
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop existing table and functions if they exist
DROP FUNCTION IF EXISTS find_similar_bills(uuid,integer,double precision,character varying,integer);
DROP FUNCTION IF EXISTS search_bills_by_embedding(vector,double precision,integer,character varying,integer);
DROP FUNCTION IF EXISTS search_bills_by_embedding(vector(1536), float, int);
DROP FUNCTION IF EXISTS find_similar_bills(UUID, int, float);
DROP FUNCTION IF EXISTS get_embedding_stats();
DROP TABLE IF EXISTS bill_embeddings;

-- Create improved bill embeddings table with vector type and configurable parameters
CREATE TABLE bill_embeddings (
    id UUID PRIMARY KEY REFERENCES bills(id) ON DELETE CASCADE,
    embedding vector(1536),
    query_embedding vector(1536), -- Store the query that was used to find this bill (optional)
    similarity_threshold FLOAT DEFAULT 0.7, -- Default similarity threshold 
    match_count INTEGER DEFAULT 5, -- Default number of results to return
    embedding_model VARCHAR NOT NULL,
    embedding_version INTEGER NOT NULL DEFAULT 1,
    text_processed TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Create optimized index for vector similarity search
-- Using IVFFLAT index which is good for larger datasets
CREATE INDEX bill_embeddings_embedding_idx 
    ON bill_embeddings 
    USING ivfflat (embedding vector_cosine_ops) 
    WITH (lists = 100);

-- Add index for query_embedding if used
CREATE INDEX bill_embeddings_query_embedding_idx 
    ON bill_embeddings 
    USING ivfflat (query_embedding vector_cosine_ops) 
    WITH (lists = 100);

-- Create improved semantic search function for finding similar bills
-- Now using default parameters from the table if not provided
CREATE OR REPLACE FUNCTION search_bills_by_embedding(
    input_embedding vector(1536),
    input_match_threshold float DEFAULT 0.7,
    input_match_count int DEFAULT 5,
    input_model_filter varchar DEFAULT NULL,
    input_version_filter int DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    bill_number VARCHAR,
    congress VARCHAR,
    title TEXT,
    similarity float,
    embedding_model VARCHAR,
    embedding_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id,
        b.bill_number,
        b.congress,
        b.title,
        1 - (be.embedding <=> input_embedding) as similarity,
        be.embedding_model,
        be.embedding_version
    FROM
        bill_embeddings be
    JOIN
        bills b ON b.id = be.id
    WHERE
        1 - (be.embedding <=> input_embedding) > input_match_threshold
        AND (input_model_filter IS NULL OR be.embedding_model = input_model_filter)
        AND (input_version_filter IS NULL OR be.embedding_version = input_version_filter)
    ORDER BY
        similarity DESC
    LIMIT input_match_count;
END;
$$;

-- Create an improved function for finding the most similar bill to a given bill
-- Uses table defaults if parameters not provided
CREATE OR REPLACE FUNCTION find_similar_bills(
    input_bill_id UUID,
    input_match_count int DEFAULT NULL,
    input_match_threshold float DEFAULT NULL,
    input_model_filter varchar DEFAULT NULL,
    input_version_filter int DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    bill_number VARCHAR,
    congress VARCHAR,
    title TEXT,
    similarity float,
    embedding_model VARCHAR,
    embedding_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    source_threshold float;
    source_count int;
    source_model varchar;
    source_version int;
BEGIN
    -- Get the parameters from the source bill if not provided
    SELECT 
        COALESCE(be.similarity_threshold, 0.7),
        COALESCE(be.match_count, 5),
        be.embedding_model,
        be.embedding_version
    INTO 
        source_threshold, 
        source_count,
        source_model,
        source_version
    FROM 
        bill_embeddings be 
    WHERE 
        be.id = input_bill_id;

    RETURN QUERY
    SELECT
        search_result.id,
        search_result.bill_number,
        search_result.congress,
        search_result.title,
        search_result.similarity,
        search_result.embedding_model,
        search_result.embedding_version
    FROM
        bill_embeddings be
    CROSS JOIN LATERAL
        search_bills_by_embedding(
            be.embedding, 
            COALESCE(input_match_threshold, source_threshold), 
            COALESCE(input_match_count, source_count) + 1,
            COALESCE(input_model_filter, source_model),
            COALESCE(input_version_filter, source_version)
        ) search_result
    WHERE
        be.id = input_bill_id
        AND search_result.id != input_bill_id
    LIMIT COALESCE(input_match_count, source_count);
END;
$$;

-- Create efficient indices
CREATE INDEX idx_bill_embeddings_bill_id ON bill_embeddings(id);
CREATE INDEX idx_bill_embeddings_model ON bill_embeddings(embedding_model);
CREATE INDEX idx_bill_embeddings_version ON bill_embeddings(embedding_version);
CREATE INDEX idx_bill_embeddings_threshold ON bill_embeddings(similarity_threshold);
CREATE INDEX idx_bill_embeddings_match_count ON bill_embeddings(match_count);

-- Setup RLS policies for bill_embeddings
ALTER TABLE bill_embeddings ENABLE ROW LEVEL SECURITY;

-- Allow public read access
DROP POLICY IF EXISTS "Enable read access for all users on bill_embeddings" ON bill_embeddings;
CREATE POLICY "Enable read access for all users on bill_embeddings"
    ON bill_embeddings FOR SELECT
    TO public
    USING (true);

-- Allow service role full access
DROP POLICY IF EXISTS "Enable full access for service role on bill_embeddings" ON bill_embeddings;
CREATE POLICY "Enable full access for service role on bill_embeddings"
    ON bill_embeddings FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON bill_embeddings TO anon;
GRANT SELECT ON bill_embeddings TO authenticated;
GRANT ALL ON bill_embeddings TO service_role;

-- Add trigger for automatic updated_at timestamp handling
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bill_embeddings_updated_at
    BEFORE UPDATE ON bill_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create improved statistics views with more detailed information
CREATE OR REPLACE FUNCTION get_embedding_stats()
RETURNS TABLE (
    model VARCHAR,
    version INTEGER,
    count BIGINT,
    avg_threshold FLOAT,
    avg_match_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        be.embedding_model,
        be.embedding_version,
        COUNT(*)::BIGINT,
        AVG(be.similarity_threshold)::FLOAT,
        AVG(be.match_count)::INTEGER
    FROM 
        bill_embeddings be
    GROUP BY 
        be.embedding_model, be.embedding_version
    ORDER BY 
        COUNT(*) DESC;
END;
$$; 