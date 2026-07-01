-- Table to store Paytm Money access tokens
CREATE TABLE IF NOT EXISTS paytm_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'default',
  access_token TEXT NOT NULL,
  public_access_token TEXT,
  read_access_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

-- Enable RLS
ALTER TABLE paytm_access_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for anon since this is a personal app)
CREATE POLICY "Allow all access for default user" ON paytm_access_tokens
  FOR ALL USING (user_id = 'default');

-- Create index for faster lookups
CREATE INDEX idx_paytm_tokens_user_id ON paytm_access_tokens(user_id);
CREATE INDEX idx_paytm_tokens_active ON paytm_access_tokens(is_active);

-- Function to get the active token
CREATE OR REPLACE FUNCTION get_active_paytm_token()
RETURNS TABLE (
  access_token TEXT,
  public_access_token TEXT,
  read_access_token TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.access_token,
    t.public_access_token,
    t.read_access_token
  FROM paytm_access_tokens t
  WHERE t.user_id = 'default'
    AND t.is_active = TRUE
  ORDER BY t.updated_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Unique constraint - only one active token per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_token_per_user ON paytm_access_tokens (user_id) WHERE is_active = TRUE;