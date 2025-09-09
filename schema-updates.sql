-- Additional columns needed for the processing dashboard
-- Run this in your Supabase SQL editor to fix the dashboard display

DO $$ 
BEGIN
    -- Add processing cost tracking column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processed_emails' 
        AND column_name = 'processing_cost'
    ) THEN
        ALTER TABLE processed_emails ADD COLUMN processing_cost DECIMAL(10, 6) DEFAULT 0;
    END IF;

    -- Add total tokens used column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processed_emails' 
        AND column_name = 'total_tokens_used'
    ) THEN
        ALTER TABLE processed_emails ADD COLUMN total_tokens_used INTEGER DEFAULT 0;
    END IF;

    -- Add LLM providers used column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processed_emails' 
        AND column_name = 'llm_providers_used'
    ) THEN
        ALTER TABLE processed_emails ADD COLUMN llm_providers_used TEXT;
    END IF;

    -- Add models used column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processed_emails' 
        AND column_name = 'models_used'
    ) THEN
        ALTER TABLE processed_emails ADD COLUMN models_used TEXT;
    END IF;

    -- Add processing time in milliseconds column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processed_emails' 
        AND column_name = 'processing_time_ms'
    ) THEN
        ALTER TABLE processed_emails ADD COLUMN processing_time_ms INTEGER DEFAULT 0;
    END IF;

    -- Add extraction successful flag column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processed_emails' 
        AND column_name = 'extraction_successful'
    ) THEN
        ALTER TABLE processed_emails ADD COLUMN extraction_successful BOOLEAN DEFAULT TRUE;
    END IF;

    -- Add had date content flag column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processed_emails' 
        AND column_name = 'had_date_content'
    ) THEN
        ALTER TABLE processed_emails ADD COLUMN had_date_content BOOLEAN;
    END IF;

    -- Add classification passed flag column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processed_emails' 
        AND column_name = 'classification_passed'
    ) THEN
        ALTER TABLE processed_emails ADD COLUMN classification_passed BOOLEAN;
    END IF;

    -- Add processing error message column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'processed_emails' 
        AND column_name = 'processing_error_message'
    ) THEN
        ALTER TABLE processed_emails ADD COLUMN processing_error_message TEXT;
    END IF;

EXCEPTION
    WHEN others THEN
        -- Log error but don't fail
        RAISE NOTICE 'Error adding columns to processed_emails: %', SQLERRM;
END $$;
