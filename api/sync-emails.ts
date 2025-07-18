import { createClient } from '@supabase/supabase-js';
import { createLLMProvider } from '../src/lib/llm';
import { GmailService } from '../src/lib/gmail';
import * as crypto from 'crypto';
import { VercelRequest, VercelResponse } from '@vercel/node';

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
    const { userId, accessToken, refreshToken } = req.body;
    console.log('Request body parsed, userId:', userId);

    if (!userId || !accessToken) {
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
    const gmailService = new GmailService({
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      redirectUri: process.env.GMAIL_REDIRECT_URI || `${req.headers.host}/auth/callback`,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly']
    });

    console.log('Initializing LLM provider');
    const llmProvider = createLLMProvider('openai');
    console.log('Services initialized successfully');

    // Get email sources for the user
    const { data: emailSources } = await supabase
      .from('email_sources')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

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

        // Extract dates using LLM
        const startTime = Date.now();
        const extractedEvents = await llmProvider.extractDates({
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

// Helper function to estimate token usage
function estimateTokenUsage(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
} 