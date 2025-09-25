import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

// Types for dashboard data
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

interface EmailProcessingSession {
  id: string;
  session_type: 'email_processing';
  email_data: {
    subject: string;
    sender_email: string;
    sent_date: string;
    body_preview?: string;
    processing_status: string;
    processing_started_at: string;
    processing_completed_at?: string;
    events_extracted_count: number;
    average_confidence_score?: number;
    processing_cost: number;
    total_tokens_used: number;
    llm_providers_used?: string;
    models_used?: string;
    processing_time_ms: number;
    had_date_content?: boolean;
    classification_passed?: boolean;
    extraction_successful?: boolean;
    processing_error_message?: string;
    has_attachments?: boolean;
  };
  extracted_events: Array<{
    event_title: string;
    event_date: string;
    event_time?: string;
    confidence_score: number;
    description?: string;
  }>;
  // Compatibility fields
  started_at: string;
  completed_at: string;
  success_status: boolean;
  total_emails_processed: number;
  total_events_extracted: number;
  total_cost: number;
}

// Keep old interface for backward compatibility
interface SyncSession {
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

interface DashboardData {
  sessions: (SyncSession | EmailProcessingSession)[];
  summary: DashboardSummary;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  schemaUpdateRequired?: boolean;
  partialDataMode?: boolean;
  useEnhancedEmails?: boolean;
  message?: string;
}

interface Props {
  user?: any;
}

export default function ProcessingDashboard({ user: propUser }: Props) {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const loadDashboardData = async (offset = 0) => {
    try {
      setLoading(true);
      setError(null);

      // Get current user from props or localStorage (matching Dashboard component pattern)
      let currentUser = propUser;
      if (!currentUser) {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          currentUser = JSON.parse(storedUser);
        }
      }
      
      if (!currentUser?.id) {
        throw new Error('User not authenticated - please sign in with Gmail');
      }

      // Fetch dashboard data from our API
      const response = await fetch(`/api/processing-dashboard?userId=${currentUser.id}&limit=10&offset=${offset}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch dashboard data: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data: DashboardData = await response.json();
      setDashboardData(data);
      
    } catch (err) {
      console.error('Dashboard load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData(currentPage * 10);
  }, [currentPage]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'openai': return '🤖';
      case 'gemini': return '💎';
      case 'gmail': return '📧';
      default: return '⚙️';
    }
  };

  const getStepColor = (step: string | null) => {
    switch (step) {
      case 'classification': return 'bg-sky-400/20 border border-sky-400/35 text-sky-100';
      case 'extraction': return 'bg-emerald-400/25 border border-emerald-400/35 text-emerald-100';
      case 'fallback': return 'bg-amber-400/25 border border-amber-400/35 text-amber-100';
      case 'email_retrieval': return 'bg-purple-400/20 border border-purple-400/35 text-purple-100';
      case 'email_analysis': return 'bg-indigo-400/25 border border-indigo-400/35 text-indigo-100';
      case 'email_summary': return 'bg-cyan-400/20 border border-cyan-400/35 text-cyan-100';
      case 'processed': return 'bg-emerald-400/20 border border-emerald-400/35 text-emerald-100';
      default: return 'bg-white/10 border border-white/15 text-slate-200';
    }
  };

  const getProcessingStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-400/25 border border-emerald-400/35 text-emerald-100';
      case 'failed': return 'bg-rose-500/25 border border-rose-500/35 text-rose-100';
      case 'retrieved': return 'bg-sky-400/20 border border-sky-400/35 text-sky-100';
      case 'processing': return 'bg-amber-400/25 border border-amber-400/35 text-amber-100';
      default: return 'bg-white/10 border border-white/15 text-slate-200';
    }
  };

  // Type guard to check if session is EmailProcessingSession
  const isEmailSession = (session: SyncSession | EmailProcessingSession): session is EmailProcessingSession => {
    return session.session_type === 'email_processing';
  };

  if (loading && !dashboardData) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading processing dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-rose-100">Error: {error}</p>
            <Button 
              onClick={() => loadDashboardData(currentPage * 10)} 
              className="mt-2"
              variant="outline"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!dashboardData) return null;

  // Handle case where schema update is required
  if (dashboardData.schemaUpdateRequired) {
    return (
      <div className="p-6">
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sky-100">
              📊 Dashboard Setup Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-blue-700">
                {dashboardData.message || 'Processing dashboard is not yet available.'}
              </p>
              <div className="bg-white/12 border border-white/20 rounded-lg p-4 backdrop-blur-xl">
                <h4 className="font-medium text-sky-100 mb-2">To enable dashboard tracking:</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700">
                  <li>Go to your Supabase SQL Editor</li>
                  <li>Run the updated <code className="bg-blue-100 px-1 rounded">supabase-schema.sql</code> file</li>
                  <li>This will create the new dashboard tracking tables</li>
                  <li>Future syncs will populate the dashboard with detailed tracking data</li>
                </ol>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => loadDashboardData(0)} variant="outline">
                  Check Again
                </Button>
                <Button 
                  onClick={() => window.open('https://app.supabase.com', '_blank')} 
                  variant="default"
                >
                  Open Supabase
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { sessions, summary } = dashboardData;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Processing Dashboard</h1>
          {dashboardData.useEnhancedEmails && (
            <p className="text-sm text-green-600 mt-1">
              ✨ Enhanced Email View - Showing detailed processing information for each email
            </p>
          )}
          {dashboardData.partialDataMode && (
            <p className="text-sm text-amber-600 mt-1">
              ⚠️ Partial data mode - showing processing history without full session tracking
            </p>
          )}
        </div>
        <Button onClick={() => loadDashboardData(0)} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Partial Data Mode Banner */}
      {dashboardData.partialDataMode && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <span className="text-amber-600 text-lg">⚠️</span>
              <div>
                <h4 className="font-medium text-amber-800 mb-1">Partial Data Mode</h4>
                <p className="text-amber-700 text-sm mb-2">
                  {dashboardData.message || 'Showing limited dashboard data.'}
                </p>
                <p className="text-amber-600 text-xs">
                  ✅ Email processing details • ✅ LLM usage • ❌ Full session tracking • ❌ Advanced analytics
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalSessions}</div>
            <p className="text-xs text-slate-300">
              {summary.last30Days.sessions} in last 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Emails Processed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalEmailsProcessed.toLocaleString()}</div>
            <p className="text-xs text-slate-300">
              {summary.last30Days.emails} in last 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Events Extracted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalEventsExtracted.toLocaleString()}</div>
            <p className="text-xs text-slate-300">
              {summary.last30Days.events} in last 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalCost)}</div>
            <p className="text-xs text-slate-300">
              {formatCurrency(summary.averageCostPerEmail)} per email
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Provider Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Provider Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(summary.providerBreakdown).map(([provider, stats]) => (
              <div key={provider} className="p-4 border border-white/15 rounded-xl bg-white/8 backdrop-blur-xl">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{getProviderIcon(provider)}</span>
                  <h3 className="font-semibold capitalize">{provider}</h3>
                </div>
                <div className="space-y-1 text-sm">
                  <p>Tokens: {stats.usage.toLocaleString()}</p>
                  <p>Cost: {formatCurrency(stats.cost)}</p>
                  <p>Success: {(stats.successRate * 100).toFixed(1)}%</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Email Processing History */}
      <Card>
        <CardHeader>
          <CardTitle>
            {dashboardData.useEnhancedEmails ? 'Recent Email Processing' : 'Recent Processing Sessions'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sessions.map((session) => (
              <div key={session.id} className="border border-white/15 rounded-xl p-4 bg-white/8 backdrop-blur-xl">
                {isEmailSession(session) ? (
                  // Enhanced email processing view
                  <>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">📧</span>
                          <h3 className="font-semibold text-lg">{session.email_data.subject}</h3>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getProcessingStatusColor(session.email_data.processing_status)}`}>
                            {session.email_data.processing_status}
                          </span>
                          {session.email_data.has_attachments && (
                            <span className="text-xs bg-sky-400/20 border border-sky-400/35 text-sky-100 px-2 py-1 rounded">📎 Attachments</span>
                          )}
                        </div>
                        <div className="space-y-1 text-sm text-slate-300">
                          <p><strong>From:</strong> {session.email_data.sender_email}</p>
                          <p><strong>Sent:</strong> {formatDate(session.email_data.sent_date)}</p>
                          <p><strong>Processed:</strong> {formatDate(session.started_at)}</p>
                          {session.email_data.body_preview && (
                            <p><strong>Preview:</strong> {session.email_data.body_preview.substring(0, 150)}...</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <p className="font-semibold text-lg">{formatCurrency(session.total_cost)}</p>
                        <p className="text-sm text-slate-300">
                          {session.total_events_extracted} events extracted
                        </p>
                        {session.email_data.average_confidence_score && (
                          <p className="text-xs text-slate-400">
                            Avg confidence: {(session.email_data.average_confidence_score * 100).toFixed(1)}%
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Processing stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3 bg-white/10 p-3 rounded-lg border border-white/15">
                      <div>
                        <p className="text-slate-300">Processing Time</p>
                        <p className="font-medium">{formatDuration(session.email_data.processing_time_ms)}</p>
                      </div>
                      <div>
                        <p className="text-slate-300">Tokens Used</p>
                        <p className="font-medium">{session.email_data.total_tokens_used.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-300">LLM Providers</p>
                        <p className="font-medium">{session.email_data.llm_providers_used || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-slate-300">Models</p>
                        <p className="font-medium text-xs">{session.email_data.models_used || 'N/A'}</p>
                      </div>
                    </div>

                    {/* Error message if any */}
                    {session.email_data.processing_error_message && (
                      <div className="bg-rose-500/15 border border-rose-500/30 rounded p-2 mb-3">
                        <p className="text-rose-100 text-sm">{session.email_data.processing_error_message}</p>
                      </div>
                    )}

                    {/* Show extracted events */}
                    {session.extracted_events && session.extracted_events.length > 0 && (
                      <div className="mt-3">
                        <h4 className="font-medium text-sm mb-2">Extracted Events ({session.extracted_events.length}):</h4>
                        <div className="space-y-2">
                          {session.extracted_events.map((event, index) => (
                            <div key={index} className="bg-white/10 border border-white/12 rounded p-2 text-sm">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-medium">{event.event_title}</p>
                                  <p className="text-slate-300">
                                    {formatDate(event.event_date)} {event.event_time && `at ${event.event_time}`}
                                  </p>
                                  {event.description && (
                                    <p className="text-slate-400 text-xs mt-1">{event.description}</p>
                                  )}
                                </div>
                                <span className="text-xs bg-emerald-400/25 border border-emerald-400/35 text-emerald-100 px-2 py-1 rounded">
                                  {(event.confidence_score * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  // Legacy session view
                  <>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            session.session_type === 'reprocess' 
                              ? 'bg-orange-100 text-orange-800' 
                              : 'bg-sky-400/20 border border-sky-400/35 text-sky-100'
                          }`}>
                            {session.session_type}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            session.success_status 
                              ? 'bg-emerald-400/25 border border-emerald-400/35 text-emerald-100' 
                              : 'bg-rose-500/25 border border-rose-500/35 text-rose-100'
                          }`}>
                            {session.success_status ? 'Success' : 'Failed'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300 mt-1">
                          {formatDate(session.started_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(session.total_cost)}</p>
                        <p className="text-sm text-slate-300">
                          {session.total_emails_processed} emails → {session.total_events_extracted} events
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {!isEmailSession(session) && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                      <div>
                        <p className="text-slate-300">Lookback</p>
                        <p className="font-medium">{session.lookback_days} days</p>
                      </div>
                      <div>
                        <p className="text-slate-300">Mode</p>
                        <p className="font-medium">{session.processing_mode}</p>
                      </div>
                      <div>
                        <p className="text-slate-300">Duplicates Removed</p>
                        <p className="font-medium">{session.duplicates_removed}</p>
                      </div>
                      <div>
                        <p className="text-slate-300">Skipped</p>
                        <p className="font-medium">
                          {session.skipped_duplicate_emails + session.skipped_duplicate_events}
                        </p>
                      </div>
                    </div>

                    {session.error_message && (
                      <div className="bg-rose-500/15 border border-rose-500/30 rounded p-2 mb-3">
                        <p className="text-rose-100 text-sm">{session.error_message}</p>
                      </div>
                    )}
                  </>
                )}

                {!isEmailSession(session) && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExpandedSession(
                        expandedSession === session.id ? null : session.id
                      )}
                    >
                      {expandedSession === session.id ? 'Hide' : 'Show'} Processing Details
                    </Button>

                    {expandedSession === session.id && (
                      <div className="mt-4 border-t pt-4">
                        <h4 className="font-medium mb-3">Processing History</h4>
                        <div className="space-y-2">
                          {session.processing_history?.length > 0 ? (
                            <>
                              {/* Email-level processing */}
                              {session.processing_history
                                .filter(item => item.llm_provider === 'email_processing')
                                .map((item) => (
                                  <div key={item.id} className="p-3 bg-sky-400/20 border border-sky-400/35 rounded text-sm">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span>📧</span>
                                          <span className="font-medium">Email Processed</span>
                                          <span className={`px-2 py-1 rounded text-xs ${getStepColor(item.processing_step)}`}>
                                            {item.processing_step || 'processed'}
                                          </span>
                                        </div>
                                        {(item as any).processed_emails && (
                                          <div className="text-slate-200 ml-6">
                                            <p className="font-medium">"{(item as any).processed_emails.subject}"</p>
                                            <p className="text-xs text-slate-300">
                                              From: {(item as any).processed_emails.sender_email} | 
                                              {new Date((item as any).processed_emails.sent_date).toLocaleDateString()}
                                            </p>
                                          </div>
                                        )}
                                        {item.confidence_score && (
                                          <p className="text-xs text-slate-300 ml-6">
                                            Avg confidence: {(item.confidence_score * 100).toFixed(1)}%
                                          </p>
                                        )}
                                      </div>
                                      <div className="text-right">
                                        <p className="font-medium text-blue-700">
                                          {item.output_tokens || 0} events extracted
                                        </p>
                                        <p className="text-xs text-slate-300">
                                          {formatDuration(item.processing_time)}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}

                              {/* LLM processing steps */}
                              {session.processing_history
                                .filter(item => item.llm_provider !== 'email_processing')
                                .map((item) => (
                                  <div key={item.id} className="flex items-center justify-between p-2 bg-white/10 rounded text-sm">
                                    <div className="flex items-center gap-2">
                                      <span>{getProviderIcon(item.llm_provider)}</span>
                                      <span className="font-medium">{item.llm_provider}</span>
                                      {item.model_name && (
                                        <span className="text-slate-300">({item.model_name})</span>
                                      )}
                                      {item.processing_step && (
                                        <span className={`px-2 py-1 rounded text-xs ${getStepColor(item.processing_step)}`}>
                                          {item.processing_step}
                                        </span>
                                      )}
                                      {item.retry_count > 0 && (
                                        <span className="text-orange-600">
                                          {item.retry_count} retries
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-4 text-right">
                                      <div>
                                        <p>{item.total_tokens.toLocaleString()} tokens</p>
                                        <p className="text-slate-300">{formatDuration(item.processing_time)}</p>
                                      </div>
                                      <div>
                                        <p className="font-medium">{formatCurrency(item.cost)}</p>
                                        <p className={`text-xs ${item.success_status ? 'text-green-600' : 'text-red-600'}`}>
                                          {item.success_status ? 'Success' : 'Failed'}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </>
                          ) : (
                            <p className="text-slate-400 text-sm">No processing history available</p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-6">
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              Previous
            </Button>
            <span className="text-sm text-slate-300">
              Page {currentPage + 1}
            </span>
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={!dashboardData.pagination.hasMore}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 