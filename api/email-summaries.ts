import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Types
interface EmailContent {
  subject: string;
  body: string;
  senderEmail: string;
  sentDate: string;
}

interface SummaryResponse {
  keyPoints: string[]
  importantDates: Array<{
    date: string
    description: string
    originalText: string
  }>
  actionItems: string[]
  categories: string[]
  confidence: number
}

interface SummaryProvider {
  summarizeEmail(emailContent: EmailContent): Promise<SummaryResponse>;
}

interface CachedSummary {
  id: string;
  emailId: string;
  userId: string;
  subject: string;
  senderEmail: string;
  sentDate: Date;
  summary: SummaryResponse;
  confidence: number;
  generatedAt: Date;
  emailBodyPreview?: string;
}

interface EmailNeedingSummary {
  email_id: string;
  subject: string;
  sender_email: string;
  sent_date: string;
  email_body_preview: string;
  content_hash: string;
}

// Utility functions (same as original)
function extractEmailText(body: string): string {
  if (!body) return '';
  
  const hasHtmlTags = /<[^>]+>/.test(body);
  
  if (hasHtmlTags) {
    return htmlToText(body);
  }
  
  return body
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function htmlToText(html: string): string {
  if (!html) return '';
  
  let text = html;
  text = text.replace(/<\/?(div|p|br|h[1-6]|li|tr|td|th)[^>]*>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '\n• ');
  text = text.replace(/<[^>]*>/g, '');
  
  const entities: { [key: string]: string } = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
    '&apos;': "'", '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—',
    '&hellip;': '…', '&copy;': '©', '&reg;': '®', '&trade;': '™'
  };
  
  for (const [entity, replacement] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, 'gi'), replacement);
  }
  
  text = text.replace(/&#(\d+);/g, (_match, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });
  
  text = text.replace(/&#x([0-9A-F]+);/gi, (_match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
}

// OpenAI Service (same as original)
class OpenAIService implements SummaryProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async summarizeEmail(emailContent: EmailContent): Promise<SummaryResponse> {
    const prompt = this.createSummaryPrompt(emailContent);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant that creates comprehensive, clean summaries of school emails. Focus on extracting key information, important dates, and actionable items in a well-structured format.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.2,
          max_tokens: 1500
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      const summary = JSON.parse(content);
      return this.validateSummaryResponse(summary);

    } catch (error) {
      console.error('OpenAI summary error:', error);
      throw new Error(`Failed to summarize email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private createSummaryPrompt(emailContent: EmailContent): string {
    return `Create a comprehensive summary of this school email:

Email Details:
- Sent Date: ${emailContent.sentDate}
- From: ${emailContent.senderEmail}  
- Subject: ${emailContent.subject}

Email Content:
${emailContent.body}

Instructions:
1. Extract key points as clear, concise bullet points
2. Identify important dates with their original context (e.g., "Lunch on Thursday is chicken nuggets")
3. List actionable items that require parent/student response
4. Categorize the email type (e.g., "Academic", "Events", "Administrative", "Food Service", "Transportation")
5. Provide a confidence score (0-1) for the summary accuracy

Return a JSON object with this exact structure:
{
  "keyPoints": [
    "Clear, concise summary points about the main content",
    "Include important details and context"
  ],
  "importantDates": [
    {
      "date": "2024-03-15", 
      "description": "Event or deadline description",
      "originalText": "Original text from email mentioning this date"
    }
  ],
  "actionItems": [
    "Things that require parent/student action",
    "Deadlines or responses needed"
  ],
  "categories": ["Primary category", "Secondary category"],
  "confidence": 0.95
}

Focus on being comprehensive yet concise. Keep the original context and tone when possible.`;
  }

  private validateSummaryResponse(summary: any): SummaryResponse {
    return {
      keyPoints: Array.isArray(summary.keyPoints) ? summary.keyPoints : [],
      importantDates: Array.isArray(summary.importantDates) ? summary.importantDates : [],
      actionItems: Array.isArray(summary.actionItems) ? summary.actionItems : [],
      categories: Array.isArray(summary.categories) ? summary.categories : [],
      confidence: typeof summary.confidence === 'number' ? Math.max(0, Math.min(1, summary.confidence)) : 0.8
    };
  }
}

// Factory function to create summary provider
function createSummaryProvider(provider: 'openai' = 'openai'): SummaryProvider {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('OpenAI API key not found in environment variables');
  }
  return new OpenAIService(openaiKey, 'gpt-4o-mini');
}

// Calculate token usage estimate for cost tracking
function estimateTokenUsage(emailContent: EmailContent): number {
  const promptLength = 800; // Approximate prompt length
  const contentLength = emailContent.subject.length + emailContent.body.length + emailContent.senderEmail.length;
  const responseLength = 500; // Estimated response length
  
  // Rough token estimation (1 token ≈ 4 characters)
  return Math.ceil((promptLength + contentLength + responseLength) / 4);
}

// Calculate cost based on token usage
function calculateCost(tokens: number, model: string = 'gpt-4o-mini'): number {
  // GPT-4o-mini pricing: $0.00015 per 1K input tokens, $0.0006 per 1K output tokens
  // Simplified: assume 70% input, 30% output
  const inputTokens = Math.ceil(tokens * 0.7);
  const outputTokens = Math.ceil(tokens * 0.3);
  
  const inputCost = (inputTokens / 1000) * 0.00015;
  const outputCost = (outputTokens / 1000) * 0.0006;
  
  return inputCost + outputCost;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, limit = 20, offset = 0, forceRefresh = false } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    console.log(`Fetching summaries for user ${userId}, limit: ${limit}, offset: ${offset}`);

    // Step 1: Fetch cached summaries from database
    const { data: cachedSummaries, error: cacheError } = await supabase
      .from('processed_emails')
      .select(`
        id,
        subject,
        sender_email,
        sent_date,
        email_body_preview,
        content_hash,
        email_summaries (
          id,
          summary_data,
          confidence_score,
          generated_at,
          processing_cost
        )
      `)
      .eq('user_id', userId)
      .eq('processing_status', 'completed')
      .not('email_body_preview', 'is', null)
      .order('sent_date', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (cacheError) {
      console.error('Error fetching cached summaries:', cacheError);
      return res.status(500).json({ error: 'Failed to fetch cached summaries' });
    }

    if (!cachedSummaries || cachedSummaries.length === 0) {
      return res.status(200).json({ summaries: [] });
    }

    console.log(`Found ${cachedSummaries.length} emails, checking cache status...`);

    // Step 2: Identify emails that need summary generation
    const emailsNeedingSummary: EmailNeedingSummary[] = [];
    const existingSummaries: CachedSummary[] = [];

    for (const email of cachedSummaries) {
      if (!email.email_summaries || email.email_summaries.length === 0 || forceRefresh) {
        // No cached summary exists or force refresh requested
        emailsNeedingSummary.push({
          email_id: email.id,
          subject: email.subject,
          sender_email: email.sender_email,
          sent_date: email.sent_date,
          email_body_preview: email.email_body_preview,
          content_hash: email.content_hash
        });
      } else {
        // Use cached summary
        const cachedSummary = email.email_summaries[0];
        existingSummaries.push({
          id: cachedSummary.id,
          emailId: email.id,
          userId: userId as string,
          subject: email.subject,
          senderEmail: email.sender_email,
          sentDate: new Date(email.sent_date),
          summary: cachedSummary.summary_data as SummaryResponse,
          confidence: cachedSummary.confidence_score,
          generatedAt: new Date(cachedSummary.generated_at),
          emailBodyPreview: email.email_body_preview?.substring(0, 200) + '...'
        });
      }
    }

    console.log(`Using ${existingSummaries.length} cached summaries, generating ${emailsNeedingSummary.length} new summaries`);

    // Step 3: Generate summaries for emails that need them
    const newSummaries: CachedSummary[] = [];
    
    if (emailsNeedingSummary.length > 0) {
      const summaryProvider = createSummaryProvider('openai');

      for (const emailData of emailsNeedingSummary) {
        try {
          console.log(`Generating summary for email ${emailData.email_id}...`);

          const emailContent: EmailContent = {
            subject: emailData.subject,
            body: extractEmailText(emailData.email_body_preview || ''),
            senderEmail: emailData.sender_email,
            sentDate: emailData.sent_date
          };

          const summary = await summaryProvider.summarizeEmail(emailContent);
          const estimatedTokens = estimateTokenUsage(emailContent);
          const estimatedCost = calculateCost(estimatedTokens);

          // Store the summary in database
          const { data: storedSummary, error: storeError } = await supabase
            .from('email_summaries')
            .upsert({
              email_id: emailData.email_id,
              user_id: userId,
              summary_data: summary,
              confidence_score: summary.confidence,
              llm_provider: 'openai',
              model_name: 'gpt-4o-mini',
              processing_tokens: estimatedTokens,
              processing_cost: estimatedCost,
              content_hash: emailData.content_hash
            }, {
              onConflict: 'email_id'
            })
            .select()
            .single();

          if (storeError) {
            console.error(`Failed to store summary for email ${emailData.email_id}:`, storeError);
            continue;
          }

          console.log(`Successfully generated and stored summary for email ${emailData.email_id}`);

          newSummaries.push({
            id: storedSummary.id,
            emailId: emailData.email_id,
            userId: userId as string,
            subject: emailData.subject,
            senderEmail: emailData.sender_email,
            sentDate: new Date(emailData.sent_date),
            summary: summary,
            confidence: summary.confidence,
            generatedAt: new Date(),
            emailBodyPreview: emailData.email_body_preview?.substring(0, 200) + '...'
          });

        } catch (summaryError) {
          console.error(`Failed to generate summary for email ${emailData.email_id}:`, summaryError);
          // Continue with other emails even if one fails
        }
      }
    }

    // Step 4: Combine cached and new summaries, maintain order by sent_date
    const allSummaries = [...existingSummaries, ...newSummaries]
      .sort((a, b) => new Date(b.sentDate).getTime() - new Date(a.sentDate).getTime());

    console.log(`Returning ${allSummaries.length} total summaries (${existingSummaries.length} cached + ${newSummaries.length} new)`);

    // Step 5: Add usage statistics to response
    const totalCost = newSummaries.reduce((sum, s) => sum + (calculateCost(estimateTokenUsage({
      subject: s.subject,
      body: s.emailBodyPreview || '',
      senderEmail: s.senderEmail,
      sentDate: s.sentDate.toISOString()
    }))), 0);

    res.status(200).json({ 
      summaries: allSummaries,
      metadata: {
        totalReturned: allSummaries.length,
        fromCache: existingSummaries.length,
        newlyGenerated: newSummaries.length,
        estimatedCost: totalCost.toFixed(6),
        hasMore: allSummaries.length >= Number(limit)
      }
    });

  } catch (error) {
    console.error('Email summaries API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

