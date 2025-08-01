/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_GMAIL_CLIENT_ID: string
  readonly VITE_GMAIL_CLIENT_SECRET: string
  readonly VITE_OPENAI_API_KEY: string
  readonly VITE_CLAUDE_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 