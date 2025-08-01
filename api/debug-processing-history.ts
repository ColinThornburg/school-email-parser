import { createClient } from '@supabase/supabase-js';
import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId parameter' });
    }

    console.log('Checking processing_history table...');

    // Test if we can query the processing_history table
    const { data: historyData, error: historyError } = await supabase
      .from('processing_history')
      .select('*')
      .eq('user_id', userId)
      .limit(5);

    console.log('Processing history query result:', { historyData, historyError });

    // Test if we can query the processed_emails table
    const { data: emailsData, error: emailsError } = await supabase
      .from('processed_emails')
      .select('*')
      .eq('user_id', userId)
      .limit(5);

    console.log('Processed emails query result:', { emailsData, emailsError });

    // Check table structure
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_table_info', { table_name: 'processing_history' })
      .single();

    console.log('Table info result:', { tables, tablesError });

    res.status(200).json({
      processing_history: {
        exists: !historyError,
        error: historyError?.message,
        count: historyData?.length || 0,
        sample: historyData
      },
      processed_emails: {
        exists: !emailsError,
        error: emailsError?.message,
        count: emailsData?.length || 0,
        sample: emailsData
      },
      table_info: {
        error: tablesError?.message,
        info: tables
      }
    });

  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ 
      error: 'Debug error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 