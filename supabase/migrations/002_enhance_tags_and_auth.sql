-- Migration: Enhance tags with child/grade information and update auth
-- This migration adds child-specific fields to tags and updates the users table

-- Step 1: Add new columns to tags table for child information
ALTER TABLE tags
ADD COLUMN IF NOT EXISTS child_name TEXT,
ADD COLUMN IF NOT EXISTS grade_level TEXT,
ADD COLUMN IF NOT EXISTS school_name TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Step 2: Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_tags_user_id_type ON tags(user_id, type);

-- Step 3: Update users table to work with Supabase Auth
-- Add auth_user_id to link to Supabase Auth
ALTER TABLE users
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 4: Create unique index on auth_user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);

-- Step 5: Add RLS (Row Level Security) policies for tags
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own tags" ON tags;
DROP POLICY IF EXISTS "Users can insert own tags" ON tags;
DROP POLICY IF EXISTS "Users can update own tags" ON tags;
DROP POLICY IF EXISTS "Users can delete own tags" ON tags;

-- Policy: Users can view their own tags
CREATE POLICY "Users can view own tags"
ON tags FOR SELECT
USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = tags.user_id));

-- Policy: Users can insert their own tags
CREATE POLICY "Users can insert own tags"
ON tags FOR INSERT
WITH CHECK (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = tags.user_id));

-- Policy: Users can update their own tags
CREATE POLICY "Users can update own tags"
ON tags FOR UPDATE
USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = tags.user_id));

-- Policy: Users can delete their own tags
CREATE POLICY "Users can delete own tags"
ON tags FOR DELETE
USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = tags.user_id));

-- Step 6: Add RLS policies for other tables
ALTER TABLE extracted_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sources ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for extracted_dates
DROP POLICY IF EXISTS "Users can view own extracted dates" ON extracted_dates;
DROP POLICY IF EXISTS "Users can insert own extracted dates" ON extracted_dates;
DROP POLICY IF EXISTS "Users can update own extracted dates" ON extracted_dates;
DROP POLICY IF EXISTS "Users can delete own extracted dates" ON extracted_dates;

-- Extracted dates policies
CREATE POLICY "Users can view own extracted dates"
ON extracted_dates FOR SELECT
USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = extracted_dates.user_id));

CREATE POLICY "Users can insert own extracted dates"
ON extracted_dates FOR INSERT
WITH CHECK (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = extracted_dates.user_id));

CREATE POLICY "Users can update own extracted dates"
ON extracted_dates FOR UPDATE
USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = extracted_dates.user_id));

CREATE POLICY "Users can delete own extracted dates"
ON extracted_dates FOR DELETE
USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = extracted_dates.user_id));

-- Drop existing policies for processed_emails
DROP POLICY IF EXISTS "Users can view own processed emails" ON processed_emails;
DROP POLICY IF EXISTS "Users can insert own processed emails" ON processed_emails;
DROP POLICY IF EXISTS "Users can update own processed emails" ON processed_emails;

-- Processed emails policies
CREATE POLICY "Users can view own processed emails"
ON processed_emails FOR SELECT
USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = processed_emails.user_id));

CREATE POLICY "Users can insert own processed emails"
ON processed_emails FOR INSERT
WITH CHECK (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = processed_emails.user_id));

CREATE POLICY "Users can update own processed emails"
ON processed_emails FOR UPDATE
USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = processed_emails.user_id));

-- Drop existing policies for email_sources
DROP POLICY IF EXISTS "Users can view own email sources" ON email_sources;
DROP POLICY IF EXISTS "Users can insert own email sources" ON email_sources;
DROP POLICY IF EXISTS "Users can update own email sources" ON email_sources;
DROP POLICY IF EXISTS "Users can delete own email sources" ON email_sources;

-- Email sources policies
CREATE POLICY "Users can view own email sources"
ON email_sources FOR SELECT
USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = email_sources.user_id));

CREATE POLICY "Users can insert own email sources"
ON email_sources FOR INSERT
WITH CHECK (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = email_sources.user_id));

CREATE POLICY "Users can update own email sources"
ON email_sources FOR UPDATE
USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = email_sources.user_id));

CREATE POLICY "Users can delete own email sources"
ON email_sources FOR DELETE
USING (auth.uid() IN (SELECT auth_user_id FROM users WHERE users.id = email_sources.user_id));

-- Step 7: Create function to auto-create user record on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, auth_user_id, email, created_at, updated_at)
  VALUES (gen_random_uuid(), NEW.id, NEW.email, NOW(), NOW())
  ON CONFLICT (email) DO UPDATE
  SET auth_user_id = NEW.id, updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Create trigger to call function on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 9: Add helpful comments
COMMENT ON COLUMN tags.child_name IS 'Name of the child this tag represents (for kid-type tags)';
COMMENT ON COLUMN tags.grade_level IS 'Current grade level (e.g., "3rd Grade", "Kindergarten")';
COMMENT ON COLUMN tags.school_name IS 'Name of the school the child attends';
COMMENT ON COLUMN tags.notes IS 'Additional notes about the child or tag';
