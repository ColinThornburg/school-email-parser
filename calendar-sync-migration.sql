-- Adds Google Calendar sync tracking columns to extracted_dates
-- Run this migration in Supabase to enable calendar integration metadata
ALTER TABLE extracted_dates
  ADD COLUMN IF NOT EXISTS google_calendar_event_id text;

ALTER TABLE extracted_dates
  ADD COLUMN IF NOT EXISTS google_calendar_synced_at timestamptz;

ALTER TABLE extracted_dates
  ADD COLUMN IF NOT EXISTS google_calendar_sync_status text;

ALTER TABLE extracted_dates
  ADD COLUMN IF NOT EXISTS google_calendar_sync_error text;
