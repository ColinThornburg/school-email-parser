-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  gmail_token TEXT,
  gmail_refresh_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_sync_at TIMESTAMP WITH TIME ZONE
);

-- Email sources table
CREATE TABLE email_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Processed emails table
CREATE TABLE processed_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  gmail_message_id VARCHAR(255) UNIQUE NOT NULL,
  sender_email VARCHAR(255) NOT NULL,
  subject TEXT NOT NULL,
  sent_date TIMESTAMP WITH TIME ZONE NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  content_hash VARCHAR(64) NOT NULL,
  has_attachments BOOLEAN DEFAULT FALSE
);

-- Extracted dates table
CREATE TABLE extracted_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id UUID REFERENCES processed_emails(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_title TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME,
  description TEXT,
  confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_verified BOOLEAN DEFAULT FALSE
);

-- Processing history table
CREATE TABLE processing_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES processed_emails(id) ON DELETE CASCADE,
  llm_provider VARCHAR(50) NOT NULL,
  processing_time INTEGER NOT NULL, -- in milliseconds
  token_usage INTEGER NOT NULL,
  success_status BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_email_sources_user_id ON email_sources(user_id);
CREATE INDEX idx_email_sources_email ON email_sources(email);
CREATE INDEX idx_processed_emails_user_id ON processed_emails(user_id);
CREATE INDEX idx_processed_emails_gmail_message_id ON processed_emails(gmail_message_id);
CREATE INDEX idx_extracted_dates_user_id ON extracted_dates(user_id);
CREATE INDEX idx_extracted_dates_event_date ON extracted_dates(event_date);
CREATE INDEX idx_processing_history_user_id ON processing_history(user_id);

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_history ENABLE ROW LEVEL SECURITY;

-- Policies for users table
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- Policies for email_sources table
ALTER TABLE email_sources DISABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own email sources" ON email_sources FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "Users can insert own email sources" ON email_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Users can update own email sources" ON email_sources FOR UPDATE USING (auth.uid() = user_id);
-- CREATE POLICY "Users can delete own email sources" ON email_sources FOR DELETE USING (auth.uid() = user_id);

-- Policies for processed_emails table
ALTER TABLE processed_emails DISABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own processed emails" ON processed_emails FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "Users can insert own processed emails" ON processed_emails FOR INSERT WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Users can update own processed emails" ON processed_emails FOR UPDATE USING (auth.uid() = user_id);
-- CREATE POLICY "Users can delete own processed emails" ON processed_emails FOR DELETE USING (auth.uid() = user_id);

-- Policies for extracted_dates table
ALTER TABLE extracted_dates DISABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own extracted dates" ON extracted_dates FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "Users can insert own extracted dates" ON extracted_dates FOR INSERT WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Users can update own extracted dates" ON extracted_dates FOR UPDATE USING (auth.uid() = user_id);
-- CREATE POLICY "Users can delete own extracted dates" ON extracted_dates FOR DELETE USING (auth.uid() = user_id);

-- Policies for processing_history table
-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view own processing history" ON processing_history;
DROP POLICY IF EXISTS "Users can insert own processing history" ON processing_history;

CREATE POLICY "Users can view own processing history" ON processing_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own processing history" ON processing_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add unique constraint to prevent duplicate events (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_user_event' 
        AND table_name = 'extracted_dates'
    ) THEN
        ALTER TABLE extracted_dates ADD CONSTRAINT unique_user_event 
        UNIQUE (user_id, event_title, event_date, event_time);
    END IF;
END $$;

-- Function to find duplicate events (keeps oldest, marks others for deletion)
CREATE OR REPLACE FUNCTION find_duplicate_events(p_user_id UUID)
RETURNS TABLE(id UUID, event_title TEXT, event_date DATE, event_time TIME, extracted_at TIMESTAMP WITH TIME ZONE) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH ranked_events AS (
    SELECT 
      e.id,
      e.event_title,
      e.event_date,
      e.event_time,
      e.extracted_at,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(TRIM(e.event_title)), e.event_date, COALESCE(e.event_time, '00:00:00'::TIME)
        ORDER BY e.extracted_at ASC
      ) as rn
    FROM extracted_dates e
    WHERE e.user_id = p_user_id
  )
  SELECT 
    r.id,
    r.event_title,
    r.event_date,
    r.event_time,
    r.extracted_at
  FROM ranked_events r
  WHERE r.rn > 1; -- Only return duplicates (keep the first occurrence)
END;
$$; 