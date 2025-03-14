-- Create an index on the has_full_text column to speed up filtering
-- This will make querying bills with text nearly instantaneous
CREATE INDEX IF NOT EXISTS idx_bills_has_full_text ON bills (has_full_text);

-- Adding a comment to explain the purpose of this index
COMMENT ON INDEX idx_bills_has_full_text IS 'Index to optimize filtering bills with full text, added to reduce 2-3s query time'; 