import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { RefreshCw, Mail, Calendar, CheckSquare, Tag, Clock } from 'lucide-react';
import { EmailSummary } from '../types';
import { formatDate, formatDateTime } from '../lib/utils';

interface Props {
  user?: any;
}

export default function EmailSummaries({ user: propUser }: Props) {
  const [summaries, setSummaries] = useState<EmailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);

  const loadSummaries = async (offset = 0) => {
    try {
      setLoading(true);
      setError(null);

      // Get current user from props or localStorage
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

      const response = await fetch(`/api/email-summaries?userId=${currentUser.id}&limit=10&offset=${offset}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch email summaries: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      setSummaries(data.summaries || []);
      
    } catch (err) {
      console.error('Email summaries load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load email summaries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummaries(currentPage * 10);
  }, [currentPage]);

  const toggleExpanded = (summaryId: string) => {
    setExpandedSummary(expandedSummary === summaryId ? null : summaryId);
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'Academic': 'bg-blue-100 text-blue-800',
      'Events': 'bg-green-100 text-green-800',
      'Administrative': 'bg-purple-100 text-purple-800',
      'Food Service': 'bg-orange-100 text-orange-800',
      'Transportation': 'bg-yellow-100 text-yellow-800',
      'Health': 'bg-red-100 text-red-800',
      'Sports': 'bg-indigo-100 text-indigo-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading email summaries...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-800">
              <span className="text-red-600">⚠️</span>
              <span className="font-medium">Error loading email summaries</span>
            </div>
            <p className="text-red-700 mt-1 text-sm">{error}</p>
            <Button 
              onClick={() => loadSummaries(0)} 
              variant="outline" 
              size="sm" 
              className="mt-3"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Email Summaries</h2>
          <p className="text-sm text-muted-foreground">
            AI-generated summaries of your school emails
          </p>
        </div>
        <Button onClick={() => loadSummaries(0)} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {summaries.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Mail className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No email summaries available</p>
            <p className="text-sm text-muted-foreground mt-2">
              Process some emails first to see summaries here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {summaries.map((summary) => (
            <Card key={summary.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-1">{summary.subject}</CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>From: {summary.senderEmail}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(summary.sentDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-xs">Confidence:</span>
                        <span className="font-medium">
                          {Math.round(summary.confidence * 100)}%
                        </span>
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpanded(summary.id)}
                  >
                    {expandedSummary === summary.id ? 'Collapse' : 'Expand'}
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent>
                {/* Categories */}
                {summary.summary.categories.length > 0 && (
                  <div className="flex gap-1 mb-3">
                    {summary.summary.categories.map((category, index) => (
                      <span
                        key={index}
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(category)}`}
                      >
                        <Tag className="h-3 w-3 mr-1" />
                        {category}
                      </span>
                    ))}
                  </div>
                )}

                {/* Key Points */}
                <div className="mb-4">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Key Points
                  </h4>
                  <ul className="space-y-1">
                    {summary.summary.keyPoints.slice(0, expandedSummary === summary.id ? undefined : 3).map((point, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <span className="text-blue-500 mt-1">•</span>
                        <span>{point}</span>
                      </li>
                    ))}
                    {!expandedSummary && summary.summary.keyPoints.length > 3 && (
                      <li className="text-sm text-muted-foreground italic">
                        ... and {summary.summary.keyPoints.length - 3} more points
                      </li>
                    )}
                  </ul>
                </div>

                {/* Important Dates */}
                {summary.summary.importantDates.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Important Dates
                    </h4>
                    <div className="space-y-2">
                      {summary.summary.importantDates.slice(0, expandedSummary === summary.id ? undefined : 2).map((dateInfo, index) => (
                        <div key={index} className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
                          <div className="font-medium text-sm text-blue-900">
                            {formatDate(new Date(dateInfo.date))} - {dateInfo.description}
                          </div>
                          <div className="text-xs text-blue-700 italic mt-1">
                            "{dateInfo.originalText}"
                          </div>
                        </div>
                      ))}
                      {!expandedSummary && summary.summary.importantDates.length > 2 && (
                        <div className="text-sm text-muted-foreground italic">
                          ... and {summary.summary.importantDates.length - 2} more dates
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Items */}
                {summary.summary.actionItems.length > 0 && (expandedSummary === summary.id || summary.summary.actionItems.length <= 2) && (
                  <div className="mb-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <CheckSquare className="h-4 w-4" />
                      Action Items
                    </h4>
                    <ul className="space-y-1">
                      {summary.summary.actionItems.map((item, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm">
                          <span className="text-red-500 mt-1">→</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Preview of email body if collapsed */}
                {!expandedSummary && summary.emailBodyPreview && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Email Preview:</p>
                    <p className="text-sm text-gray-700">{summary.emailBodyPreview}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {summaries.length >= 10 && (
        <div className="flex justify-center gap-2 mt-6">
          <Button
            variant="outline"
            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
          >
            Previous
          </Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Page {currentPage + 1}
          </span>
          <Button
            variant="outline"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={summaries.length < 10}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
