import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createSummaryProvider, EmailContent } from '../src/lib/llm';
import { extractEmailText } from '../src/lib/utils';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
