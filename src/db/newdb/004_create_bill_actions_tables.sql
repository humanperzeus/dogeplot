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