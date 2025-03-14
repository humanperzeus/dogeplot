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