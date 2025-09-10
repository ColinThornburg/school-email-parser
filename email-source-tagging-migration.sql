-- Email Source Tagging System Migration
-- Run this in your Supabase SQL editor to enable tagging functionality

-- Create the tags table for managing kid names and general tags
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'kid', -- 'kid' or 'general'
  color VARCHAR(7) DEFAULT '#3B82F6', -- Hex color for visual identification
  emoji VARCHAR(10), -- Optional emoji for the tag
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique tag names per user
  UNIQUE(user_id, name)
);

-- Add tag_id column to email_sources table
ALTER TABLE email_sources 
ADD COLUMN IF NOT EXISTS tag_id UUID REFERENCES tags(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_type ON tags(type);
CREATE INDEX IF NOT EXISTS idx_email_sources_tag_id ON email_sources(tag_id);

-- Enable RLS (Row Level Security) for tags
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tags
CREATE POLICY "Users can view their own tags" ON tags
  FOR SELECT USING (user_id = auth.uid()::uuid);

CREATE POLICY "Users can insert their own tags" ON tags
  FOR INSERT WITH CHECK (user_id = auth.uid()::uuid);

CREATE POLICY "Users can update their own tags" ON tags
  FOR UPDATE USING (user_id = auth.uid()::uuid);

CREATE POLICY "Users can delete their own tags" ON tags
  FOR DELETE USING (user_id = auth.uid()::uuid);

-- Grant necessary permissions
GRANT ALL ON tags TO authenticated;
GRANT ALL ON tags TO service_role;

-- Insert some default tags for new users (optional - can be done via UI)
-- These will be created when users first set up their tagging system

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for tags table
CREATE TRIGGER update_tags_updated_at 
    BEFORE UPDATE ON tags 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
