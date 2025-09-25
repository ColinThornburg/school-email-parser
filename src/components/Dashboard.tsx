import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import Calendar from './ui/calendar'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Calendar as CalendarIcon, Settings, Mail, Clock, CheckCircle, LogIn, RefreshCw, X, BarChart3, Trash2, FileText, User, Globe, List, MoreVertical, Download, RotateCcw, Key, Activity, Calendar as CalendarIcon2, CheckCircle2, AlertCircle, CalendarCheck, Loader2 } from 'lucide-react'
import { FcGoogle } from 'react-icons/fc'
import { motion, AnimatePresence } from 'framer-motion'
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
  const [processingPhase, setProcessingPhase] = useState<string>('')
  const [processingProgress, setProcessingProgress] = useState<{
    current: number;
    total: number;
    emailsProcessed: number;
    eventsExtracted: number;
  }>({ current: 0, total: 0, emailsProcessed: 0, eventsExtracted: 0 })
  const [showSettings, setShowSettings] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<ExtractedDate | null>(null)
  const [eventToDelete, setEventToDelete] = useState<ExtractedDate | null>(null)
  const [lookbackDays, setLookbackDays] = useState(7)
  const [calendarSyncingEventId, setCalendarSyncingEventId] = useState<string | null>(null)

  const updateEventState = (eventId: string, updater: (current: ExtractedDate) => ExtractedDate) => {
    setEvents(prevEvents => prevEvents.map(event => (event.id === eventId ? updater(event) : event)))
    setSelectedEvent(prevSelected => (prevSelected && prevSelected.id === eventId ? updater(prevSelected) : prevSelected))
  }

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

        const syncedAt = event.google_calendar_synced_at
          ? new Date(event.google_calendar_synced_at)
          : undefined

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
          } : undefined,
          googleCalendarEventId: event.google_calendar_event_id || undefined,
          googleCalendarSyncedAt: syncedAt,
          googleCalendarSyncStatus: event.google_calendar_sync_status || undefined,
          googleCalendarSyncError: event.google_calendar_sync_error || undefined
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

  const handleSyncToCalendar = async (event: ExtractedDate) => {
    if (!user) {
      alert('Please reconnect your Gmail account before syncing to Google Calendar.')
      return
    }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    const eventDateString = event.eventDate instanceof Date
      ? event.eventDate.toISOString().split('T')[0]
      : new Date(event.eventDate).toISOString().split('T')[0]

    setCalendarSyncingEventId(event.id)
    updateEventState(event.id, current => ({
      ...current,
      googleCalendarSyncStatus: 'pending',
      googleCalendarSyncError: undefined
    }))

    try {
      const response = await fetch('/api/sync-calendar-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.id,
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          timeZone,
          event: {
            id: event.id,
            title: event.eventTitle,
            date: eventDateString,
            time: event.eventTime || null,
            description: event.description || null,
            emailSubject: event.emailSubject || null,
            location: undefined,
            durationMinutes: event.eventTime ? 60 : null,
            calendarEventId: event.googleCalendarEventId || null
          }
        })
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = result.error || 'Failed to sync event to Google Calendar'
        throw new Error(message)
      }

      const calendarEventId = result.calendarEventId || event.googleCalendarEventId
      const syncedAt = new Date()

      updateEventState(event.id, current => ({
        ...current,
        googleCalendarEventId: calendarEventId,
        googleCalendarSyncedAt: syncedAt,
        googleCalendarSyncStatus: 'synced',
        googleCalendarSyncError: undefined
      }))

      alert('Event synced to Google Calendar.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error syncing to Google Calendar'
      console.error('Google Calendar sync error:', error)
      updateEventState(event.id, current => ({
        ...current,
        googleCalendarSyncStatus: 'error',
        googleCalendarSyncError: message
      }))
      const needsReauth = /expired|invalid|token|refresh/i.test(message)
      const friendlyMessage = needsReauth
        ? `Google needs a fresh permission slip. Re-authenticate Gmail to renew your access, then try again.\n\nDetails: ${message}`
        : `Failed to sync event to Google Calendar: ${message}`
      alert(friendlyMessage)
    } finally {
      setCalendarSyncingEventId(null)
    }
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
    setProcessingPhase('🔍 Connecting to Gmail and preparing to sync...')
    setProcessingProgress({ current: 0, total: 0, emailsProcessed: 0, eventsExtracted: 0 })

    try {
      setProcessingPhase('📧 Retrieving emails from Gmail...')

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

      setProcessingPhase('🤖 Processing emails with AI...')

      const result = await response.json()

      // Update progress with final results
      setProcessingProgress({
        current: result.processed || 0,
        total: result.processed || 0,
        emailsProcessed: result.processed || 0,
        eventsExtracted: result.extracted || 0
      })

      setProcessingPhase('🔄 Refreshing your calendar...')

      // Refresh events after sync
      await fetchEvents(user.id)

      setProcessingPhase('✅ Sync completed successfully!')

      // Show completion message briefly before hiding banner
      setTimeout(() => {
        setProcessingPhase('')
      }, 2000)

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

      setProcessingPhase('❌ Sync failed')

      // Show error briefly before hiding banner
      setTimeout(() => {
        setProcessingPhase('')
      }, 3000)

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
    setProcessingPhase('🔄 Preparing to reprocess all emails...')
    setProcessingProgress({ current: 0, total: 0, emailsProcessed: 0, eventsExtracted: 0 })

    try {
      setProcessingPhase('🗑️ Cleaning up existing data...')

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

      setProcessingPhase('📧 Retrieving emails from Gmail (90-day history)...')

      // Since reprocessing can take longer, we'll show an intermediate phase
      setTimeout(() => {
        if (isSyncing) {
          setProcessingPhase('🤖 Processing emails with AI (this may take a while)...')
        }
      }, 3000)

      const result = await response.json()

      // Update progress with final results
      setProcessingProgress({
        current: result.processed || 0,
        total: result.processed || 0,
        emailsProcessed: result.processed || 0,
        eventsExtracted: result.extracted || 0
      })

      setProcessingPhase('🔄 Refreshing your calendar...')

      // Refresh events after reprocessing
      await fetchEvents(user.id)

      setProcessingPhase('✅ Reprocessing completed successfully!')

      // Show completion message briefly before hiding banner
      setTimeout(() => {
        setProcessingPhase('')
      }, 2000)

      let message = `Reprocessing completed! Processed ${result.processed} emails and extracted ${result.extracted} dates.\nUsed ${lookbackDays}-day lookback period (reprocess uses up to 90 days).`
      if (result.duplicatesRemoved > 0) {
        message += `\nRemoved ${result.duplicatesRemoved} duplicate events during cleanup.`
      }

      alert(message)
    } catch (error) {
      console.error('Error reprocessing emails:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      setProcessingPhase('❌ Reprocessing failed')

      // Show error briefly before hiding banner
      setTimeout(() => {
        setProcessingPhase('')
      }, 3000)

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
          <p className="text-slate-300">Loading...</p>
        </div>
      </div>
    )
  }

  // Show authentication screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full rounded-2xl border border-white/12 bg-white/10 p-8 text-slate-100 shadow-[0_35px_75px_-35px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
          <div className="text-center">
            <Mail className="h-16 w-16 mx-auto mb-4 text-primary" />
            <h1 className="text-2xl font-bold mb-2 text-slate-100">School Email Parser</h1>
            <p className="text-slate-300 mb-6">
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
    <div className="min-h-screen text-slate-100">
      {/* Simplified Header */}
      <div className="bg-white/10 border-b border-white/10 backdrop-blur-2xl px-4 py-4 shadow-[0_20px_45px_-28px_rgba(0,0,0,0.8)] sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:w-auto">
            <h1 className="text-2xl font-semibold text-slate-100">School Calendar</h1>
            {user && (
              <p className="text-sm text-slate-300 mt-1 truncate">
                {user.email}
              </p>
            )}
          </div>
          
          <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            {/* Stats Dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-slate-100 hover:text-primary sm:w-auto sm:justify-center"
                >
                  <Activity className="h-4 w-4 mr-2" />
                  Stats
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[280px] rounded-2xl border border-white/15 bg-white/10 p-3 text-foreground shadow-[0_25px_55px_-25px_rgba(0,0,0,0.85)] backdrop-blur-2xl z-50"
                  sideOffset={5}
                >
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-slate-100 mb-2">Event Statistics</div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-3 p-2 rounded-xl border border-white/10 bg-white/10">
                        <div className="p-1.5 rounded-full bg-primary/30">
                          <Activity className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="text-lg font-bold text-slate-50">{events.length}</div>
                          <div className="text-xs text-slate-300">Total Events</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 p-2 rounded-xl border border-white/10 bg-white/10">
                        <div className="p-1.5 rounded-full bg-emerald-500/30">
                          <CalendarIcon2 className="h-4 w-4 text-emerald-200" />
                        </div>
                        <div>
                          <div className="text-lg font-bold text-slate-50">
                            {events.filter(event => {
                              const today = new Date()
                              const eventDate = new Date(event.eventDate)
                              return eventDate.toDateString() === today.toDateString()
                            }).length}
                          </div>
                          <div className="text-xs text-slate-300">Today</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 p-2 rounded-xl border border-white/10 bg-white/10">
                        <div className="p-1.5 rounded-full bg-amber-500/30">
                          <AlertCircle className="h-4 w-4 text-amber-200" />
                        </div>
                        <div>
                          <div className="text-lg font-bold text-slate-50">
                            {events.filter(event => new Date(event.eventDate) >= new Date()).length}
                          </div>
                          <div className="text-xs text-slate-300">Upcoming</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 p-2 rounded-xl border border-white/10 bg-white/10">
                        <div className="p-1.5 rounded-full bg-purple-500/30">
                          <CheckCircle2 className="h-4 w-4 text-purple-200" />
                        </div>
                        <div>
                          <div className="text-lg font-bold text-slate-50">
                            {events.filter(e => e.isVerified).length}
                          </div>
                          <div className="text-xs text-slate-300">Verified</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            
            {/* Actions Dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-slate-100 hover:text-primary sm:w-auto sm:justify-center"
                >
                  <MoreVertical className="h-4 w-4 mr-2" />
                  Actions
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[200px] rounded-2xl border border-white/15 bg-white/10 p-1 text-foreground shadow-[0_25px_55px_-25px_rgba(0,0,0,0.85)] backdrop-blur-2xl z-50"
                  sideOffset={5}
                >
                  <DropdownMenu.Item
                    className="flex items-center px-3 py-2 text-sm text-slate-100 hover:bg-white/15 rounded-md cursor-pointer"
                    onClick={handleSyncEmails}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <RefreshCw className="h-4 w-4 mr-3 animate-spin text-primary" />
                    ) : (
                      <Download className="h-4 w-4 mr-3 text-primary" />
                    )}
                    {isSyncing ? (
                      <div className="flex flex-col">
                        <span>Syncing...</span>
                        {processingPhase && (
                          <span className="text-xs text-slate-300 mt-1">{processingPhase}</span>
                        )}
                      </div>
                    ) : 'Sync Emails'}
                  </DropdownMenu.Item>
                  
                  <DropdownMenu.Item
                    className="flex items-center px-3 py-2 text-sm text-slate-100 hover:bg-white/15 rounded-md cursor-pointer"
                    onClick={handleReprocessEmails}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <RefreshCw className="h-4 w-4 mr-3 animate-spin text-amber-300" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-3 text-amber-300" />
                    )}
                    {isSyncing ? (
                      <div className="flex flex-col">
                        <span>Reprocessing...</span>
                        {processingPhase && (
                          <span className="text-xs text-slate-300 mt-1">{processingPhase}</span>
                        )}
                      </div>
                    ) : 'Reprocess Emails'}
                  </DropdownMenu.Item>
                  
                  <DropdownMenu.Item
                    className="flex items-center px-3 py-2 text-sm text-slate-100 hover:bg-white/15 rounded-md cursor-pointer"
                    onClick={handleReAuth}
                    disabled={isSyncing}
                  >
                    <Key className="h-4 w-4 mr-3 text-emerald-200" />
                    Re-authenticate Gmail
                  </DropdownMenu.Item>
                  
                  <DropdownMenu.Separator className="h-px bg-white/10 my-1" />
                  
                  <DropdownMenu.Item
                    className="flex items-center px-3 py-2 text-sm text-slate-100 hover:bg-white/15 rounded-md cursor-pointer"
                    onClick={() => setShowSettings(!showSettings)}
                  >
                    <Settings className="h-4 w-4 mr-3 text-slate-200" />
                    {showSettings ? 'Hide Settings' : 'Manage Sources'}
                  </DropdownMenu.Item>
                  
                  <DropdownMenu.Separator className="h-px bg-white/10 my-1" />
                  
                  <div className="px-3 py-2">
                    <label htmlFor="lookback-select" className="text-xs font-medium text-slate-200 block mb-1">
                      Email Lookback Period
                    </label>
                    <select
                      id="lookback-select"
                      value={lookbackDays}
                      onChange={(e) => setLookbackDays(parseInt(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-md border border-white/15 bg-white/10 text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
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
            <div className="w-full sm:hidden">
              <label className="text-xs font-medium text-slate-200 block mb-1">
                View
              </label>
              <select
                value={view}
                onChange={(event) => setView(event.target.value as typeof view)}
                className="w-full px-3 py-2 text-sm rounded-md border border-white/15 bg-white/10 text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="calendar">Calendar</option>
                <option value="list">Event List</option>
                <option value="summaries">Email Summaries</option>
                <option value="processing">Processing Dashboard</option>
              </select>
            </div>
            <div className="hidden sm:flex bg-white/10 rounded-lg p-1">
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
            
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
            >
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Processing Status Banner */}
        {isSyncing && (
          <div className="mb-6 rounded-2xl border border-white/12 bg-white/10 p-5 text-slate-100 shadow-[0_25px_55px_-25px_rgba(0,0,0,0.85)] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
                <div>
                  <h3 className="text-base font-medium text-slate-100 sm:text-lg">
                    {processingPhase || 'Processing emails...'}
                  </h3>
                  {processingProgress.total > 0 && (
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap gap-3 text-sm text-slate-200/90">
                        <span>
                          {processingProgress.current} of {processingProgress.total} emails
                        </span>
                        {processingProgress.emailsProcessed > 0 && (
                          <span>
                            {processingProgress.emailsProcessed} processed
                          </span>
                        )}
                        {processingProgress.eventsExtracted > 0 && (
                          <span>
                            {processingProgress.eventsExtracted} events found
                          </span>
                        )}
                      </div>
                      <div className="w-full h-2 rounded-full bg-white/10">
                        <div
                          className="h-2 rounded-full bg-primary/70 transition-all duration-300 ease-out"
                          style={{
                            width: `${Math.round((processingProgress.current / processingProgress.total) * 100)}%`
                          }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 sm:self-center">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary">
                  Processing
                </span>
              </div>
            </div>
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
        <Card className="shadow-[0_30px_60px_-35px_rgba(0,0,0,0.8)]">
          <CardHeader className="border-b border-white/10 bg-white/5">
            <CardTitle className="text-xl text-slate-100">
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
                  onSyncRequest={handleSyncToCalendar}
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
                        <div className="text-center py-16 text-slate-300">
                          <Mail className="h-20 w-20 mx-auto mb-6 text-slate-500" />
                          <h3 className="text-lg font-medium text-slate-100 mb-2">No upcoming events</h3>
                          <p className="text-sm text-slate-300">
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
                          <div className={`sticky top-0 z-10 py-2 px-3 rounded-lg backdrop-blur-xl ${
                            isToday 
                              ? 'bg-primary/25 border border-primary/35' 
                              : 'bg-white/8 border border-white/12'
                          }`}>
                            <h3 className={`font-medium text-sm ${
                              isToday ? 'text-primary-foreground' : 'text-slate-200'
                            }`}>
                              {dateLabel} {isToday && '📅'}
                              <span className="ml-2 text-xs opacity-75">
                                ({dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''})
                              </span>
                            </h3>
                          </div>
                          
                          {/* Events for this date */}
                          <div className="relative mt-3 space-y-4 sm:mt-0 sm:ml-2">
                            <AnimatePresence>
                              {dayEvents.map((event, index) => {
                                const eventIsToday = new Date(event.eventDate).toDateString() === today.toDateString()
                                const stackDepth = dayEvents.length - index

                                return (
                                  <motion.div
                                    key={event.id}
                                    layout
                                    custom={index}
                                    initial={{ opacity: 0, y: 24, scale: 0.98, filter: 'blur(2px)' }}
                                    animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, y: -20, scale: 0.96, filter: 'blur(2px)' }}
                                    whileHover={{
                                      y: -8,
                                      scale: 1.03,
                                      boxShadow: '0 45px 90px -45px rgba(4, 33, 41, 0.95)',
                                      background: eventIsToday
                                        ? 'linear-gradient(135deg, rgba(11,139,153,0.4), rgba(6,84,93,0.65))'
                                        : 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(39,183,183,0.15))',
                                      borderColor: eventIsToday ? 'rgba(25, 167, 179, 0.55)' : 'rgba(255,255,255,0.35)'
                                    }}
                                    transition={{ type: 'spring', stiffness: 220, damping: 28, mass: 1 }}
                                    style={{
                                      zIndex: stackDepth,
                                      marginLeft: index * 8,
                                      marginRight: index * 6,
                                    }}
                                    className={`relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border rounded-2xl cursor-pointer transition-colors backdrop-blur-2xl ${
                                      eventIsToday 
                                        ? 'border-primary/45 bg-primary/20 ring-1 ring-primary/25' 
                                        : 'border-white/14 bg-white/10'
                                    }`}
                                    onClick={() => handleEventClick(event)}
                                  >
                                  <div className="flex-1 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3 className={`font-semibold ${eventIsToday ? 'text-primary-foreground' : 'text-slate-100'}`}>
                                        {event.eventTitle}
                                      </h3>
                                      {eventIsToday && (
                                        <span className="px-2 py-1 bg-primary text-primary-foreground text-xs rounded-full font-medium">
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
                                    <p className={`text-sm ${eventIsToday ? 'text-primary-foreground/80' : 'text-slate-300'}`}>
                                      {event.eventTime && `${event.eventTime}`}
                                    </p>
                                    {event.senderName && (
                                      <p className={`text-xs mt-1 ${eventIsToday ? 'text-primary-foreground/70' : 'text-slate-300/80'}`}>
                                        From: {event.senderName}
                                      </p>
                                    )}
                                    {event.description && (
                                      <p className={`text-sm mt-1 ${eventIsToday ? 'text-primary-foreground' : 'text-slate-100'}`}>
                                        {event.description}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-2 mt-2">
                                      {event.googleCalendarSyncStatus === 'synced' && (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-400/20 text-emerald-100 text-xs">
                                          <CalendarCheck className="h-3 w-3" />
                                          Synced
                                        </span>
                                      )}
                                      {event.googleCalendarSyncStatus === 'pending' && (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/25 text-primary text-xs">
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                          Syncing
                                        </span>
                                      )}
                                      {event.googleCalendarSyncStatus === 'error' && (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-500/20 text-rose-200 text-xs">
                                          <AlertCircle className="h-3 w-3" />
                                          Sync failed
                                        </span>
                                      )}
                                      {event.googleCalendarSyncStatus === 'synced' && event.googleCalendarSyncedAt && (
                                        <span className="text-[11px] text-slate-300/80">
                                          {`Synced ${event.googleCalendarSyncedAt.toLocaleDateString()}`}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 self-start sm:self-auto">
                                    <span
                                      className={`px-2 py-1 rounded-full text-xs backdrop-blur-xl ${
                                        event.confidenceScore >= 0.9
                                          ? 'bg-emerald-400/25 text-emerald-100'
                                          : event.confidenceScore >= 0.8
                                          ? 'bg-amber-400/25 text-amber-100'
                                          : 'bg-rose-500/25 text-rose-100'
                                      }`}
                                    >
                                      {Math.round(event.confidenceScore * 100)}%
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleSyncToCalendar(event)
                                      }}
                                      className="h-8 w-8 p-0"
                                      title="Sync to Google Calendar"
                                    >
                                      <FcGoogle className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => confirmDeleteEvent(event, e)}
                                      className="h-8 w-8 p-0 text-rose-300 hover:text-rose-200 hover:bg-white/15"
                                      title="Delete event"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                    {event.isVerified && (
                                      <CheckCircle className="h-4 w-4 text-emerald-200" />
                                    )}
                                  </div>
                                  </motion.div>
                                )
                              })}
                            </AnimatePresence>
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4">
          <div className="h-full w-full overflow-y-auto rounded-none border-none bg-white/10 p-5 text-slate-100 shadow-[0_35px_75px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:max-h-[80vh] sm:max-w-lg sm:rounded-2xl sm:border sm:border-white/12 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-100">Event Details</h2>
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
                <h3 className="text-lg font-semibold text-slate-50">{selectedEvent.eventTitle}</h3>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-slate-300">
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
                  <h4 className="font-medium mb-1 text-slate-100">Description</h4>
                  <p className="text-sm text-slate-300/90">{selectedEvent.description}</p>
                </div>
              )}
              
              <div>
                <h4 className="font-medium mb-2 text-slate-100">Email Source</h4>
                <div className="text-sm text-slate-300 space-y-2">
                  {selectedEvent.emailSubject && (
                    <div>
                      <span className="font-medium text-slate-200">Subject: </span>
                      <span className="text-slate-50">{selectedEvent.emailSubject}</span>
                    </div>
                  )}
                  
                  <div>
                    <span className="font-medium text-slate-200">From: </span>
                    <span>{selectedEvent.senderName || selectedEvent.senderEmail}</span>
                    {selectedEvent.senderEmail && selectedEvent.senderName && (
                      <span className="block text-xs opacity-75 ml-0 mt-1 text-slate-400">
                        {selectedEvent.senderEmail}
                      </span>
                    )}
                  </div>
                  
                  {selectedEvent.emailSentDate && (
                    <div>
                      <span className="font-medium text-slate-200">Sent: </span>
                      <span className="text-slate-50">{selectedEvent.emailSentDate.toLocaleDateString()} at {selectedEvent.emailSentDate.toLocaleTimeString()}</span>
                    </div>
                  )}
                  
                  {selectedEvent.emailBodyPreview && (
                    <div className="mt-3">
                      <span className="font-medium text-slate-200 block mb-1">Email Preview:</span>
                      <div className="max-h-20 overflow-y-auto rounded-md border border-white/10 bg-white/8 p-3 text-xs text-slate-200/90">
                        {selectedEvent.emailBodyPreview}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {selectedEvent.reasoning && (
                <div className="pt-3 border-t border-white/10">
                  <h4 className="font-medium mb-2 text-slate-100">LLM Reasoning</h4>
                  <div className="rounded-xl border border-white/12 bg-white/8 p-4 text-sm">
                    <p className="text-slate-100 italic">
                      "{selectedEvent.reasoning}"
                    </p>
                    <p className="mt-2 text-xs text-slate-300/80">
                      This explains why the AI extracted this specific date from the email content.
                    </p>
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-200/90">Confidence:</span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs backdrop-blur-xl ${
                      selectedEvent.confidenceScore >= 0.9
                        ? 'bg-emerald-400/25 text-emerald-100'
                        : selectedEvent.confidenceScore >= 0.8
                        ? 'bg-amber-400/25 text-amber-100'
                        : 'bg-rose-500/25 text-rose-100'
                    }`}
                  >
                    {Math.round(selectedEvent.confidenceScore * 100)}%
                  </span>
                </div>
                
                {selectedEvent.isVerified && (
                  <div className="flex items-center gap-1 text-emerald-200">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">Verified</span>
                  </div>
                )}
              </div>
              
              <div className="text-xs text-slate-300/80">
                Extracted: {selectedEvent.extractedAt.toLocaleDateString()}
              </div>
              
              <div className="pt-4 border-t border-white/10 mt-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                      <CalendarIcon className="h-4 w-4" />
                      Google Calendar
                    </div>
                    <p className="text-xs text-slate-300/80 mt-1">
                      {selectedEvent.googleCalendarSyncStatus === 'synced'
                        ? selectedEvent.googleCalendarSyncedAt
                          ? `Last synced ${selectedEvent.googleCalendarSyncedAt.toLocaleString()}`
                          : 'Synced to Google Calendar.'
                        : selectedEvent.googleCalendarSyncStatus === 'pending'
                        ? 'Syncing with Google Calendar...'
                        : 'Not yet synced to Google Calendar.'}
                    </p>
                    {selectedEvent.googleCalendarSyncError && (
                      <p className="text-xs text-rose-300 mt-2 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {selectedEvent.googleCalendarSyncError}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSyncToCalendar(selectedEvent)}
                    disabled={calendarSyncingEventId === selectedEvent.id}
                    className="flex items-center gap-2 border-white/20 bg-white/10 text-slate-100 hover:bg-white/20"
                  >
                    {calendarSyncingEventId === selectedEvent.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Syncing...
                      </>
                    ) : selectedEvent.googleCalendarSyncStatus === 'synced' ? (
                      <>
                        <CalendarCheck className="h-4 w-4" />
                        Update Calendar Event
                      </>
                    ) : (
                      <>
                        <CalendarIcon className="h-4 w-4" />
                        Sync to Google Calendar
                      </>
                    )}
                  </Button>
                </div>

                <div className="flex items-center gap-2">
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
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {eventToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-white/10 p-6 text-slate-100 shadow-[0_35px_75px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-full bg-rose-500/25 p-2">
                <Trash2 className="h-5 w-5 text-rose-200" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Delete Event</h2>
                <p className="text-sm text-slate-300">This action cannot be undone</p>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-slate-200 mb-2">
                Are you sure you want to delete this event?
              </p>
              <div className="rounded-xl border border-white/12 bg-white/8 p-3">
                <p className="font-medium text-slate-100">{eventToDelete.eventTitle}</p>
                <p className="text-sm text-slate-300">
                  {formatDate(eventToDelete.eventDate)}
                  {eventToDelete.eventTime && ` at ${eventToDelete.eventTime}`}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 justify-end">
              <Button
                variant="ghost"
                onClick={cancelDelete}
                className="text-slate-200 hover:bg-white/10"
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
