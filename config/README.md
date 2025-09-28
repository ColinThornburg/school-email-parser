# Centralized Prompt Configuration

## Overview
The `prompts.json` file centralizes ALL LLM prompts used throughout the school email processing app. This allows you to easily modify AI behavior without touching any code.

## How to Use
1. **Edit prompts**: Open `config/prompts.json` and modify any prompt text
2. **Deploy changes**: Push to your repo - changes take effect immediately on next deploy
3. **Placeholders**: Keep text in `{{double braces}}` exactly as-is - these get replaced with actual data

## Available Prompts

### `classificationPrompt`
- **Used by**: Gemini AI for initial email triage
- **Purpose**: Decides if an email contains date/time information worth processing
- **Cost impact**: High - runs on every email first

### `extractionPrompt`
- **Used by**: OpenAI GPT-4o-mini for extracting calendar events
- **Purpose**: Pulls specific dates, times, and event details from school emails
- **Cost impact**: Medium - only runs on emails that pass classification

### `summaryPrompt`
- **Used by**: OpenAI GPT-4o-mini for generating email summaries
- **Purpose**: Creates parent-friendly summaries visible in the Email Summaries dashboard
- **Cost impact**: Low - only runs when user views summaries

## Important Notes
- The "Meow" instruction in `summaryPrompt` is your test case - feel free to modify it
- JSON format must be valid - test with an online JSON validator if unsure
- Prompt changes affect all users immediately after deployment
- Cost optimizations should focus on `classificationPrompt` since it runs most frequently

## Testing Changes
After editing prompts:
1. Test locally: `node -e "const p = require('./config/prompts.json'); console.log('✅ Valid JSON')"`
2. Deploy and test with actual emails
3. Monitor processing costs in your dashboard