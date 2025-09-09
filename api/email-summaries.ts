import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

// Utility functions
function extractEmailText(body: string): string {
  if (!body) return '';
  
  // Check if content appears to be HTML (contains HTML tags)
  const hasHtmlTags = /<[^>]+>/.test(body);
  
  if (hasHtmlTags) {
    return htmlToText(body);
  }
  
  // For plain text, just clean up whitespace
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
  
  // Replace common block elements with line breaks
  text = text.replace(/<\/?(div|p|br|h[1-6]|li|tr|td|th)[^>]*>/gi, '\n');
  
  // Replace list items with bullet points
  text = text.replace(/<li[^>]*>/gi, '\n• ');
  
  // Remove all other HTML tags
  text = text.replace(/<[^>]*>/g, '');
  
  // Decode common HTML entities
  const entities: { [key: string]: string } = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™'
  };
  
  // Replace HTML entities
  for (const [entity, replacement] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, 'gi'), replacement);
  }
  
  // Handle numeric HTML entities (like &#160; for non-breaking space)
  text = text.replace(/&#(\d+);/g, (_match, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });
  
  // Handle hex HTML entities (like &#x00A0; for non-breaking space)
  text = text.replace(/&#x([0-9A-F]+);/gi, (_match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  
  // Clean up whitespace
  text = text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Replace multiple line breaks with double line breaks
    .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
    .replace(/[ \t]*\n[ \t]*/g, '\n') // Remove spaces around line breaks
    .trim(); // Remove leading/trailing whitespace
  
  return text;
}

// Claude Service for summarization
class ClaudeService implements SummaryProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-5-sonnet-20241022') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async summarizeEmail(emailContent: EmailContent): Promise<SummaryResponse> {
    const prompt = this.createSummaryPrompt(emailContent);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1500,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.content[0]?.text;

      if (!content) {
        throw new Error('No response content from Claude');
      }

      const summary = JSON.parse(content);
      return this.validateSummaryResponse(summary);

    } catch (error) {
      console.error('Claude summary error:', error);
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
function createSummaryProvider(provider: 'claude' = 'claude'): SummaryProvider {
  const claudeKey = process.env.CLAUDE_API_KEY;
  if (!claudeKey) {
    throw new Error('Claude API key not found in environment variables');
  }
  return new ClaudeService(claudeKey, 'claude-3-5-sonnet-20241022');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, limit = 20, offset = 0 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Fetch processed emails with their body content
    const { data: emails, error: emailError } = await supabase
      .from('processed_emails')
      .select(`
        id,
        subject,
        sender_email,
        sent_date,
        email_body_preview,
        processing_status
      `)
      .eq('user_id', userId)
      .eq('processing_status', 'completed')
      .not('email_body_preview', 'is', null)
      .order('sent_date', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (emailError) {
      console.error('Error fetching emails:', emailError);
      return res.status(500).json({ error: 'Failed to fetch emails' });
    }

    if (!emails || emails.length === 0) {
      return res.status(200).json({ summaries: [] });
    }

    // Generate summaries for emails
    const summaryProvider = createSummaryProvider('claude'); // Using Claude for better summarization
    const summaries = [];

    for (const email of emails) {
      try {
        const emailContent: EmailContent = {
          subject: email.subject,
          body: extractEmailText(email.email_body_preview || ''),
          senderEmail: email.sender_email,
          sentDate: email.sent_date
        };

        const summary = await summaryProvider.summarizeEmail(emailContent);
        
        summaries.push({
          id: email.id,
          emailId: email.id,
          userId: userId,
          subject: email.subject,
          senderEmail: email.sender_email,
          sentDate: new Date(email.sent_date),
          summary: summary,
          confidence: summary.confidence,
          generatedAt: new Date(),
          emailBodyPreview: email.email_body_preview?.substring(0, 200) + '...'
        });

      } catch (summaryError) {
        console.error(`Failed to summarize email ${email.id}:`, summaryError);
        // Continue with other emails even if one fails
      }
    }

    res.status(200).json({ summaries });

  } catch (error) {
    console.error('Email summaries API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
