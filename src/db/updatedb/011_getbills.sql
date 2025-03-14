-- Function to get bills without embeddings
CREATE OR REPLACE FUNCTION get_bills_without_embeddings(p_limit integer DEFAULT NULL, p_offset integer DEFAULT 0)
RETURNS SETOF bills
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT b.*
  FROM bills b
  LEFT JOIN bill_embeddings e ON b.id = e.id
  WHERE e.id IS NULL AND b.has_full_text = true
  ORDER BY b.updated_at DESC
  LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit END
  OFFSET p_offset;
$$;