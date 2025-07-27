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

// Helper function to create event hash for deduplication
function createEventHash(userId: string, title: string, date: string, time?: string): string {
  const eventKey = `${userId}:${title.toLowerCase().trim()}:${date}:${time || 'no-time'}`;
  return crypto.createHash('md5').update(eventKey).digest('hex');
}

// Helper function to clean up duplicate events
async function cleanupDuplicateEvents(supabase: any, userId: string): Promise<number> {
  console.log('Starting duplicate event cleanup...');
  
  // Find duplicate events based on user_id, event_title, event_date, and event_time
  const { data: duplicates, error } = await supabase.rpc('find_duplicate_events', {
    p_user_id: userId
  });

  if (error) {
    console.error('Error finding duplicates:', error);
    // If the RPC doesn't exist, fall back to manual cleanup
    return await manualCleanupDuplicates(supabase, userId);
  }

  let deletedCount = 0;
  for (const duplicate of duplicates || []) {
    // Keep the oldest event (first extracted) and delete the rest
    const { error: deleteError } = await supabase
      .from('extracted_dates')
      .delete()
      .eq('id', duplicate.id);
    
    if (!deleteError) {
      deletedCount++;
    }
  }

  console.log(`Cleaned up ${deletedCount} duplicate events`);
  return deletedCount;
}

// Manual fallback cleanup method
async function manualCleanupDuplicates(supabase: any, userId: string): Promise<number> {
  console.log('Performing manual duplicate cleanup...');
  
  // Get all events for the user
  const { data: events, error } = await supabase
    .from('extracted_dates')
    .select('*')
    .eq('user_id', userId)
    .order('extracted_at', { ascending: true });

  if (error) {
    console.error('Error fetching events for cleanup:', error);
    return 0;
  }

  const eventMap = new Map<string, any>();
  const duplicatesToDelete: string[] = [];

  // Group events by their unique identifier
  for (const event of events) {
    const eventKey = `${event.event_title.toLowerCase().trim()}:${event.event_date}:${event.event_time || 'no-time'}`;
    
    if (eventMap.has(eventKey)) {
      // This is a duplicate, mark for deletion
      duplicatesToDelete.push(event.id);
    } else {
      // This is the first occurrence, keep it
      eventMap.set(eventKey, event);
    }
  }

  // Delete duplicates
  let deletedCount = 0;
  for (const eventId of duplicatesToDelete) {
    const { error: deleteError } = await supabase
      .from('extracted_dates')
      .delete()
      .eq('id', eventId);
    
    if (!deleteError) {
      deletedCount++;
    }
  }

  console.log(`Manually cleaned up ${deletedCount} duplicate events`);
  return deletedCount;
}

// Helper function to check if event already exists
async function eventExists(
  supabase: any, 
  userId: string, 
  title: string, 
  date: string, 
  time?: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('extracted_dates')
    .select('id')
    .eq('user_id', userId)
    .eq('event_title', title.trim())
    .eq('event_date', date)
    .eq('event_time', time || null)
    .limit(1);

  if (error) {
    console.error('Error checking event existence:', error);
    return false;
  }

  return data && data.length > 0;
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

      // Clean and parse JSON response (handle markdown code blocks)
      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      console.log('OpenAI raw response:', content);
      console.log('Cleaned content for JSON parsing:', cleanedContent);
      
      let events;
      try {
        events = JSON.parse(cleanedContent);
      } catch (parseError) {
        console.error('JSON parsing failed. Raw content:', content);
        console.error('Cleaned content:', cleanedContent);
        throw new Error(`Invalid JSON response from OpenAI: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
      }
      
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

2. Convert relative dates (like "this Friday", "next week") to absolute dates based on the email sent date: ${emailContent.sentDate}
3. Include only future dates (after the email sent date)
4. When parsing dates, be very careful about the day of the week mentioned in the email
5. If a specific day of the week is mentioned (like "Monday"), make sure the date you extract actually falls on that day
6. Provide a confidence score (0-1) for each extracted date
7. Extract meaningful event titles and descriptions

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
      const errorText = await response.text();
      console.error(`Gmail API listMessages error: ${response.status} ${response.statusText}`, errorText);
      
      if (response.status === 401) {
        throw new Error('Gmail access token expired or invalid');
      } else if (response.status === 403) {
        throw new Error('Gmail API access forbidden - check OAuth scopes and permissions');
      } else if (response.status === 429) {
        throw new Error('Gmail API rate limit exceeded');
      } else {
        throw new Error(`Failed to list messages: ${response.status} ${response.statusText}`);
      }
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
      const errorText = await response.text();
      console.error(`Gmail API getMessage error: ${response.status} ${response.statusText}`, errorText);
      
      if (response.status === 401) {
        throw new Error('Gmail access token expired or invalid');
      } else if (response.status === 403) {
        throw new Error('Gmail API access forbidden - check OAuth scopes and permissions');
      } else if (response.status === 429) {
        throw new Error('Gmail API rate limit exceeded');
      } else {
        throw new Error(`Failed to get message: ${response.status} ${response.statusText}`);
      }
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
    const { userId, accessToken: initialAccessToken, refreshToken, forceReprocess = false } = req.body;
    console.log('Request body parsed, userId:', userId, 'forceReprocess:', forceReprocess);

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

    // If force reprocess is enabled, clean up existing data first
    let cleanupCount = 0;
    if (forceReprocess) {
      console.log('Force reprocess enabled, cleaning up existing data...');
      
      // Clean up duplicate events first
      cleanupCount = await cleanupDuplicateEvents(supabase, userId);
      
      // Optionally, if user wants to completely start over, remove all processed emails
      // This would cause all emails to be reprocessed
      // const { error: deleteEmailsError } = await supabase
      //   .from('processed_emails')
      //   .delete()
      //   .eq('user_id', userId);
      
      // const { error: deleteDatesError } = await supabase
      //   .from('extracted_dates')
      //   .delete()
      //   .eq('user_id', userId);
      
      console.log(`Cleanup completed. Removed ${cleanupCount} duplicate events.`);
    } else {
      // Even on normal sync, clean up duplicates
      console.log('Performing routine duplicate cleanup...');
      cleanupCount = await cleanupDuplicateEvents(supabase, userId);
    }

    // Handle token refresh if needed
    let accessToken = initialAccessToken;
    let tokenRefreshed = false;
    
    const validateAndRefreshToken = async (token: string): Promise<string> => {
      try {
        // Test Gmail API access specifically with a simple call
        const testResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (testResponse.ok) {
          return token; // Token is valid
        }

        // If token is invalid and we have a refresh token, try to refresh
        if ((testResponse.status === 401 || testResponse.status === 403) && refreshToken && !tokenRefreshed) {
          console.log('Access token invalid, attempting refresh...');
          const refreshedTokens = await gmailService.refreshAccessToken(refreshToken);
          tokenRefreshed = true;
          console.log('Token refreshed successfully');
          return refreshedTokens.accessToken;
        }

        throw new Error(`Gmail API access failed: ${testResponse.status} ${testResponse.statusText}`);
      } catch (error) {
        console.error('Token validation error:', error);
        
        // Try refresh token as last resort
        if (refreshToken && !tokenRefreshed) {
          try {
            console.log('Attempting token refresh as last resort...');
            const refreshedTokens = await gmailService.refreshAccessToken(refreshToken);
            tokenRefreshed = true;
            console.log('Token refreshed successfully');
            return refreshedTokens.accessToken;
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            throw new Error('Authentication failed - unable to refresh Gmail access token');
          }
        }
        
        throw error;
      }
    };

    try {
      accessToken = await validateAndRefreshToken(accessToken);
    } catch (authError) {
      console.error('Authentication error:', authError);
      return res.status(401).json({ 
        error: 'Authentication failed', 
        message: authError instanceof Error ? authError.message : 'Gmail API access denied'
      });
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
        processed: 0,
        duplicatesRemoved: cleanupCount
      });
    }

    // Build Gmail search query (reduced to 7 days for testing)
    const senderEmails = emailSources.map(source => source.email);
    const query = `from:(${senderEmails.join(' OR ')}) newer_than:7d`;
    console.log(`Gmail search query: ${query}`);
    console.log(`Searching for emails from ${senderEmails.length} configured sources: ${senderEmails.join(', ')}`);

    // Fetch emails from Gmail (reduced to 10 for testing)
    const messagesResponse = await gmailService.listMessages(accessToken, {
      maxResults: 10,
      q: query
    });

    console.log(`Gmail API returned ${messagesResponse.messages.length} messages`);
    
    if (!messagesResponse.messages || messagesResponse.messages.length === 0) {
      console.log('No messages found matching the search query');
      return res.status(200).json({
        message: 'No emails found matching the configured sources',
        processed: 0,
        extracted: 0,
        duplicatesRemoved: cleanupCount,
        emails: [],
        dates: []
      });
    }

    const processedEmails: any[] = [];
    const extractedDates: any[] = [];
    let skippedDuplicateEmails = 0;
    let skippedDuplicateEvents = 0;

    console.log(`Starting to process ${messagesResponse.messages.length} messages...`);

    // Process each email
    for (let i = 0; i < messagesResponse.messages.length; i++) {
      const messageRef = messagesResponse.messages[i];
      console.log(`Processing email ${i + 1}/${messagesResponse.messages.length}, ID: ${messageRef.id}`);
      
      try {
        // Get full message details with retry logic for token refresh
        console.log(`Fetching message details for ${messageRef.id}...`);
        let message;
        try {
          message = await gmailService.getMessage(accessToken, messageRef.id);
          console.log(`Successfully fetched message ${messageRef.id}`);
        } catch (gmailError) {
          // If Gmail API call fails with auth error, try to refresh token once
          if (gmailError instanceof Error && 
              (gmailError.message.includes('expired') || gmailError.message.includes('invalid') || gmailError.message.includes('forbidden')) &&
              refreshToken && !tokenRefreshed) {
            console.log('Gmail API call failed, attempting token refresh...');
            try {
              const refreshedTokens = await gmailService.refreshAccessToken(refreshToken);
              accessToken = refreshedTokens.accessToken;
              tokenRefreshed = true;
              console.log('Token refreshed, retrying Gmail API call...');
              message = await gmailService.getMessage(accessToken, messageRef.id);
            } catch (refreshError) {
              console.error('Token refresh failed during processing:', refreshError);
              throw gmailError; // Re-throw original error
            }
          } else {
            throw gmailError;
          }
        }
        
        // Extract content
        const { subject, body, from, date } = gmailService.extractTextFromMessage(message);
        console.log(`Extracted content - Subject: "${subject}", From: "${from}", Body length: ${body.length} chars`);
        
        // Create content hash for deduplication
        const contentHash = crypto
          .createHash('md5')
          .update(subject + body + from + date)
          .digest('hex');

        console.log(`Checking for existing email with ID: ${messageRef.id}`);
        // Check if email is already processed (unless force reprocess is enabled)
        if (!forceReprocess) {
          const { data: existingEmail } = await supabase
            .from('processed_emails')
            .select('id')
            .eq('gmail_message_id', messageRef.id)
            .single();

          if (existingEmail) {
            console.log(`Email ${messageRef.id} already processed, skipping...`);
            skippedDuplicateEmails++;
            continue; // Skip already processed emails
          }

          // Also check by content hash for more robust deduplication
          const { data: existingByHash } = await supabase
            .from('processed_emails')
            .select('id')
            .eq('content_hash', contentHash)
            .eq('user_id', userId)
            .single();

          if (existingByHash) {
            console.log(`Email with same content already processed, skipping...`);
            skippedDuplicateEmails++;
            continue;
          }
        }

        console.log(`Email ${messageRef.id} is new, storing in database...`);
        // Store processed email (or update if force reprocessing)
        const { data: processedEmail, error: emailError } = await supabase
          .from('processed_emails')
          .upsert({
            user_id: userId,
            gmail_message_id: messageRef.id,
            sender_email: from,
            subject: subject,
            sent_date: new Date(date).toISOString(),
            content_hash: contentHash,
            has_attachments: message.payload.parts?.some((part: any) => part.filename) || false,
            processed_at: new Date().toISOString()
          }, {
            onConflict: 'gmail_message_id'
          })
          .select()
          .single();

        if (emailError) {
          console.error('Error storing email:', emailError);
          continue;
        }

        console.log(`Successfully stored email ${messageRef.id} in database`);
        processedEmails.push(processedEmail);

        // Extract dates using OpenAI
        console.log(`Calling OpenAI to extract dates from email: "${subject}"`);
        const startTime = Date.now();
        const extractedEvents = await openaiService.extractDates({
          subject,
          body,
          senderEmail: from,
          sentDate: date
        });

        const processingTime = Date.now() - startTime;
        console.log(`OpenAI processing completed in ${processingTime}ms, found ${extractedEvents.length} events`);

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

        // Store extracted dates with deduplication
        for (const event of extractedEvents) {
          console.log(`Checking if event already exists: "${event.title}" on ${event.date}`);
          
          // Check if this exact event already exists for this user
          const exists = await eventExists(supabase, userId, event.title, event.date, event.time);
          
          if (exists && !forceReprocess) {
            console.log(`Event "${event.title}" on ${event.date} already exists, skipping...`);
            skippedDuplicateEvents++;
            continue;
          }

          console.log(`Storing extracted event: "${event.title}" on ${event.date}`);
          const { data: extractedDate, error: dateError } = await supabase
            .from('extracted_dates')
            .upsert({
              email_id: processedEmail.id,
              user_id: userId,
              event_title: event.title,
              event_date: event.date,
              event_time: event.time,
              description: event.description,
              confidence_score: event.confidence,
              is_verified: false,
              extracted_at: new Date().toISOString()
            }, {
              onConflict: 'user_id,event_title,event_date,event_time',
              ignoreDuplicates: !forceReprocess
            })
            .select()
            .single();

          if (!dateError && extractedDate) {
            extractedDates.push(extractedDate);
          } else if (dateError) {
            console.error('Error storing extracted date:', dateError);
          }
        }

        console.log(`Completed processing email ${i + 1}/${messagesResponse.messages.length}`);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error processing email ${messageRef.id}:`, error);
        
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

    console.log(`Finished processing all emails. Total processed: ${processedEmails.length}, Total dates extracted: ${extractedDates.length}, Skipped duplicate emails: ${skippedDuplicateEmails}, Skipped duplicate events: ${skippedDuplicateEvents}`);

    // Update user's last sync timestamp
    await supabase
      .from('users')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', userId);

    console.log('Updated user last sync timestamp');

    const responseMessage = forceReprocess 
      ? 'Email reprocessing completed successfully'
      : 'Email sync completed successfully';

    res.status(200).json({
      message: responseMessage,
      processed: processedEmails.length,
      extracted: extractedDates.length,
      duplicatesRemoved: cleanupCount,
      skippedDuplicateEmails,
      skippedDuplicateEvents,
      forceReprocess,
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