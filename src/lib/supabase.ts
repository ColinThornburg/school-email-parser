import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// Database types
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          gmail_token: string | null
          gmail_refresh_token: string | null
          created_at: string
          last_sync_at: string | null
        }
        Insert: {
          id?: string
          email: string
          gmail_token?: string | null
          gmail_refresh_token?: string | null
          created_at?: string
          last_sync_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          gmail_token?: string | null
          gmail_refresh_token?: string | null
          created_at?: string
          last_sync_at?: string | null
        }
      }
      email_sources: {
        Row: {
          id: string
          user_id: string
          email: string
          domain: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          email: string
          domain?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          email?: string
          domain?: string | null
          is_active?: boolean
          created_at?: string
        }
      }
      processed_emails: {
        Row: {
          id: string
          user_id: string
          gmail_message_id: string
          sender_email: string
          subject: string
          sent_date: string
          processed_at: string
          content_hash: string
          has_attachments: boolean
          email_body_preview: string | null
          processing_status: string | null
          processing_started_at: string | null
          processing_completed_at: string | null
          session_id: string | null
          events_extracted_count: number | null
          average_confidence_score: number | null
        }
        Insert: {
          id?: string
          user_id: string
          gmail_message_id: string
          sender_email: string
          subject: string
          sent_date: string
          processed_at?: string
          content_hash: string
          has_attachments?: boolean
          email_body_preview?: string | null
          processing_status?: string | null
          processing_started_at?: string | null
          processing_completed_at?: string | null
          session_id?: string | null
          events_extracted_count?: number | null
          average_confidence_score?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          gmail_message_id?: string
          sender_email?: string
          subject?: string
          sent_date?: string
          processed_at?: string
          content_hash?: string
          has_attachments?: boolean
          email_body_preview?: string | null
          processing_status?: string | null
          processing_started_at?: string | null
          processing_completed_at?: string | null
          session_id?: string | null
          events_extracted_count?: number | null
          average_confidence_score?: number | null
        }
      }
      extracted_dates: {
        Row: {
          id: string
          email_id: string
          user_id: string
          event_title: string
          event_date: string
          event_time: string | null
          description: string | null
          confidence_score: number
          extracted_at: string
          is_verified: boolean
        }
        Insert: {
          id?: string
          email_id: string
          user_id: string
          event_title: string
          event_date: string
          event_time?: string | null
          description?: string | null
          confidence_score: number
          extracted_at?: string
          is_verified?: boolean
        }
        Update: {
          id?: string
          email_id?: string
          user_id?: string
          event_title?: string
          event_date?: string
          event_time?: string | null
          description?: string | null
          confidence_score?: number
          extracted_at?: string
          is_verified?: boolean
        }
      }
      processing_history: {
        Row: {
          id: string
          user_id: string
          email_id: string
          llm_provider: string
          processing_time: number
          token_usage: number
          success_status: boolean
          error_message: string | null
        }
        Insert: {
          id?: string
          user_id: string
          email_id: string
          llm_provider: string
          processing_time: number
          token_usage: number
          success_status: boolean
          error_message?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          email_id?: string
          llm_provider?: string
          processing_time?: number
          token_usage?: number
          success_status?: boolean
          error_message?: string | null
        }
      }
    }
  }
} 