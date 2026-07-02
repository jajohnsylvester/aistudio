-- Fix security issues with get_active_paytm_token function

-- Drop the existing function
DROP FUNCTION IF EXISTS get_active_paytm_token();

-- Recreate with proper security:
-- 1. SECURITY INVOKER - runs with caller's privileges instead of owner's
-- 2. SET search_path = '' - prevents search path manipulation attacks
-- 3. Explicit grants only to authenticated users via edge function connection
CREATE OR REPLACE FUNCTION get_active_paytm_token()
RETURNS TABLE (
  access_token TEXT,
  public_access_token TEXT,
  read_access_token TEXT
) 
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.access_token,
    t.public_access_token,
    t.read_access_token
  FROM public.paytm_access_tokens t
  WHERE t.user_id = 'default'
    AND t.is_active = TRUE
  ORDER BY t.updated_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Revoke execute from public and authenticated (only service role should use this)
REVOKE EXECUTE ON FUNCTION get_active_paytm_token() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_active_paytm_token() FROM authenticated;
REVOKE EXECUTE ON FUNCTION get_active_paytm_token() FROM anon;

-- Grant execute only to service_role (used by edge functions)
GRANT EXECUTE ON FUNCTION get_active_paytm_token() TO service_role;

-- Update RLS policy to be more restrictive
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all access for default user" ON paytm_access_tokens;

-- Create new policies for service_role only (edge functions use service_role)
CREATE POLICY "service_role_full_access" ON paytm_access_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- For anon/authenticated users, they shouldn't access this table directly
-- The edge function handles all token operations
