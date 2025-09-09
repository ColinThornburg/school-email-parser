import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import Calendar from './ui/calendar'
import { Calendar as CalendarIcon, Settings, Mail, Clock, CheckCircle, LogIn, RefreshCw, X, BarChart3, Trash2 } from 'lucide-react'
import { ExtractedDate } from '../types'
import { formatDate } from '../lib/utils'
import { createGmailService } from '../lib/gmail'
import { supabase } from '../lib/supabase'
import EmailSourceManager from './EmailSourceManager'
import ProcessingDashboard from './ProcessingDashboard'

export default function Dashboard() {
  const [events, setEvents] = useState<ExtractedDate[]>([])
  const [view, setView] = useState<'calendar' | 'list' | 'processing'>('calendar')
  const [user, setUser] = useState<any>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<ExtractedDate | null>(null)
  const [eventToDelete, setEventToDelete] = useState<ExtractedDate | null>(null)
  const [lookbackDays, setLookbackDays] = useState(7)

  useEffect(() => {
    // Check if user is authenticated
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      const userData = JSON.parse(storedUser)
      console.log('Dashboard loaded user:', userData)
      setUser(userData)
      setIsAuthenticated(true)
      fetchEvents(userData.id)
    } else {
      setIsLoading(false)
    }
  }, [])

  const fetchEvents = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('extracted_dates')
        .select(`
          *,
          processed_emails!inner(
            sender_email,
            subject,
            sent_date,
            email_body_preview
          )
        `)
        .eq('user_id', userId)
        .order('event_date', { ascending: true })

      if (error) {
        throw error
      }

      const formattedEvents = data.map(event => ({
        ...event,
        eventDate: new Date(event.event_date + 'T00:00:00'), // Add time to avoid timezone issues
        eventTitle: event.event_title, // Map snake_case to camelCase
        extractedAt: new Date(event.extracted_at),
        confidenceScore: event.confidence_score, // Map snake_case to camelCase
        senderEmail: event.processed_emails.sender_email,
        senderName: event.processed_emails.sender_email.split('@')[0], // Extract name from email
        emailSubject: event.processed_emails.subject,
        emailSentDate: new Date(event.processed_emails.sent_date),
        emailBodyPreview: event.processed_emails.email_body_preview
      }))

      // Event data mapping completed successfully

      setEvents(formattedEvents)
    } catch (error) {
      console.error('Error fetching events:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEventClick = (event: ExtractedDate) => {
    setSelectedEvent(event)
  }

  const closeEventModal = () => {
    setSelectedEvent(null)
  }

  const handleDeleteEvent = async (event: ExtractedDate) => {
    try {
      const { error } = await supabase
        .from('extracted_dates')
        .delete()
        .eq('id', event.id)

      if (error) {
        throw error
      }

      // Remove the event from local state
      setEvents(events.filter(e => e.id !== event.id))
      
      // Close modals
      setEventToDelete(null)
      setSelectedEvent(null)
      
      console.log(`Successfully deleted event: ${event.eventTitle}`)
    } catch (error) {
      console.error('Error deleting event:', error)
      alert(`Failed to delete event: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const confirmDeleteEvent = (event: ExtractedDate, e?: React.MouseEvent) => {
    e?.stopPropagation() // Prevent event bubbling
    setEventToDelete(event)
  }

  const cancelDelete = () => {
    setEventToDelete(null)
  }

  const handleGmailAuth = () => {
    const gmailService = createGmailService()
    const authUrl = gmailService.getAuthUrl()
    window.location.href = authUrl
  }

  const handleReAuth = () => {
    // Clear stored user data to force fresh authentication
    localStorage.removeItem('user')
    setUser(null)
    setIsAuthenticated(false)
    
    // Initiate fresh OAuth flow
    const gmailService = createGmailService()
    const authUrl = gmailService.getAuthUrl()
    window.location.href = authUrl
  }

  const handleSyncEmails = async () => {
    if (!user) return

    setIsSyncing(true)
    try {
      const response = await fetch('/api/sync-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          forceReprocess: false,
          lookbackDays: lookbackDays
        }),
      })

      if (!response.ok) {
        // If we're running locally and the API doesn't exist, show a helpful message
        if (response.status === 404) {
          alert('API endpoint not available locally. Please test on the deployed Vercel app.')
          return
        }
        throw new Error('Failed to sync emails')
      }

      const result = await response.json()
      
      // Refresh events after sync
      await fetchEvents(user.id)
      
      let message = `Sync completed! Processed ${result.processed} emails and extracted ${result.extracted} dates.\nLooked back ${lookbackDays} day${lookbackDays !== 1 ? 's' : ''} for emails.`
      if (result.duplicatesRemoved > 0) {
        message += `\nRemoved ${result.duplicatesRemoved} duplicate events.`
      }
      if (result.skippedDuplicateEmails > 0) {
        message += `\nSkipped ${result.skippedDuplicateEmails} already processed emails.`
      }
      if (result.skippedDuplicateEvents > 0) {
        message += `\nSkipped ${result.skippedDuplicateEvents} duplicate events.`
      }
      
      alert(message)
    } catch (error) {
      console.error('Error syncing emails:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Check if it's a scope/authentication error
      if (errorMessage.includes('insufficient') || 
          errorMessage.includes('forbidden') || 
          errorMessage.includes('scopes') ||
          errorMessage.includes('Authentication failed')) {
        alert(`Authentication Error: ${errorMessage}\n\nPlease click "Re-authenticate Gmail" to fix permission issues.`)
      } else {
        alert(`Error: ${errorMessage}`)
      }
    } finally {
      setIsSyncing(false)
    }
  }

  const handleReprocessEmails = async () => {
    if (!user) return

    const confirmed = confirm(
      'This will reprocess all emails and clean up duplicate events. This may take a while. Continue?'
    )
    if (!confirmed) return

    setIsSyncing(true)
    try {
      const response = await fetch('/api/sync-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          forceReprocess: true,
          lookbackDays: lookbackDays
        }),
      })

      if (!response.ok) {
        // If we're running locally and the API doesn't exist, show a helpful message
        if (response.status === 404) {
          alert('API endpoint not available locally. Please test on the deployed Vercel app.')
          return
        }
        throw new Error('Failed to reprocess emails')
      }

      const result = await response.json()
      
      // Refresh events after reprocessing
      await fetchEvents(user.id)
      
      let message = `Reprocessing completed! Processed ${result.processed} emails and extracted ${result.extracted} dates.\nUsed ${lookbackDays}-day lookback period (reprocess uses up to 90 days).`
      if (result.duplicatesRemoved > 0) {
        message += `\nRemoved ${result.duplicatesRemoved} duplicate events during cleanup.`
      }
      
      alert(message)
    } catch (error) {
      console.error('Error reprocessing emails:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Check if it's a scope/authentication error
      if (errorMessage.includes('insufficient') || 
          errorMessage.includes('forbidden') || 
          errorMessage.includes('scopes') ||
          errorMessage.includes('Authentication failed')) {
        alert(`Authentication Error: ${errorMessage}\n\nPlease click "Re-authenticate Gmail" to fix permission issues.`)
      } else {
        alert(`Error: ${errorMessage}`)
      }
    } finally {
      setIsSyncing(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('user')
    setUser(null)
    setIsAuthenticated(false)
    setEvents([])
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Show authentication screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <Mail className="h-16 w-16 mx-auto mb-4 text-blue-600" />
            <h1 className="text-2xl font-bold mb-2">School Email Parser</h1>
            <p className="text-gray-600 mb-6">
              Connect your Gmail account to automatically extract important dates from school emails
            </p>
            <Button onClick={handleGmailAuth} className="w-full">
              <LogIn className="h-4 w-4 mr-2" />
              Connect Gmail Account
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">School Calendar</h1>
          <p className="text-muted-foreground">
            Track important dates from your school emails
          </p>
          {user && (
            <p className="text-sm text-gray-500 mt-1">
              Connected: {user.email}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant={view === 'calendar' ? 'default' : 'outline'}
            onClick={() => setView('calendar')}
          >
            <CalendarIcon className="h-4 w-4 mr-2" />
            Calendar
          </Button>
          <Button
            variant={view === 'list' ? 'default' : 'outline'}
            onClick={() => setView('list')}
          >
            <Mail className="h-4 w-4 mr-2" />
            List
          </Button>
          <Button
            variant={view === 'processing' ? 'default' : 'outline'}
            onClick={() => setView('processing')}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Processing
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Button onClick={handleLogout} variant="outline">
            Logout
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{events.length}</div>
            <p className="text-xs text-muted-foreground">
              Extracted from emails
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{events.filter(event => {
              const today = new Date()
              const eventDate = new Date(event.eventDate)
              return eventDate.toDateString() === today.toDateString()
            }).length}</div>
            <p className="text-xs text-muted-foreground">
              Events scheduled
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{events.filter(event => new Date(event.eventDate) >= new Date()).length}</div>
            <p className="text-xs text-muted-foreground">
              Future events
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {events.filter(e => e.isVerified).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Confirmed events
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-6">
          <EmailSourceManager 
            userId={user.id} 
            onSourcesUpdated={() => {
              // Optionally refresh events after sources are updated
              fetchEvents(user.id)
            }}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-6">
        {/* Calendar/List View - Now takes full width */}
        <div className="w-full">
          <Card>
            <CardHeader>
              <CardTitle>
                {view === 'calendar' ? 'Weekly Calendar View' : 
                 view === 'list' ? 'Event List' : 'Processing Dashboard'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {view === 'calendar' ? (
                <Calendar 
                  events={events} 
                  onEventClick={handleEventClick}
                />
              ) : view === 'list' ? (
                <div className="space-y-4">
                  {events.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Mail className="h-16 w-16 mx-auto mb-4" />
                      <p>No events found</p>
                      <p className="text-sm">
                        Configure email sources and sync your emails to get started
                      </p>
                    </div>
                  ) : (
                    events.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => handleEventClick(event)}
                      >
                        <div className="flex-1">
                          <h3 className="font-semibold">{event.eventTitle}</h3>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(event.eventDate)}
                            {event.eventTime && ` at ${event.eventTime}`}
                          </p>
                          {event.senderName && (
                            <p className="text-xs text-muted-foreground mt-1">
                              From: {event.senderName}
                            </p>
                          )}
                          {event.description && (
                            <p className="text-sm mt-1">{event.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-1 rounded-full text-xs ${
                              event.confidenceScore >= 0.9
                                ? 'bg-green-100 text-green-800'
                                : event.confidenceScore >= 0.8
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {Math.round(event.confidenceScore * 100)}%
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => confirmDeleteEvent(event, e)}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Delete event"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {event.isVerified && (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <ProcessingDashboard user={user} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions - Moved to bottom as a horizontal row */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Lookback Period Selector */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
              <div className="flex items-center gap-4">
                <label htmlFor="lookback-select" className="text-sm font-medium text-gray-700">
                  Email Lookback Period:
                </label>
                <select
                  id="lookback-select"
                  value={lookbackDays}
                  onChange={(e) => setLookbackDays(parseInt(e.target.value))}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isSyncing}
                >
                  <option value={1}>1 day</option>
                  <option value={3}>3 days</option>
                  <option value={7}>7 days (1 week)</option>
                  <option value={14}>14 days (2 weeks)</option>
                  <option value={21}>21 days (3 weeks)</option>
                  <option value={30}>30 days (1 month)</option>
                </select>
                <span className="text-xs text-gray-500">
                  Search for emails received in the last {lookbackDays} day{lookbackDays !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button 
                className="w-full" 
                variant="outline" 
                onClick={handleSyncEmails}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                {isSyncing ? 'Syncing...' : 'Sync Emails'}
              </Button>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={handleReprocessEmails}
                disabled={isSyncing}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reprocess Emails
              </Button>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={handleReAuth}
                disabled={isSyncing}
              >
                <LogIn className="h-4 w-4 mr-2" />
                Re-authenticate Gmail
              </Button>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="h-4 w-4 mr-2" />
                {showSettings ? 'Hide Settings' : 'Manage Sources'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Event Details</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeEventModal}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{selectedEvent.eventTitle}</h3>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarIcon className="h-4 w-4" />
                <span>{formatDate(selectedEvent.eventDate)}</span>
                {selectedEvent.eventTime && (
                  <>
                    <Clock className="h-4 w-4 ml-2" />
                    <span>{selectedEvent.eventTime}</span>
                  </>
                )}
              </div>
              
              {selectedEvent.description && (
                <div>
                  <h4 className="font-medium mb-1">Description</h4>
                  <p className="text-sm text-muted-foreground">{selectedEvent.description}</p>
                </div>
              )}
              
              <div>
                <h4 className="font-medium mb-2">Email Source</h4>
                <div className="text-sm text-muted-foreground space-y-2">
                  {selectedEvent.emailSubject && (
                    <div>
                      <span className="font-medium text-gray-700">Subject: </span>
                      <span className="text-gray-900">{selectedEvent.emailSubject}</span>
                    </div>
                  )}
                  
                  <div>
                    <span className="font-medium text-gray-700">From: </span>
                    <span>{selectedEvent.senderName || selectedEvent.senderEmail}</span>
                    {selectedEvent.senderEmail && selectedEvent.senderName && (
                      <span className="block text-xs opacity-75 ml-0 mt-1">
                        {selectedEvent.senderEmail}
                      </span>
                    )}
                  </div>
                  
                  {selectedEvent.emailSentDate && (
                    <div>
                      <span className="font-medium text-gray-700">Sent: </span>
                      <span>{selectedEvent.emailSentDate.toLocaleDateString()} at {selectedEvent.emailSentDate.toLocaleTimeString()}</span>
                    </div>
                  )}
                  
                  {selectedEvent.emailBodyPreview && (
                    <div className="mt-3">
                      <span className="font-medium text-gray-700 block mb-1">Email Preview:</span>
                      <div className="bg-gray-50 p-2 rounded text-xs border max-h-20 overflow-y-auto">
                        {selectedEvent.emailBodyPreview}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {selectedEvent.reasoning && (
                <div className="pt-3 border-t">
                  <h4 className="font-medium mb-2 text-gray-700">LLM Reasoning</h4>
                  <div className="bg-blue-50 p-3 rounded text-sm border-l-4 border-blue-400">
                    <p className="text-gray-800 italic">
                      "{selectedEvent.reasoning}"
                    </p>
                    <p className="text-xs text-gray-600 mt-2">
                      This explains why the AI extracted this specific date from the email content.
                    </p>
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Confidence:</span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      selectedEvent.confidenceScore >= 0.9
                        ? 'bg-green-100 text-green-800'
                        : selectedEvent.confidenceScore >= 0.8
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {Math.round(selectedEvent.confidenceScore * 100)}%
                  </span>
                </div>
                
                {selectedEvent.isVerified && (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">Verified</span>
                  </div>
                )}
              </div>
              
              <div className="text-xs text-muted-foreground">
                Extracted: {selectedEvent.extractedAt.toLocaleDateString()}
              </div>
              
              <div className="flex items-center gap-2 pt-4 border-t mt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => confirmDeleteEvent(selectedEvent)}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Event
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {eventToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Delete Event</h2>
                <p className="text-sm text-gray-600">This action cannot be undone</p>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-gray-700 mb-2">
                Are you sure you want to delete this event?
              </p>
              <div className="bg-gray-50 p-3 rounded border">
                <p className="font-medium">{eventToDelete.eventTitle}</p>
                <p className="text-sm text-gray-600">
                  {formatDate(eventToDelete.eventDate)}
                  {eventToDelete.eventTime && ` at ${eventToDelete.eventTime}`}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 justify-end">
              <Button
                variant="ghost"
                onClick={cancelDelete}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDeleteEvent(eventToDelete)}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 