-- Email Summaries Table Migration
-- Run this in your Supabase SQL editor to enable email summaries functionality

-- Create the email_summaries table
CREATE TABLE IF NOT EXISTS email_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id UUID REFERENCES processed_emails(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  summary_data JSONB NOT NULL,
  confidence_score DECIMAL(3,2) NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  llm_provider VARCHAR(50) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  processing_tokens INTEGER,
  processing_cost DECIMAL(10, 6),
  content_hash TEXT,
  
  -- Ensure one summary per email
  UNIQUE(email_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_summaries_user_id ON email_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_email_summaries_generated_at ON email_summaries(generated_at);
CREATE INDEX IF NOT EXISTS idx_email_summaries_email_id ON email_summaries(email_id);

-- Enable RLS (Row Level Security)
ALTER TABLE email_summaries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own email summaries" ON email_summaries
  FOR SELECT USING (user_id = auth.uid()::uuid);

CREATE POLICY "Users can insert their own email summaries" ON email_summaries
  FOR INSERT WITH CHECK (user_id = auth.uid()::uuid);

CREATE POLICY "Users can update their own email summaries" ON email_summaries
  FOR UPDATE USING (user_id = auth.uid()::uuid);

CREATE POLICY "Users can delete their own email summaries" ON email_summaries
  FOR DELETE USING (user_id = auth.uid()::uuid);

-- Grant necessary permissions
GRANT ALL ON email_summaries TO authenticated;
GRANT ALL ON email_summaries TO service_role;
