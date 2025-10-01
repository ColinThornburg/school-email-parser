-- Fix RLS policies for users table to allow authenticated users to access their own records

-- Enable RLS on users table if not already enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own record" ON users;
DROP POLICY IF EXISTS "Users can update own record" ON users;
DROP POLICY IF EXISTS "Users can insert own record" ON users;

-- Allow users to view their own record based on auth.uid()
CREATE POLICY "Users can view own record"
ON users FOR SELECT
USING (auth.uid() = auth_user_id);

-- Allow users to update their own record
CREATE POLICY "Users can update own record"
ON users FOR UPDATE
USING (auth.uid() = auth_user_id);

-- Allow service role to insert (for the trigger)
-- But also allow authenticated users to insert their own record if needed
CREATE POLICY "Users can insert own record"
ON users FOR INSERT
WITH CHECK (auth.uid() = auth_user_id);

-- Grant necessary permissions to authenticated users
GRANT SELECT, UPDATE ON users TO authenticated;

COMMENT ON POLICY "Users can view own record" ON users IS 'Allows authenticated users to view their own user record';
COMMENT ON POLICY "Users can update own record" ON users IS 'Allows authenticated users to update their own user record';
COMMENT ON POLICY "Users can insert own record" ON users IS 'Allows authenticated users to insert their own user record';
