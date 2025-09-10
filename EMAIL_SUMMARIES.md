# Email Summaries Feature Documentation

## Overview

The Email Summaries feature provides AI-generated summaries of school emails, extracting key points, important dates, action items, and categorizing emails for easier consumption by parents and students.

## Current Architecture

### API Endpoint
- **File**: `/api/email-summaries.ts`
- **Method**: GET
- **Parameters**: 
  - `userId` (required): User ID to fetch summaries for
  - `limit` (optional): Number of summaries to return (default: 20)
  - `offset` (optional): Pagination offset (default: 0)

### Data Flow

1. **Fetch Processed Emails**: Query `processed_emails` table for completed emails with body content
2. **Generate Summaries On-Demand**: For each email, call OpenAI API to generate summary
3. **Return Results**: Send generated summaries back to frontend

### Frontend Component
- **File**: `/src/components/EmailSummaries.tsx`
- **Features**:
  - Displays summaries with categories, key points, important dates, and action items
  - Expandable/collapsible view for detailed information
  - Pagination support
  - Confidence scoring display

## Summary Structure

Each summary includes:

```typescript
interface EmailSummary {
  id: string
  emailId: string
  userId: string
  subject: string
  senderEmail: string
  sentDate: Date
  summary: {
    keyPoints: string[]           // Main content highlights
    importantDates: Array<{       // Extracted dates with context
      date: string
      description: string
      originalText: string
    }>
    actionItems: string[]         // Required actions/responses
    categories: string[]          // Email classification
  }
  confidence: number              // AI confidence score (0-1)
  generatedAt: Date
  emailBodyPreview?: string
}
```

## Categories

The system automatically categorizes emails into:
- **Academic**: Class-related content, assignments, grades
- **Events**: School events, activities, performances
- **Administrative**: Policy changes, announcements, forms
- **Food Service**: Lunch menus, dietary information
- **Transportation**: Bus schedules, route changes
- **Health**: Health screenings, medical requirements
- **Sports**: Athletic events, team information

## AI Processing

### LLM Provider
- **Current**: OpenAI GPT-4o-mini
- **Model**: Configurable, optimized for cost/performance
- **Temperature**: 0.2 (for consistent, factual summaries)
- **Max Tokens**: 1500

### Prompt Engineering
The system uses a comprehensive prompt that:
- Extracts key information systematically
- Maintains original context and tone
- Identifies actionable items
- Provides confidence scoring
- Handles both HTML and plain text emails

## ⚠️ CRITICAL EFFICIENCY ISSUE

### Current Problem
**The system regenerates ALL summaries on EVERY API call**, leading to:

1. **High Costs**: Every page load triggers OpenAI API calls for all displayed emails
2. **Poor Performance**: Slow loading times due to sequential API calls
3. **Rate Limiting Risk**: Potential API rate limit issues with multiple users
4. **Redundant Processing**: Same emails summarized repeatedly

### Cost Impact Analysis
- **Per Summary**: ~1000-1500 tokens × $0.00015/1K tokens = ~$0.0002 per summary
- **Per Page Load**: 10 summaries × $0.0002 = ~$0.002
- **Monthly Cost Example**: 
  - 100 users × 10 page loads/month × $0.002 = $2/month minimum
  - With heavy usage: Could easily reach $20-50/month

## Recommended Solution: Summary Caching

### 1. Database Schema Addition

Add a new `email_summaries` table:

```sql
CREATE TABLE email_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id UUID REFERENCES processed_emails(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  summary_data JSONB NOT NULL,
  confidence_score DECIMAL(3,2) NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  llm_provider VARCHAR(50) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  processing_tokens INTEGER,
  processing_cost DECIMAL(10, 6),
  
  -- Ensure one summary per email
  UNIQUE(email_id)
);

-- Indexes for performance
CREATE INDEX idx_email_summaries_user_id ON email_summaries(user_id);
CREATE INDEX idx_email_summaries_generated_at ON email_summaries(generated_at);
```

### 2. Modified API Logic

```typescript
// Pseudo-code for improved API
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Fetch emails with existing summaries
  const emailsWithSummaries = await supabase
    .from('processed_emails')
    .select(`
      *,
      email_summaries(*)
    `)
    .eq('user_id', userId)
    .eq('processing_status', 'completed');

  // 2. Identify emails that need summarization
  const emailsNeedingSummary = emailsWithSummaries.filter(
    email => !email.email_summaries.length
  );

  // 3. Generate summaries only for new emails
  const newSummaries = await generateSummariesBatch(emailsNeedingSummary);

  // 4. Store new summaries in database
  await storeSummariesBatch(newSummaries);

  // 5. Return all summaries (cached + new)
  return allSummaries;
}
```

### 3. Benefits of Caching Solution

✅ **Cost Reduction**: 90%+ reduction in API costs  
✅ **Performance**: Near-instant loading after first generation  
✅ **Reliability**: No dependency on external API for cached data  
✅ **Analytics**: Track summary generation costs and usage  
✅ **Consistency**: Summaries remain stable across sessions  

### 4. Implementation Considerations

- **Cache Invalidation**: Summaries tied to email content hash
- **Batch Processing**: Generate multiple summaries efficiently
- **Error Handling**: Graceful fallback for failed generations
- **Cost Tracking**: Monitor and alert on usage thresholds
- **Version Management**: Handle model/prompt updates

## Usage Analytics

With the current schema, you can track:
- Summary generation frequency
- Cost per user/month
- Most common categories
- Confidence score distributions
- Processing performance metrics

## Security & Privacy

- Summaries inherit user-level access controls
- No sensitive data stored beyond original email content
- GDPR-compliant deletion when emails are removed
- Rate limiting to prevent abuse

## Future Enhancements

1. **Smart Refresh**: Detect content changes and regenerate selectively
2. **Batch Processing**: Generate summaries during off-peak hours
3. **Model Optimization**: Fine-tune models for school email patterns
4. **User Preferences**: Customizable summary formats and categories
5. **Integration**: Connect with calendar systems for date extraction
6. **Feedback Loop**: Allow users to rate summary quality for improvements

## Migration Path

1. **Phase 1**: Add database schema for summary storage
2. **Phase 2**: Implement caching logic in API
3. **Phase 3**: Add batch processing for existing emails
4. **Phase 4**: Add cost monitoring and alerts
5. **Phase 5**: Optimize based on usage patterns

---

**Next Steps**: Implement the database schema changes and modify the API to use caching to dramatically reduce costs and improve performance.

