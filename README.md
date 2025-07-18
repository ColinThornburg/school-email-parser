# School Email Date Parser

A modern web application that integrates with Gmail to automatically parse and consolidate important dates from school emails into a unified dashboard for parents.

## Features

- **Gmail Integration**: OAuth 2.0 authentication with Gmail API
- **Email Source Management**: Configure specific email addresses and domains to monitor
- **Intelligent Date Extraction**: Uses LLM (OpenAI/Claude) to extract dates from emails
- **Modern UI**: Built with React, TypeScript, and Tailwind CSS
- **Real-time Dashboard**: Calendar and list views of extracted events
- **Confidence Scoring**: AI-powered confidence scores for extracted dates
- **Verification System**: Manual verification of extracted events

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Serverless functions (Vercel/Netlify)
- **Database**: Supabase (PostgreSQL)
- **UI Framework**: Tailwind CSS + shadcn/ui
- **Authentication**: Gmail OAuth 2.0
- **LLM Integration**: OpenAI GPT-4 / Claude

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm
- Gmail account with API access
- Supabase account
- OpenAI API key

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd school-email-parser
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Copy the project URL and anon key
3. Run the SQL schema from `supabase-schema.sql` in the Supabase SQL editor
4. Enable Row Level Security (RLS) in the project settings

### 3. Set Up Gmail API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API
4. Create credentials (OAuth 2.0 client ID)
5. Set authorized origins:
   - `http://localhost:5173` (for development)
   - Your production domain
6. Set authorized redirect URIs:
   - `http://localhost:5173/auth/callback`
   - `https://yourdomain.com/auth/callback`

### 4. Environment Variables

Create a `.env` file in the root directory:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Gmail API Configuration
VITE_GMAIL_CLIENT_ID=your_gmail_client_id
VITE_GMAIL_CLIENT_SECRET=your_gmail_client_secret

# OpenAI Configuration
VITE_OPENAI_API_KEY=your_openai_api_key

# Claude Configuration (optional)
VITE_CLAUDE_API_KEY=your_claude_api_key
```

### 5. Gmail API Setup Details

For Gmail integration, you'll need to:

1. **Enable Gmail API**:
   - Go to Google Cloud Console
   - Navigate to "APIs & Services" > "Library"
   - Search for "Gmail API" and enable it

2. **Create OAuth 2.0 Credentials**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Choose "Web application"
   - Add authorized JavaScript origins: `http://localhost:5173`
   - Add authorized redirect URIs: `http://localhost:5173/auth/callback`

3. **Configure OAuth Consent Screen**:
   - Go to "APIs & Services" > "OAuth consent screen"
   - Add required information
   - Add scopes: `https://www.googleapis.com/auth/gmail.readonly`

4. **Required Gmail Scopes**:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`

### 6. Run the Application

```bash
# Development mode
npm run dev

# Production build
npm run build
npm run preview
```

The app will be available at `http://localhost:5173`

## Project Structure

```
school-email-parser/
├── src/
│   ├── components/
│   │   ├── ui/           # Reusable UI components
│   │   └── Dashboard.tsx # Main dashboard component
│   ├── lib/
│   │   ├── supabase.ts   # Supabase client configuration
│   │   └── utils.ts      # Utility functions
│   ├── types/
│   │   └── index.ts      # TypeScript type definitions
│   ├── App.tsx           # Main application component
│   ├── main.tsx          # React entry point
│   └── index.css         # Global styles
├── api/                  # Serverless functions (to be implemented)
├── supabase-schema.sql   # Database schema
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

## Next Steps

### Phase 1: Core Infrastructure (Current)
- ✅ Basic web application framework
- ✅ Modern React + TypeScript setup
- ✅ Supabase database schema
- ✅ UI components and dashboard
- 🔄 Gmail OAuth integration
- 🔄 Email fetching functionality

### Phase 2: Content Processing (Next)
- ⏳ Email text extraction
- ⏳ PDF processing capability
- ⏳ LLM integration for date extraction
- ⏳ Serverless functions for email processing

### Phase 3: Advanced Features
- ⏳ Real-time email monitoring
- ⏳ Calendar view with FullCalendar
- ⏳ Email source management UI
- ⏳ Settings and configuration panel

## API Integration

The application will use serverless functions for:

1. **Gmail Authentication**: Handle OAuth flow
2. **Email Processing**: Fetch and process emails
3. **LLM Integration**: Extract dates using OpenAI/Claude
4. **Database Operations**: CRUD operations via Supabase

## Security Features

- Row Level Security (RLS) in Supabase
- Encrypted Gmail token storage
- Secure API key management
- OAuth 2.0 authentication flow
- Content hashing for deduplication

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions, please create an issue in the GitHub repository. 