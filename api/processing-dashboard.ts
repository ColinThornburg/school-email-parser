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

    // Fetch sync sessions with processing history (with fallback for missing schema)
    let sessions: any[] | null = null;
    let sessionsError: any = null;
    
    try {
      const result = await supabase
        .from('sync_sessions')
        .select(`
          *,
          processing_history (
            id,
            llm_provider,
            model_name,
            processing_step,
            processing_time,
            input_tokens,
            output_tokens,
            total_tokens,
            cost,
            success_status,
            confidence_score,
            retry_count,
            error_message,
            created_at
          )
        `)
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .range(offsetNum, offsetNum + limitNum - 1);

      sessions = result.data;
      sessionsError = result.error;
    } catch (error) {
      console.warn('Sync sessions table not available:', error);
      sessionsError = { message: 'sync_sessions table not found' };
    }

    // If sessions table doesn't exist, try to get processing history directly
    if (sessionsError && sessionsError.message && (
      sessionsError.message.includes('sync_sessions') || 
      sessionsError.message.includes('relationship') ||
      sessionsError.message.includes('schema cache')
    )) {
      console.log('sync_sessions table not available, checking for processing_history...');
      
      try {
        // Try to get processing history directly (without session grouping)
        const { data: processingHistory, error: historyError } = await supabase
          .from('processing_history')
          .select(`
            *,
            processed_emails!left (
              subject,
              sender_email,
              sent_date
            )
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50); // Get recent history

        if (historyError) {
          console.warn('processing_history also not available:', historyError);
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
            schemaUpdateRequired: true,
            message: 'Dashboard tracking is not yet available. Please run the updated database schema to enable full tracking.'
          });
        }

        // Build a synthetic session from processing history
        if (processingHistory && processingHistory.length > 0) {
          console.log(`Found ${processingHistory.length} processing history entries without sessions`);
          
          // Group by date for pseudo-sessions
          const historyByDate: { [key: string]: any[] } = {};
          processingHistory.forEach(item => {
            const date = new Date(item.created_at).toDateString();
            if (!historyByDate[date]) historyByDate[date] = [];
            historyByDate[date].push(item);
          });

          const syntheticSessions = Object.entries(historyByDate).map(([date, items]) => {
            const emailProcessingItems = items.filter(item => item.llm_provider === 'email_processing');
            const llmProcessingItems = items.filter(item => item.llm_provider !== 'email_processing');
            
            return {
              id: `synthetic-${date}`,
              session_type: 'sync',
              lookback_days: 7,
              processing_mode: 'single',
              total_emails_processed: emailProcessingItems.length,
              total_events_extracted: emailProcessingItems.reduce((sum, item) => sum + (item.output_tokens || 0), 0),
              total_cost: items.reduce((sum, item) => sum + parseFloat(item.cost || '0'), 0),
              duplicates_removed: 0,
              skipped_duplicate_emails: 0,
              skipped_duplicate_events: 0,
              started_at: items[items.length - 1].created_at, // Oldest
              completed_at: items[0].created_at, // Newest
              success_status: items.every(item => item.success_status),
              error_message: null,
              processing_history: items
            };
          });

          const totalCost = processingHistory.reduce((sum, item) => sum + parseFloat(item.cost || '0'), 0);
          const emailItems = processingHistory.filter(item => item.llm_provider === 'email_processing');

          return res.status(200).json({
            sessions: syntheticSessions.slice(0, limitNum),
            summary: {
              totalSessions: syntheticSessions.length,
              totalEmailsProcessed: emailItems.length,
              totalEventsExtracted: emailItems.reduce((sum, item) => sum + (item.output_tokens || 0), 0),
              totalCost: totalCost,
              averageCostPerEmail: emailItems.length > 0 ? totalCost / emailItems.length : 0,
              successRate: processingHistory.length > 0 ? processingHistory.filter(item => item.success_status).length / processingHistory.length : 0,
              last30Days: {
                sessions: syntheticSessions.length,
                emails: emailItems.length,
                events: emailItems.reduce((sum, item) => sum + (item.output_tokens || 0), 0),
                cost: totalCost
              },
              providerBreakdown: {}
            },
            pagination: {
              limit: limitNum,
              offset: offsetNum,
              hasMore: syntheticSessions.length > limitNum
            },
            partialDataMode: true,
            message: 'Showing processing history without full session tracking. Run the updated database schema for complete dashboard features.'
          });
        }
      } catch (fallbackError) {
        console.warn('Failed to get processing history fallback:', fallbackError);
      }

      // Complete fallback - no data available
      console.log('No processing data available, returning setup message');
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
        schemaUpdateRequired: true,
        message: 'Dashboard tracking is not yet available. Please run the updated database schema to enable session tracking.'
      });
    }

    if (sessionsError) {
      throw new Error(`Failed to fetch sync sessions: ${sessionsError.message || 'Unknown error'}`);
    }

    // Fetch dashboard summary statistics
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get overall statistics
    const { data: summaryStats, error: summaryError } = await supabase
      .rpc('get_dashboard_summary', { p_user_id: userId });

    let dashboardSummary: DashboardSummary;

    if (summaryError || !summaryStats) {
      // Fallback to manual calculation if RPC doesn't exist
      console.log('RPC not available, calculating summary manually');
      
      const { data: allSessions } = await supabase
        .from('sync_sessions')
        .select('*')
        .eq('user_id', userId);

      const { data: allProcessingHistory } = await supabase
        .from('processing_history')
        .select('*')
        .eq('user_id', userId);

      const recentSessions = allSessions?.filter(s => 
        new Date(s.started_at) >= thirtyDaysAgo) || [];

      const providerBreakdown: { [key: string]: any } = {};
      
      allProcessingHistory?.forEach(item => {
        if (!providerBreakdown[item.llm_provider]) {
          providerBreakdown[item.llm_provider] = {
            usage: 0,
            cost: 0,
            successCount: 0,
            totalCount: 0
          };
        }
        providerBreakdown[item.llm_provider].usage += item.total_tokens || 0;
        providerBreakdown[item.llm_provider].cost += parseFloat(item.cost || '0');
        providerBreakdown[item.llm_provider].totalCount++;
        if (item.success_status) {
          providerBreakdown[item.llm_provider].successCount++;
        }
      });

      // Calculate success rates
      Object.keys(providerBreakdown).forEach(provider => {
        const data = providerBreakdown[provider];
        data.successRate = data.totalCount > 0 ? data.successCount / data.totalCount : 0;
        delete data.successCount;
        delete data.totalCount;
      });

      const totalEmails = allSessions?.reduce((sum, s) => sum + (s.total_emails_processed || 0), 0) || 0;
      const totalCost = allSessions?.reduce((sum, s) => sum + parseFloat(s.total_cost || '0'), 0) || 0;

      dashboardSummary = {
        totalSessions: allSessions?.length || 0,
        totalEmailsProcessed: totalEmails,
        totalEventsExtracted: allSessions?.reduce((sum, s) => sum + (s.total_events_extracted || 0), 0) || 0,
        totalCost: totalCost,
        averageCostPerEmail: totalEmails > 0 ? totalCost / totalEmails : 0,
        successRate: allSessions && allSessions.length > 0 ? 
          allSessions.filter(s => s.success_status).length / allSessions.length : 0,
        last30Days: {
          sessions: recentSessions.length,
          emails: recentSessions.reduce((sum, s) => sum + (s.total_emails_processed || 0), 0),
          events: recentSessions.reduce((sum, s) => sum + (s.total_events_extracted || 0), 0),
          cost: recentSessions.reduce((sum, s) => sum + parseFloat(s.total_cost || '0'), 0)
        },
        providerBreakdown
      };
    } else {
      dashboardSummary = summaryStats[0];
    }

    // Return the dashboard data
    res.status(200).json({
      sessions: sessions || [],
      summary: dashboardSummary,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: sessions ? sessions.length === limitNum : false
      }
    });

  } catch (error) {
    console.error('Processing dashboard error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 