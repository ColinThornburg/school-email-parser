import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import Calendar from './ui/calendar'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Calendar as CalendarIcon, Settings, Mail, Clock, CheckCircle, LogIn, RefreshCw, X, BarChart3, Trash2, FileText, TrendingUp, ChevronDown, ChevronUp, User, Globe, List, MoreVertical, Download, RotateCcw, Key } from 'lucide-react'
import { ExtractedDate } from '../types'
import { formatDate } from '../lib/utils'
import { createGmailService } from '../lib/gmail'
import { supabase } from '../lib/supabase'
import EmailSourceManager from './EmailSourceManager'
import ProcessingDashboard from './ProcessingDashboard'
import EmailSummaries from './EmailSummaries'

export default function Dashboard() {
  const [events, setEvents] = useState<ExtractedDate[]>([])
  const [view, setView] = useState<'calendar' | 'list' | 'processing' | 'summaries'>('calendar')
  const [user, setUser] = useState<any>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<ExtractedDate | null>(null)
  const [eventToDelete, setEventToDelete] = useState<ExtractedDate | null>(null)
  const [lookbackDays, setLookbackDays] = useState(7)
  const [showStats, setShowStats] = useState(false)

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
      console.log('Fetching events for user (v2):', userId);
      
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
        console.error('Error in main events query:', error);
        throw error
      }
      
      console.log('Fetched events data:', data);

      // Fetch email sources with tags to match against sender emails
      const { data: emailSources, error: sourcesError } = await supabase
        .from('email_sources')
        .select(`
          email,
          tag_id,
          tags!email_sources_tag_id_fkey(
            id,
            name,
            type,
            color,
            emoji
          )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        
      if (sourcesError) {
        console.error('Error fetching email sources:', sourcesError);
      }
      
      console.log('Fetched email sources with explicit join:', emailSources);

      const formattedEvents = data.map(event => {
        // Find matching email source based on sender email
        const senderEmail = event.processed_emails.sender_email;
        console.log('Processing event with sender:', senderEmail);
        console.log('Available email sources:', emailSources?.map(s => ({ email: s.email, hasTag: !!s.tags })));
        
        const matchingSource = emailSources?.find(source => {
          // Extract email from display name format: "Name <email@domain.com>"
          const extractEmailFromDisplayName = (emailStr: string) => {
            const match = emailStr.match(/<([^>]+)>/);
            return match ? match[1] : emailStr;
          };
          
          const cleanSenderEmail = extractEmailFromDisplayName(senderEmail);
          const exactMatch = source.email === cleanSenderEmail;
          const domainMatch = source.email.startsWith('@') && cleanSenderEmail.includes(source.email.substring(1));
          const domainMatch2 = cleanSenderEmail.includes('@') && source.email.includes('@') && 
                               cleanSenderEmail.split('@')[1] === source.email.split('@')[1];
          
          console.log(`Checking ${source.email} vs ${senderEmail} (cleaned: ${cleanSenderEmail}):`, {
            exactMatch,
            domainMatch,
            domainMatch2,
            hasTag: !!source.tags
          });
          
          return exactMatch || domainMatch || domainMatch2;
        });
        
        console.log('Matching source found:', matchingSource);
        const tag = matchingSource?.tags; // With explicit foreign key, this should be an object, not array
        console.log('Final tag:', tag);
        
        // Handle both array and object cases for tags
        const tagData = Array.isArray(tag) ? tag[0] : tag;
        
        return {
          ...event,
          eventDate: new Date(event.event_date + 'T00:00:00'), // Add time to avoid timezone issues
          eventTitle: event.event_title, // Map snake_case to camelCase
          extractedAt: new Date(event.extracted_at),
          confidenceScore: event.confidence_score, // Map snake_case to camelCase
          senderEmail: event.processed_emails.sender_email,
          senderName: event.processed_emails.sender_email.split('@')[0], // Extract name from email
          emailSubject: event.processed_emails.subject,
          emailSentDate: new Date(event.processed_emails.sent_date),
          emailBodyPreview: event.processed_emails.email_body_preview,
          tag: tagData ? {
            id: tagData.id,
            userId: userId,
            name: tagData.name,
            type: tagData.type,
            color: tagData.color,
            emoji: tagData.emoji,
            createdAt: new Date(),
            updatedAt: new Date()
          } : undefined
        }
      })

      // Event data mapping completed successfully
      console.log('Final formatted events:', formattedEvents);

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
    <div className="min-h-screen bg-gray-50">
      {/* Simplified Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">School Calendar</h1>
            {user && (
              <p className="text-sm text-gray-600 mt-1">
                {user.email}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {/* Stats Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowStats(!showStats)}
              className="text-gray-600 hover:text-gray-900"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Stats
              {showStats ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
            </Button>
            
            {/* Actions Dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-600 hover:text-gray-900"
                >
                  <MoreVertical className="h-4 w-4 mr-2" />
                  Actions
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[200px] bg-white rounded-md shadow-lg border border-gray-200 p-1 z-50"
                  sideOffset={5}
                >
                  <DropdownMenu.Item
                    className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-sm cursor-pointer"
                    onClick={handleSyncEmails}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <RefreshCw className="h-4 w-4 mr-3 animate-spin text-blue-600" />
                    ) : (
                      <Download className="h-4 w-4 mr-3 text-blue-600" />
                    )}
                    {isSyncing ? 'Syncing...' : 'Sync Emails'}
                  </DropdownMenu.Item>
                  
                  <DropdownMenu.Item
                    className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-sm cursor-pointer"
                    onClick={handleReprocessEmails}
                    disabled={isSyncing}
                  >
                    <RotateCcw className="h-4 w-4 mr-3 text-orange-600" />
                    Reprocess Emails
                  </DropdownMenu.Item>
                  
                  <DropdownMenu.Item
                    className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-sm cursor-pointer"
                    onClick={handleReAuth}
                    disabled={isSyncing}
                  >
                    <Key className="h-4 w-4 mr-3 text-green-600" />
                    Re-authenticate Gmail
                  </DropdownMenu.Item>
                  
                  <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
                  
                  <DropdownMenu.Item
                    className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-sm cursor-pointer"
                    onClick={() => setShowSettings(!showSettings)}
                  >
                    <Settings className="h-4 w-4 mr-3 text-gray-600" />
                    {showSettings ? 'Hide Settings' : 'Manage Sources'}
                  </DropdownMenu.Item>
                  
                  <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
                  
                  <div className="px-3 py-2">
                    <label htmlFor="lookback-select" className="text-xs font-medium text-gray-500 block mb-1">
                      Email Lookback Period
                    </label>
                    <select
                      id="lookback-select"
                      value={lookbackDays}
                      onChange={(e) => setLookbackDays(parseInt(e.target.value))}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      disabled={isSyncing}
                    >
                      <option value={1}>1 day</option>
                      <option value={3}>3 days</option>
                      <option value={7}>7 days</option>
                      <option value={14}>14 days</option>
                      <option value={21}>21 days</option>
                      <option value={30}>30 days</option>
                    </select>
                  </div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            
            {/* View Selector */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <Button
                variant={view === 'calendar' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('calendar')}
                className="h-8"
              >
                <CalendarIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={view === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('list')}
                className="h-8"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={view === 'summaries' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('summaries')}
                className="h-8"
              >
                <FileText className="h-4 w-4" />
              </Button>
              <Button
                variant={view === 'processing' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('processing')}
                className="h-8"
              >
                <BarChart3 className="h-4 w-4" />
              </Button>
            </div>
            
            <Button onClick={handleLogout} variant="outline" size="sm">
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">

        {/* Collapsible Stats Cards */}
        {showStats && (
          <div className="mb-6">
            <Card className="bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Statistics Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-700">{events.length}</div>
                    <p className="text-sm text-blue-600">Total Events</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-700">{events.filter(event => {
                      const today = new Date()
                      const eventDate = new Date(event.eventDate)
                      return eventDate.toDateString() === today.toDateString()
                    }).length}</div>
                    <p className="text-sm text-green-600">Today</p>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-700">{events.filter(event => new Date(event.eventDate) >= new Date()).length}</div>
                    <p className="text-sm text-orange-600">Upcoming</p>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-700">
                      {events.filter(e => e.isVerified).length}
                    </div>
                    <p className="text-sm text-purple-600">Verified</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}


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

        {/* Main Content - Clean and spacious */}
        <Card className="bg-white shadow-sm">
          <CardHeader className="border-b border-gray-100 bg-gray-50">
            <CardTitle className="text-xl text-gray-800">
              {view === 'calendar' ? 'Calendar View' : 
               view === 'list' ? 'Event List' : 
               view === 'summaries' ? 'Email Summaries' :
               'Processing Dashboard'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {view === 'calendar' ? (
                <Calendar 
                  events={events} 
                  onEventClick={handleEventClick}
                />
              ) : view === 'list' ? (
                <div className="space-y-4">
                  {(() => {
                    // Filter events to start from 2 days back from current date
                    const today = new Date()
                    const twoDaysBack = new Date(today)
                    twoDaysBack.setDate(today.getDate() - 2)
                    
                    const filteredEvents = events.filter(event => {
                      const eventDate = new Date(event.eventDate)
                      return eventDate >= twoDaysBack
                    }).sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())

                    if (filteredEvents.length === 0) {
                      return (
                        <div className="text-center py-16 text-gray-500">
                          <Mail className="h-20 w-20 mx-auto mb-6 text-gray-300" />
                          <h3 className="text-lg font-medium text-gray-700 mb-2">No upcoming events</h3>
                          <p className="text-sm text-gray-500">
                            No events found from 2 days ago onwards. Configure email sources and sync your emails to get started.
                          </p>
                        </div>
                      )
                    }

                    // Group events by date
                    const eventsByDate = filteredEvents.reduce((acc, event) => {
                      const dateKey = new Date(event.eventDate).toDateString()
                      if (!acc[dateKey]) {
                        acc[dateKey] = []
                      }
                      acc[dateKey].push(event)
                      return acc
                    }, {} as Record<string, typeof filteredEvents>)

                    return Object.entries(eventsByDate).map(([dateKey, dayEvents]) => {
                      const date = new Date(dateKey)
                      const isToday = date.toDateString() === today.toDateString()
                      const isYesterday = date.toDateString() === new Date(today.getTime() - 24 * 60 * 60 * 1000).toDateString()
                      const isTomorrow = date.toDateString() === new Date(today.getTime() + 24 * 60 * 60 * 1000).toDateString()
                      
                      let dateLabel = formatDate(date)
                      if (isToday) dateLabel = 'Today'
                      else if (isYesterday) dateLabel = 'Yesterday'  
                      else if (isTomorrow) dateLabel = 'Tomorrow'

                      return (
                        <div key={dateKey} className="space-y-3">
                          {/* Date Header */}
                          <div className={`sticky top-0 z-10 py-2 px-3 rounded-lg ${
                            isToday 
                              ? 'bg-blue-100 border border-blue-200' 
                              : 'bg-gray-100 border border-gray-200'
                          }`}>
                            <h3 className={`font-medium text-sm ${
                              isToday ? 'text-blue-900' : 'text-gray-700'
                            }`}>
                              {dateLabel} {isToday && '📅'}
                              <span className="ml-2 text-xs opacity-75">
                                ({dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''})
                              </span>
                            </h3>
                          </div>
                          
                          {/* Events for this date */}
                          <div className="space-y-2 ml-2">
                            {dayEvents.map((event) => {
                              const eventIsToday = new Date(event.eventDate).toDateString() === today.toDateString()
                              
                              return (
                                <div
                                  key={event.id}
                                  className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-colors ${
                                    eventIsToday 
                                      ? 'border-blue-300 bg-blue-50 hover:bg-blue-100 ring-1 ring-blue-200' 
                                      : 'border-gray-200 hover:bg-gray-50'
                                  }`}
                                  onClick={() => handleEventClick(event)}
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <h3 className={`font-semibold ${eventIsToday ? 'text-blue-900' : ''}`}>
                                        {event.eventTitle}
                                      </h3>
                                      {eventIsToday && (
                                        <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full font-medium">
                                          TODAY
                                        </span>
                                      )}
                                      {event.tag && (
                                        <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium" 
                                             style={{ backgroundColor: `${event.tag.color}20`, color: event.tag.color }}>
                                          {event.tag.type === 'kid' ? (
                                            <User className="h-3 w-3" />
                                          ) : (
                                            <Globe className="h-3 w-3" />
                                          )}
                                          {event.tag.emoji && <span>{event.tag.emoji}</span>}
                                          <span>{event.tag.name}</span>
                                        </div>
                                      )}
                                    </div>
                                    <p className={`text-sm ${eventIsToday ? 'text-blue-700' : 'text-muted-foreground'}`}>
                                      {event.eventTime && `${event.eventTime}`}
                                    </p>
                                    {event.senderName && (
                                      <p className={`text-xs mt-1 ${eventIsToday ? 'text-blue-600' : 'text-muted-foreground'}`}>
                                        From: {event.senderName}
                                      </p>
                                    )}
                                    {event.description && (
                                      <p className={`text-sm mt-1 ${eventIsToday ? 'text-blue-800' : ''}`}>
                                        {event.description}
                                      </p>
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
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              ) : view === 'summaries' ? (
                <EmailSummaries user={user} />
              ) : (
                <ProcessingDashboard user={user} />
              )}
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