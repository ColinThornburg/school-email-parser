-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  gmail_token TEXT,
  gmail_refresh_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_sync_at TIMESTAMP WITH TIME ZONE
);

-- Email sources table
CREATE TABLE IF NOT EXISTS email_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Processed emails table
CREATE TABLE IF NOT EXISTS processed_emails (
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
CREATE TABLE IF NOT EXISTS extracted_dates (
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

-- Sync sessions table (groups related processing activities)
CREATE TABLE IF NOT EXISTS sync_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_type VARCHAR(20) NOT NULL, -- 'sync' or 'reprocess'
  lookback_days INTEGER NOT NULL,
  processing_mode VARCHAR(20) NOT NULL, -- 'single' or 'batch'
  total_emails_processed INTEGER DEFAULT 0,
  total_events_extracted INTEGER DEFAULT 0,
  total_cost DECIMAL(10, 6) DEFAULT 0,
  duplicates_removed INTEGER DEFAULT 0,
  skipped_duplicate_emails INTEGER DEFAULT 0,
  skipped_duplicate_events INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  success_status BOOLEAN DEFAULT true,
  error_message TEXT
);

-- Enhanced processing history table
CREATE TABLE IF NOT EXISTS processing_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sync_sessions(id) ON DELETE SET NULL,
  email_id UUID REFERENCES processed_emails(id) ON DELETE CASCADE,
  llm_provider VARCHAR(50) NOT NULL, -- 'openai', 'gemini', 'orchestrator'
  model_name VARCHAR(100), -- specific model used
  processing_step VARCHAR(50), -- 'classification', 'extraction', 'fallback'
  processing_time INTEGER NOT NULL, -- in milliseconds
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  cost DECIMAL(10, 6) DEFAULT 0,
  success_status BOOLEAN NOT NULL,
  confidence_score DECIMAL(3, 2), -- for extracted events
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns to existing processing_history table
DO $$ 
BEGIN
    -- Add session_id column if it doesn't exist (nullable for backward compatibility)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processing_history' 
        AND column_name = 'session_id'
    ) THEN
        ALTER TABLE processing_history ADD COLUMN session_id UUID REFERENCES sync_sessions(id) ON DELETE SET NULL;
    END IF;

    -- Add model_name column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processing_history' 
        AND column_name = 'model_name'
    ) THEN
        ALTER TABLE processing_history ADD COLUMN model_name VARCHAR(100);
    END IF;

    -- Add processing_step column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processing_history' 
        AND column_name = 'processing_step'
    ) THEN
        ALTER TABLE processing_history ADD COLUMN processing_step VARCHAR(50);
    END IF;

    -- Add input_tokens column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processing_history' 
        AND column_name = 'input_tokens'
    ) THEN
        ALTER TABLE processing_history ADD COLUMN input_tokens INTEGER DEFAULT 0;
    END IF;

    -- Add output_tokens column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processing_history' 
        AND column_name = 'output_tokens'
    ) THEN
        ALTER TABLE processing_history ADD COLUMN output_tokens INTEGER DEFAULT 0;
    END IF;

    -- Add total_tokens column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processing_history' 
        AND column_name = 'total_tokens'
    ) THEN
        ALTER TABLE processing_history ADD COLUMN total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED;
    END IF;

    -- Add cost column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processing_history' 
        AND column_name = 'cost'
    ) THEN
        ALTER TABLE processing_history ADD COLUMN cost DECIMAL(10, 6) DEFAULT 0;
    END IF;

    -- Add confidence_score column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processing_history' 
        AND column_name = 'confidence_score'
    ) THEN
        ALTER TABLE processing_history ADD COLUMN confidence_score DECIMAL(3, 2);
    END IF;

    -- Add retry_count column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processing_history' 
        AND column_name = 'retry_count'
    ) THEN
        ALTER TABLE processing_history ADD COLUMN retry_count INTEGER DEFAULT 0;
    END IF;

EXCEPTION
    WHEN others THEN
        -- Table might not exist yet, ignore errors
        NULL;
END $$;

-- Indexes for performance (conditional creation)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_email_sources_user_id ON email_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_email_sources_email ON email_sources(email);
CREATE INDEX IF NOT EXISTS idx_processed_emails_user_id ON processed_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_processed_emails_gmail_message_id ON processed_emails(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_extracted_dates_user_id ON extracted_dates(user_id);
CREATE INDEX IF NOT EXISTS idx_extracted_dates_event_date ON extracted_dates(event_date);
CREATE INDEX IF NOT EXISTS idx_sync_sessions_user_id ON sync_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_sessions_started_at ON sync_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_processing_history_user_id ON processing_history(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_history_session_id ON processing_history(session_id);
CREATE INDEX IF NOT EXISTS idx_processing_history_created_at ON processing_history(created_at);

-- Row Level Security (RLS) policies - Enable RLS only if not already enabled
DO $$ 
BEGIN
    -- Enable RLS for all tables (safe to run multiple times)
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE email_sources ENABLE ROW LEVEL SECURITY;
    ALTER TABLE processed_emails ENABLE ROW LEVEL SECURITY;
    ALTER TABLE extracted_dates ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sync_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE processing_history ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN
        -- Tables might not exist yet, ignore errors
        NULL;
END $$;

-- Policies for users table
DO $$ 
BEGIN
    -- Drop existing policies if they exist to avoid conflicts
    DROP POLICY IF EXISTS "Users can view own profile" ON users;
    DROP POLICY IF EXISTS "Users can update own profile" ON users;
    
    -- Create policies
    CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
    CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);
EXCEPTION
    WHEN others THEN
        -- Table might not exist yet, ignore errors
        NULL;
END $$;

-- Policies for email_sources table (currently disabled for development)
DO $$ 
BEGIN
    ALTER TABLE email_sources DISABLE ROW LEVEL SECURITY;
    -- Commented out policies for development
    -- DROP POLICY IF EXISTS "Users can view own email sources" ON email_sources;
    -- DROP POLICY IF EXISTS "Users can insert own email sources" ON email_sources;
    -- DROP POLICY IF EXISTS "Users can update own email sources" ON email_sources;
    -- DROP POLICY IF EXISTS "Users can delete own email sources" ON email_sources;
    
    -- CREATE POLICY "Users can view own email sources" ON email_sources FOR SELECT USING (auth.uid() = user_id);
    -- CREATE POLICY "Users can insert own email sources" ON email_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
    -- CREATE POLICY "Users can update own email sources" ON email_sources FOR UPDATE USING (auth.uid() = user_id);
    -- CREATE POLICY "Users can delete own email sources" ON email_sources FOR DELETE USING (auth.uid() = user_id);
EXCEPTION
    WHEN others THEN
        -- Table might not exist yet, ignore errors
        NULL;
END $$;

-- Policies for processed_emails table (currently disabled for development)
DO $$ 
BEGIN
    ALTER TABLE processed_emails DISABLE ROW LEVEL SECURITY;
    -- Commented out policies for development
    -- DROP POLICY IF EXISTS "Users can view own processed emails" ON processed_emails;
    -- DROP POLICY IF EXISTS "Users can insert own processed emails" ON processed_emails;
    -- DROP POLICY IF EXISTS "Users can update own processed emails" ON processed_emails;
    -- DROP POLICY IF EXISTS "Users can delete own processed emails" ON processed_emails;
    
    -- CREATE POLICY "Users can view own processed emails" ON processed_emails FOR SELECT USING (auth.uid() = user_id);
    -- CREATE POLICY "Users can insert own processed emails" ON processed_emails FOR INSERT WITH CHECK (auth.uid() = user_id);
    -- CREATE POLICY "Users can update own processed emails" ON processed_emails FOR UPDATE USING (auth.uid() = user_id);
    -- CREATE POLICY "Users can delete own processed emails" ON processed_emails FOR DELETE USING (auth.uid() = user_id);
EXCEPTION
    WHEN others THEN
        -- Table might not exist yet, ignore errors
        NULL;
END $$;

-- Policies for extracted_dates table (currently disabled for development)
DO $$ 
BEGIN
    ALTER TABLE extracted_dates DISABLE ROW LEVEL SECURITY;
    -- Commented out policies for development
    -- DROP POLICY IF EXISTS "Users can view own extracted dates" ON extracted_dates;
    -- DROP POLICY IF EXISTS "Users can insert own extracted dates" ON extracted_dates;
    -- DROP POLICY IF EXISTS "Users can update own extracted dates" ON extracted_dates;
    -- DROP POLICY IF EXISTS "Users can delete own extracted dates" ON extracted_dates;
    
    -- CREATE POLICY "Users can view own extracted dates" ON extracted_dates FOR SELECT USING (auth.uid() = user_id);
    -- CREATE POLICY "Users can insert own extracted dates" ON extracted_dates FOR INSERT WITH CHECK (auth.uid() = user_id);
    -- CREATE POLICY "Users can update own extracted dates" ON extracted_dates FOR UPDATE USING (auth.uid() = user_id);
    -- CREATE POLICY "Users can delete own extracted dates" ON extracted_dates FOR DELETE USING (auth.uid() = user_id);
EXCEPTION
    WHEN others THEN
        -- Table might not exist yet, ignore errors
        NULL;
END $$;

-- Policies for sync_sessions table (currently disabled for development)
DO $$ 
BEGIN
    ALTER TABLE sync_sessions DISABLE ROW LEVEL SECURITY;
    -- Commented out policies for development
    -- DROP POLICY IF EXISTS "Users can view own sync sessions" ON sync_sessions;
    -- DROP POLICY IF EXISTS "Users can insert own sync sessions" ON sync_sessions;
    -- DROP POLICY IF EXISTS "Users can update own sync sessions" ON sync_sessions;
    
    -- CREATE POLICY "Users can view own sync sessions" ON sync_sessions FOR SELECT USING (auth.uid() = user_id);
    -- CREATE POLICY "Users can insert own sync sessions" ON sync_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
    -- CREATE POLICY "Users can update own sync sessions" ON sync_sessions FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION
    WHEN others THEN
        -- Table might not exist yet, ignore errors
        NULL;
END $$;

-- Policies for processing_history table
DO $$ 
BEGIN
    -- Drop existing policies if they exist to avoid conflicts
    DROP POLICY IF EXISTS "Users can view own processing history" ON processing_history;
    DROP POLICY IF EXISTS "Users can insert own processing history" ON processing_history;

    CREATE POLICY "Users can view own processing history" ON processing_history FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY "Users can insert own processing history" ON processing_history FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION
    WHEN others THEN
        -- Table might not exist yet, ignore errors
        NULL;
END $$;

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
EXCEPTION
    WHEN others THEN NULL;
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