# Vercel Environment Variables Required

Based on the codebase analysis, here are ALL the environment variables you need to set in your Vercel deployment:

## 🔑 **Required Environment Variables**

### **Supabase Configuration**
```
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
```

### **Gmail API Configuration**
```
GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret
```

### **LLM API Keys**
```
OPENAI_API_KEY=your_openai_api_key
GEMINI_API_KEY=your_google_gemini_api_key
CLAUDE_API_KEY=your_anthropic_claude_api_key (optional - not currently used)
```

## ⚙️ **Optional Configuration Variables**
```
EMAIL_LOOKBACK_DAYS=7
CONFIDENCE_THRESHOLD=0.7
ENABLE_BATCH_PROCESSING=true
GEMINI_MODEL_PREFILTER=gemini-1.5-flash
GEMINI_MODEL_FALLBACK=gemini-1.5-pro
OPENAI_MODEL_MAIN=gpt-4o-mini
```

## 🚀 **How to Set These in Vercel**

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable one by one:
   - **Key**: Variable name (e.g., `SUPABASE_URL`)
   - **Value**: Your actual key/URL
   - **Environment**: Select `Production`, `Preview`, and `Development`

## 🔍 **Where to Find These Values**

### **Supabase**
- `SUPABASE_URL`: Project Settings → API → Project URL
- `SUPABASE_SERVICE_KEY`: Project Settings → API → Service Role Key (secret)

### **Gmail API**
- `GMAIL_CLIENT_ID` & `GMAIL_CLIENT_SECRET`: Google Cloud Console → APIs & Services → Credentials

### **LLM APIs**
- `OPENAI_API_KEY`: OpenAI Platform → API Keys
- `CLAUDE_API_KEY`: Anthropic Console → API Keys  
- `GEMINI_API_KEY`: Google AI Studio → API Keys

## ⚠️ **Important Notes**

- **Never commit these values to your repository**
- **Use the Service Role Key** for Supabase (not the anon key)
- **OpenAI API key is required** for the email summaries feature
- **OpenAI and Gemini keys** are used by different parts of the application
- **Claude API key is optional** (not currently used by email summaries)

## 🔧 **Current Issue**

The error "supabaseKey is required" means either:
1. `SUPABASE_SERVICE_KEY` is not set in Vercel
2. `SUPABASE_URL` is not set in Vercel

Make sure both are configured in your Vercel environment variables.
