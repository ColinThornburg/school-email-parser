import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { VercelRequest, VercelResponse } from '@vercel/node';

// LLM Response interface
interface LLMResponse {
  title: string;
  date: string;
  time?: string;
  description: string;
  confidence: number;
}

// Email Content interface
interface EmailContent {
  subject: string;
  body: string;
  senderEmail: string;
  sentDate: string;
}

// Gmail Token interface
interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// OpenAI Service class
class OpenAIService {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4-turbo-preview') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async extractDates(emailContent: EmailContent): Promise<LLMResponse[]> {
    const prompt = this.createPrompt(emailContent);

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
              content: 'You are an AI assistant that extracts important dates and events from school emails. Focus on academic deadlines, events, meetings, and other time-sensitive information. Return only valid JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
          max_tokens: 1000
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

      // Parse JSON response
      const events = JSON.parse(content);
      
      // Validate and normalize the response
      return this.validateAndNormalizeResponse(events, emailContent.sentDate);

    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`Failed to extract dates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private createPrompt(emailContent: EmailContent): string {
    return `Extract all important dates from this school email:

Email Details:
- Sent Date: ${emailContent.sentDate}
- From: ${emailContent.senderEmail}
- Subject: ${emailContent.subject}

Email Content:
${emailContent.body}

Instructions:
1. Focus on school-related events like:
   - Assignment deadlines
   - Test dates
   - Parent-teacher conferences
   - School events
   - Field trips
   - School holidays
   - Registration deadlines
   - Meeting dates

2. Convert relative dates (like "this Friday", "next week") to absolute dates based on the email sent date
3. Include only future dates (after the email sent date)
4. Provide a confidence score (0-1) for each extracted date
5. Extract meaningful event titles and descriptions

Return a JSON array with this exact structure:
[
  {
    "title": "Event or deadline title",
    "date": "YYYY-MM-DD",
    "time": "HH:MM" (optional, use 24-hour format),
    "description": "Brief description of the event",
    "confidence": 0.95
  }
]

If no dates are found, return an empty array: []`;
  }

  private validateAndNormalizeResponse(events: any[], sentDate: string): LLMResponse[] {
    if (!Array.isArray(events)) {
      return [];
    }

    const sentDateTime = new Date(sentDate);
    const validEvents: LLMResponse[] = [];

    for (const event of events) {
      // Validate required fields
      if (!event.title || !event.date || typeof event.confidence !== 'number') {
        continue;
      }

      // Validate date format
      const eventDate = new Date(event.date);
      if (isNaN(eventDate.getTime())) {
        continue;
      }

      // Only include future dates
      if (eventDate <= sentDateTime) {
        continue;
      }

      // Validate confidence score
      const confidence = Math.max(0, Math.min(1, event.confidence));

      validEvents.push({
        title: String(event.title).trim(),
        date: event.date,
        time: event.time || undefined,
        description: event.description ? String(event.description).trim() : '',
        confidence: confidence
      });
    }

    return validEvents;
  }
}

// Gmail Service class
class GmailService {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  // Refresh access token
  async refreshAccessToken(refreshToken: string): Promise<GmailTokens> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: refreshToken, // Refresh token usually doesn't change
      expiresAt: Date.now() + (data.expires_in * 1000)
    };
  }

  // List messages from Gmail
  async listMessages(
    accessToken: string,
    options: {
      maxResults?: number;
      pageToken?: string;
      q?: string; // Gmail search query
    } = {}
  ): Promise<{
    messages: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
  }> {
    const params = new URLSearchParams({
      maxResults: (options.maxResults || 10).toString(),
      ...(options.pageToken && { pageToken: options.pageToken }),
      ...(options.q && { q: options.q }),
    });

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list messages: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      messages: data.messages || [],
      nextPageToken: data.nextPageToken
    };
  }

  // Get a specific message
  async getMessage(accessToken: string, messageId: string): Promise<any> {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get message: ${response.statusText}`);
    }

    return await response.json();
  }

  // Extract text content from Gmail message
  extractTextFromMessage(message: any): {
    subject: string;
    body: string;
    from: string;
    date: string;
  } {
    const headers = message.payload.headers;
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    let body = '';
    
    // Extract body text recursively
    const extractBody = (part: any): string => {
      if (part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      
      if (part.parts) {
        return part.parts.map(extractBody).join('\n');
      }
      
      return '';
    };

    if (message.payload.body?.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    } else if (message.payload.parts) {
      body = message.payload.parts.map(extractBody).join('\n');
    }

    // Clean HTML tags from body
    body = body.replace(/<[^>]*>/g, '').trim();

    return { subject, body, from, date };
  }
}

// Helper function to estimate token usage
function estimateTokenUsage(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

// Serverless function handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('Sync emails function called');
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check required environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase environment variables');
    }
    console.log('Environment variables check passed');

    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    console.log('Supabase client initialized');

    // Get user and access token from request
    const { userId, accessToken: initialAccessToken, refreshToken } = req.body;
    console.log('Request body parsed, userId:', userId);

    if (!userId || !initialAccessToken) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Check Gmail environment variables
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
      throw new Error('Missing Gmail environment variables');
    }

    // Check OpenAI environment variable
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OpenAI API key');
    }

    // Initialize services
    console.log('Initializing Gmail service');
    const gmailService = new GmailService(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET
    );

    console.log('Initializing OpenAI service');
    const openaiService = new OpenAIService(process.env.OPENAI_API_KEY);
    console.log('Services initialized successfully');

    // Handle token refresh if needed
    let accessToken = initialAccessToken;
    try {
      // Test the current token by making a simple API call
      const testResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!testResponse.ok && refreshToken) {
        console.log('Access token expired, refreshing...');
        const refreshedTokens = await gmailService.refreshAccessToken(refreshToken);
        accessToken = refreshedTokens.accessToken;
        console.log('Token refreshed successfully');
      }
    } catch (error) {
      console.error('Token validation/refresh error:', error);
      if (refreshToken) {
        try {
          const refreshedTokens = await gmailService.refreshAccessToken(refreshToken);
          accessToken = refreshedTokens.accessToken;
          console.log('Token refreshed after error');
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          return res.status(401).json({ error: 'Authentication failed - unable to refresh token' });
        }
      } else {
        return res.status(401).json({ error: 'Authentication failed - no refresh token available' });
      }
    }

    // Get email sources for the user
    const { data: emailSources, error: sourcesError } = await supabase
      .from('email_sources')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (sourcesError) {
      throw new Error(`Failed to fetch email sources: ${sourcesError.message}`);
    }

    if (!emailSources || emailSources.length === 0) {
      return res.status(200).json({ 
        message: 'No email sources configured', 
        processed: 0 
      });
    }

    // Build Gmail search query
    const senderEmails = emailSources.map(source => source.email);
    const query = `from:(${senderEmails.join(' OR ')}) newer_than:30d`;

    // Fetch emails from Gmail
    const messagesResponse = await gmailService.listMessages(accessToken, {
      maxResults: 50,
      q: query
    });

    const processedEmails: any[] = [];
    const extractedDates: any[] = [];

    // Process each email
    for (const messageRef of messagesResponse.messages) {
      try {
        // Get full message details
        const message = await gmailService.getMessage(accessToken, messageRef.id);
        
        // Extract content
        const { subject, body, from, date } = gmailService.extractTextFromMessage(message);
        
        // Create content hash for deduplication
        const contentHash = crypto
          .createHash('md5')
          .update(subject + body + from + date)
          .digest('hex');

        // Check if email is already processed
        const { data: existingEmail } = await supabase
          .from('processed_emails')
          .select('id')
          .eq('gmail_message_id', messageRef.id)
          .single();

        if (existingEmail) {
          continue; // Skip already processed emails
        }

        // Store processed email
        const { data: processedEmail, error: emailError } = await supabase
          .from('processed_emails')
          .insert({
            user_id: userId,
            gmail_message_id: messageRef.id,
            sender_email: from,
            subject: subject,
            sent_date: new Date(date).toISOString(),
            content_hash: contentHash,
            has_attachments: message.payload.parts?.some((part: any) => part.filename) || false
          })
          .select()
          .single();

        if (emailError) {
          console.error('Error storing email:', emailError);
          continue;
        }

        processedEmails.push(processedEmail);

        // Extract dates using OpenAI
        const startTime = Date.now();
        const extractedEvents = await openaiService.extractDates({
          subject,
          body,
          senderEmail: from,
          sentDate: date
        });

        const processingTime = Date.now() - startTime;

        // Store processing history
        await supabase
          .from('processing_history')
          .insert({
            user_id: userId,
            email_id: processedEmail.id,
            llm_provider: 'openai',
            processing_time: processingTime,
            token_usage: estimateTokenUsage(subject + body),
            success_status: true
          });

        // Store extracted dates
        for (const event of extractedEvents) {
          const { data: extractedDate } = await supabase
            .from('extracted_dates')
            .insert({
              email_id: processedEmail.id,
              user_id: userId,
              event_title: event.title,
              event_date: event.date,
              event_time: event.time,
              description: event.description,
              confidence_score: event.confidence,
              is_verified: false
            })
            .select()
            .single();

          if (extractedDate) {
            extractedDates.push(extractedDate);
          }
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error('Error processing email:', error);
        
        // Store failed processing history
        if (processedEmails.length > 0) {
          await supabase
            .from('processing_history')
            .insert({
              user_id: userId,
              email_id: processedEmails[processedEmails.length - 1].id,
              llm_provider: 'openai',
              processing_time: 0,
              token_usage: 0,
              success_status: false,
              error_message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
      }
    }

    // Update user's last sync timestamp
    await supabase
      .from('users')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', userId);

    res.status(200).json({
      message: 'Email sync completed successfully',
      processed: processedEmails.length,
      extracted: extractedDates.length,
      emails: processedEmails,
      dates: extractedDates
    });

  } catch (error) {
    console.error('Sync emails error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 