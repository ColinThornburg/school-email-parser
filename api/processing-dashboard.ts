import { createClient } from '@supabase/supabase-js';
import { VercelRequest, VercelResponse } from '@vercel/node';

// Interface for sync session with processing details
interface SyncSessionDetail {
  id: string;
  session_type: 'sync' | 'reprocess';
  lookback_days: number;
  processing_mode: 'single' | 'batch';
  total_emails_processed: number;
  total_events_extracted: number;
  total_cost: number;
  duplicates_removed: number;
  skipped_duplicate_emails: number;
  skipped_duplicate_events: number;
  started_at: string;
  completed_at: string | null;
  success_status: boolean;
  error_message: string | null;
  processing_history: ProcessingHistoryItem[];
}

interface ProcessingHistoryItem {
  id: string;
  llm_provider: string;
  model_name: string | null;
  processing_step: string | null;
  processing_time: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  success_status: boolean;
  confidence_score: number | null;
  retry_count: number;
  error_message: string | null;
  created_at: string;
}

// Dashboard summary statistics
interface DashboardSummary {
  totalSessions: number;
  totalEmailsProcessed: number;
  totalEventsExtracted: number;
  totalCost: number;
  averageCostPerEmail: number;
  successRate: number;
  last30Days: {
    sessions: number;
    emails: number;
    events: number;
    cost: number;
  };
  providerBreakdown: {
    [provider: string]: {
      usage: number;
      cost: number;
      successRate: number;
    };
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check required environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase environment variables');
    }

    // Initialize Supabase client with service key for admin access
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Get user ID from query parameters
    const { userId, limit = '10', offset = '0' } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid userId parameter' });
    }

    const limitNum = parseInt(limit as string) || 10;
    const offsetNum = parseInt(offset as string) || 0;

    // Fetch comprehensive processing data from enhanced processed_emails table
    let emailSessions: any[] | null = null;
    let sessionsError: any = null;
    
    try {
      // Get processed emails with extracted events for comprehensive dashboard
      const result = await supabase
        .from('processed_emails')
        .select(`
          *,
          extracted_dates (
            event_title,
            event_date,
            event_time,
            confidence_score,
            description
          )
        `)
        .eq('user_id', userId)
        .order('processed_at', { ascending: false })
        .range(offsetNum, offsetNum + limitNum - 1);

      emailSessions = result.data;
      sessionsError = result.error;
      
      console.log(`Fetched ${emailSessions?.length || 0} processed emails for dashboard`);
    } catch (error) {
      console.error('Error fetching processed emails:', error);
      sessionsError = error;
    }

    // Transform processed emails into dashboard format
    if (sessionsError || !emailSessions) {
      console.error('Failed to fetch processed emails:', sessionsError);
      return res.status(200).json({
        sessions: [],
        summary: {
          totalSessions: 0,
          totalEmailsProcessed: 0,
          totalEventsExtracted: 0,
          totalCost: 0,
          averageCostPerEmail: 0,
          successRate: 0,
          last30Days: {
            sessions: 0,
            emails: 0,
            events: 0,
            cost: 0
          },
          providerBreakdown: {}
        },
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          hasMore: false
        },
        useEnhancedEmails: true,
        message: 'Unable to fetch processing data. The processed_emails table may need additional columns.'
      });
    }

    // Transform processed emails into session-like format for dashboard
    const emailBasedSessions = emailSessions.map(email => {
      // Handle missing columns gracefully
      const processingCost = email.processing_cost || (email as any).processing_cost || 0;
      const eventsCount = email.events_extracted_count || (email.extracted_dates?.length || 0);
      const extractionSuccessful = email.extraction_successful !== false && 
                                  (email.extraction_successful === true || eventsCount > 0);
      
      return {
        id: email.id,
        session_type: 'email_processing',
        email_data: {
          subject: email.subject,
          sender_email: email.sender_email,
          sent_date: email.sent_date,
          body_preview: email.email_body_preview,
          processing_status: email.processing_status || 'completed',
          processing_started_at: email.processing_started_at,
          processing_completed_at: email.processing_completed_at,
          events_extracted_count: eventsCount,
          average_confidence_score: email.average_confidence_score,
          processing_cost: processingCost,
          total_tokens_used: (email as any).total_tokens_used || 0,
          llm_providers_used: (email as any).llm_providers_used,
          models_used: (email as any).models_used,
          processing_time_ms: (email as any).processing_time_ms || 0,
          had_date_content: (email as any).had_date_content,
          classification_passed: (email as any).classification_passed,
          extraction_successful: extractionSuccessful,
          processing_error_message: (email as any).processing_error_message,
          has_attachments: email.has_attachments
        },
        extracted_events: email.extracted_dates || [],
        // Map to session-like fields for compatibility
        started_at: email.processing_started_at || email.processed_at,
        completed_at: email.processing_completed_at || email.processed_at,
        success_status: extractionSuccessful,
        total_emails_processed: 1,
        total_events_extracted: eventsCount,
        total_cost: processingCost
      };
    });

    // Calculate dashboard summary from processed emails
    console.log('Calculating summary statistics from processed emails...');
    
    // Get all processed emails for summary calculation
    const { data: allProcessedEmails } = await supabase
      .from('processed_emails')
      .select('*')
      .eq('user_id', userId);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentEmails = allProcessedEmails?.filter(email => 
      new Date(email.processed_at) >= thirtyDaysAgo) || [];

    // Calculate totals (handle missing columns gracefully)
    const totalEmails = allProcessedEmails?.length || 0;
    const totalEvents = allProcessedEmails?.reduce((sum, email) => sum + (email.events_extracted_count || 0), 0) || 0;
    const totalCost = allProcessedEmails?.reduce((sum, email) => {
      // Handle missing processing_cost column
      const cost = email.processing_cost || (email as any).processing_cost || 0;
      return sum + parseFloat(String(cost));
    }, 0) || 0;
    const successfulEmails = allProcessedEmails?.filter(email => {
      // Handle missing extraction_successful column - assume success if events were extracted
      const successful = email.extraction_successful !== false && 
                        (email.extraction_successful === true || (email.events_extracted_count || 0) > 0);
      return successful;
    }).length || 0;

    // Create provider breakdown from processed emails
    const providerBreakdown: { [key: string]: any } = {};
    allProcessedEmails?.forEach(email => {
      if (email.llm_providers_used) {
        const providers = email.llm_providers_used.split(', ');
        providers.forEach(provider => {
          if (!providerBreakdown[provider]) {
            providerBreakdown[provider] = {
              usage: 0,
              cost: 0,
              successRate: 0,
              count: 0
            };
          }
          providerBreakdown[provider].usage += email.total_tokens_used || 0;
          providerBreakdown[provider].cost += parseFloat(email.processing_cost || '0');
          providerBreakdown[provider].count++;
        });
      }
    });

    // Calculate success rates for providers
    Object.keys(providerBreakdown).forEach(provider => {
      const successCount = allProcessedEmails?.filter(email => 
        email.llm_providers_used?.includes(provider) && email.extraction_successful !== false
      ).length || 0;
      providerBreakdown[provider].successRate = providerBreakdown[provider].count > 0 ? 
        successCount / providerBreakdown[provider].count : 0;
    });

    const dashboardSummary: DashboardSummary = {
      totalSessions: totalEmails, // Using emails as "sessions"
      totalEmailsProcessed: totalEmails,
      totalEventsExtracted: totalEvents,
      totalCost: totalCost,
      averageCostPerEmail: totalEmails > 0 ? totalCost / totalEmails : 0,
      successRate: totalEmails > 0 ? successfulEmails / totalEmails : 0,
        last30Days: {
        sessions: recentEmails.length,
        emails: recentEmails.length,
        events: recentEmails.reduce((sum, email) => sum + (email.events_extracted_count || 0), 0),
        cost: recentEmails.reduce((sum, email) => {
          const cost = email.processing_cost || (email as any).processing_cost || 0;
          return sum + parseFloat(String(cost));
        }, 0)
      },
      providerBreakdown
    };

    // Return the enhanced dashboard data
    res.status(200).json({
      sessions: emailBasedSessions,
      summary: dashboardSummary,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: emailBasedSessions.length === limitNum
      },
      useEnhancedEmails: true,
      message: 'Showing comprehensive email processing data with full details for each processed email.'
    });

  } catch (error) {
    console.error('Processing dashboard error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 