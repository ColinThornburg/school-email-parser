import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { supabase } from '../lib/supabase';

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
  sessions: SyncSession[];
  summary: DashboardSummary;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
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
      case 'classification': return 'bg-blue-100 text-blue-800';
      case 'extraction': return 'bg-green-100 text-green-800';
      case 'fallback': return 'bg-yellow-100 text-yellow-800';
      case 'email_retrieval': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
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
            <p className="text-red-800">Error: {error}</p>
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

  const { sessions, summary } = dashboardData;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Processing Dashboard</h1>
        <Button onClick={() => loadDashboardData(0)} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalSessions}</div>
            <p className="text-xs text-gray-600">
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
            <p className="text-xs text-gray-600">
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
            <p className="text-xs text-gray-600">
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
            <p className="text-xs text-gray-600">
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
              <div key={provider} className="p-4 border rounded-lg">
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

      {/* Session History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Processing Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sessions.map((session) => (
              <div key={session.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        session.session_type === 'reprocess' 
                          ? 'bg-orange-100 text-orange-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {session.session_type}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        session.success_status 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {session.success_status ? 'Success' : 'Failed'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {formatDate(session.started_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(session.total_cost)}</p>
                    <p className="text-sm text-gray-600">
                      {session.total_emails_processed} emails → {session.total_events_extracted} events
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                  <div>
                    <p className="text-gray-600">Lookback</p>
                    <p className="font-medium">{session.lookback_days} days</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Mode</p>
                    <p className="font-medium">{session.processing_mode}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Duplicates Removed</p>
                    <p className="font-medium">{session.duplicates_removed}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Skipped</p>
                    <p className="font-medium">
                      {session.skipped_duplicate_emails + session.skipped_duplicate_events}
                    </p>
                  </div>
                </div>

                {session.error_message && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
                    <p className="text-red-800 text-sm">{session.error_message}</p>
                  </div>
                )}

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
                      {session.processing_history?.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                          <div className="flex items-center gap-2">
                            <span>{getProviderIcon(item.llm_provider)}</span>
                            <span className="font-medium">{item.llm_provider}</span>
                            {item.model_name && (
                              <span className="text-gray-600">({item.model_name})</span>
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
                              <p className="text-gray-600">{formatDuration(item.processing_time)}</p>
                            </div>
                            <div>
                              <p className="font-medium">{formatCurrency(item.cost)}</p>
                              <p className={`text-xs ${item.success_status ? 'text-green-600' : 'text-red-600'}`}>
                                {item.success_status ? 'Success' : 'Failed'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )) || (
                        <p className="text-gray-500 text-sm">No processing history available</p>
                      )}
                    </div>
                  </div>
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
            <span className="text-sm text-gray-600">
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