import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { prompts } from '../config/prompts.js';

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
    return prompts.summaryPrompt
      .replace('{{sentDate}}', emailContent.sentDate)
      .replace('{{senderEmail}}', emailContent.senderEmail)
      .replace('{{subject}}', emailContent.subject)
      .replace('{{body}}', emailContent.body);
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
      
      // Check if it's a missing table error
      if (cacheError.message?.includes('email_summaries') || cacheError.code === '42P01') {
        return res.status(500).json({ 
          error: 'Email summaries table not found',
          details: 'The email_summaries table may not exist. Please run the database migration to create it.',
          migrationRequired: true
        });
      }
      
      return res.status(500).json({ 
        error: 'Failed to fetch cached summaries',
        details: cacheError.message || 'Unknown database error'
      });
    }

    if (!cachedSummaries || cachedSummaries.length === 0) {
      return res.status(200).json({ summaries: [] });
    }

    console.log(`Found ${cachedSummaries.length} emails, checking cache status...`);

    // Debug: Log cache status for all emails
    const cacheStats = cachedSummaries.map(email => ({
      id: email.id,
      subject: email.subject.substring(0, 50) + '...',
      hasSummary: email.email_summaries && email.email_summaries.length > 0,
      summaryCount: email.email_summaries?.length || 0
    }));
    console.log('Cache status for all emails:', cacheStats);

    // Step 2: Identify emails that need summary generation
    const emailsNeedingSummary: EmailNeedingSummary[] = [];
    const existingSummaries: CachedSummary[] = [];

    for (const email of cachedSummaries) {
      const hasCachedSummary = email.email_summaries && email.email_summaries.length > 0;

      if (forceRefresh) {
        console.log(`Force refresh requested for email ${email.id}: ${email.subject.substring(0, 50)}...`);
        emailsNeedingSummary.push({
          email_id: email.id,
          subject: email.subject,
          sender_email: email.sender_email,
          sent_date: email.sent_date,
          email_body_preview: email.email_body_preview,
          content_hash: email.content_hash
        });
      } else if (!hasCachedSummary) {
        console.log(`No cached summary found for email ${email.id}: ${email.subject.substring(0, 50)}...`);
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
        if (cachedSummary && cachedSummary.summary_data) {
          console.log(`✅ Using cached summary for email ${email.id}: ${email.subject.substring(0, 50)}...`);
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
        } else {
          console.warn(`❌ Cached summary invalid for email ${email.id}: missing summary_data`);
          emailsNeedingSummary.push({
            email_id: email.id,
            subject: email.subject,
            sender_email: email.sender_email,
            sent_date: email.sent_date,
            email_body_preview: email.email_body_preview,
            content_hash: email.content_hash
          });
        }
      }
    }

    console.log(`📊 Summary cache status: ${existingSummaries.length} cached, ${emailsNeedingSummary.length} need generation`);

    // Early return if all summaries are cached (most common case)
    if (emailsNeedingSummary.length === 0) {
      console.log(`🚀 All summaries are cached! Returning ${existingSummaries.length} cached summaries immediately`);
      const allSummaries = existingSummaries.sort((a, b) => new Date(b.sentDate).getTime() - new Date(a.sentDate).getTime());

      return res.status(200).json({
        summaries: allSummaries,
        metadata: {
          totalReturned: allSummaries.length,
          fromCache: existingSummaries.length,
          newlyGenerated: 0,
          estimatedCost: 0,
          hasMore: allSummaries.length >= Number(limit),
          allFromCache: true
        }
      });
    }

    // Step 3: Generate summaries for emails that need them
    const newSummaries: CachedSummary[] = [];

    if (emailsNeedingSummary.length > 0) {
      console.log(`⚡ Processing ${emailsNeedingSummary.length} emails that need new summaries...`);

      // Limit concurrent summary generation to prevent costs and rate limiting
      const maxConcurrentGeneration = Math.min(emailsNeedingSummary.length, 3);
      if (emailsNeedingSummary.length > maxConcurrentGeneration) {
        console.log(`⚠️  Limited to ${maxConcurrentGeneration} new summaries per request to control costs`);
        emailsNeedingSummary.splice(maxConcurrentGeneration); // Keep only the first N
      }

      const summaryProvider = createSummaryProvider('openai');

      for (const emailData of emailsNeedingSummary) {
        try {
          console.log(`🔄 Generating NEW summary for email ${emailData.email_id}: ${emailData.subject.substring(0, 50)}...`);

          // For summary generation, try to get the full email body instead of just the preview
          let fullEmailBody = emailData.email_body_preview || '';

          // If we only have a preview, try to get the full body from processed_emails
          if (fullEmailBody.length < 1000) { // Likely just a preview
            console.log(`Fetching full email body for better summary quality...`);
            const { data: fullEmail } = await supabase
              .from('processed_emails')
              .select('email_body_preview')
              .eq('id', emailData.email_id)
              .single();

            if (fullEmail && fullEmail.email_body_preview) {
              fullEmailBody = fullEmail.email_body_preview;
            }
          }

          const emailContent: EmailContent = {
            subject: emailData.subject,
            body: extractEmailText(fullEmailBody),
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

          if (storeError || !storedSummary) {
            console.error(`Failed to store summary for email ${emailData.email_id}:`, storeError);
            continue;
          }

          // Log summary generation to processing_history for dashboard tracking
          try {
            const processingStartTime = Date.now();
            const { error: historyError } = await supabase
              .from('processing_history')
              .insert({
                user_id: userId,
                session_id: null, // Summary generation is independent of sync sessions
                email_id: emailData.email_id,
                llm_provider: 'openai',
                model_name: 'gpt-4o-mini',
                processing_step: 'email_summary',
                processing_time: 2000, // Estimated time for summary generation (2 seconds)
                input_tokens: Math.ceil(estimatedTokens * 0.7), // Estimated 70% input
                output_tokens: Math.ceil(estimatedTokens * 0.3), // Estimated 30% output
                total_tokens: estimatedTokens,
                cost: estimatedCost,
                success_status: true,
                confidence_score: summary.confidence,
                retry_count: 0,
                error_message: null
              });

            if (historyError) {
              console.error(`Failed to log summary generation to processing_history for email ${emailData.email_id}:`, historyError);
              // Don't fail the entire operation if history logging fails
            } else {
              console.log(`✅ Logged email summary generation to processing_history: ${emailData.subject}`);
            }
          } catch (historyLogError) {
            console.error('Exception logging summary to processing_history:', historyLogError);
            // Continue processing even if logging fails
          }

          console.log(`✅ Successfully generated and stored summary for email ${emailData.email_id}`);

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

