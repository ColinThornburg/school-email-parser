import { useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, CalendarCheck, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from './button'
import { ExtractedDate } from '../../types'
import { FcGoogle } from 'react-icons/fc'

interface CalendarProps {
  events: ExtractedDate[]
  onEventClick?: (event: ExtractedDate) => void
  onSyncRequest?: (event: ExtractedDate) => void
}

export default function Calendar({ events, onEventClick, onSyncRequest }: CalendarProps) {
  // Start with today's week
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date()
    const dayOfWeek = today.getDay() // 0 = Sunday
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - dayOfWeek) // Start on Sunday
    return startOfWeek
  })

  // Generate 7 days starting from currentWeekStart
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(currentWeekStart)
    date.setDate(currentWeekStart.getDate() + i)
    return date
  })

  // Get events for the current week
  const weekEvents = events.filter(event => {
    const eventDate = new Date(event.eventDate)
    const startOfWeek = new Date(currentWeekStart)
    const endOfWeek = new Date(currentWeekStart)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    endOfWeek.setHours(23, 59, 59, 999)
    
    // Calendar date filtering works correctly
    
    return eventDate >= startOfWeek && eventDate <= endOfWeek
  })

  // Group events by date
  const eventsByDate = weekEvents.reduce((acc, event) => {
    const eventDate = new Date(event.eventDate)
    const dateKey = `${eventDate.getFullYear()}-${(eventDate.getMonth() + 1).toString().padStart(2, '0')}-${eventDate.getDate().toString().padStart(2, '0')}`
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(event)
    return acc
  }, {} as Record<string, ExtractedDate[]>)

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeekStart(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setDate(prev.getDate() - 7)
      } else {
        newDate.setDate(prev.getDate() + 7)
      }
      return newDate
    })
  }

  const goToToday = () => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - dayOfWeek)
    setCurrentWeekStart(startOfWeek)
  }

  // Helper function to navigate to a specific date (for future use)
  // const goToDate = (targetDate: Date) => {
  //   const dayOfWeek = targetDate.getDay()
  //   const startOfWeek = new Date(targetDate)
  //   startOfWeek.setDate(targetDate.getDate() - dayOfWeek)
  //   setCurrentWeekStart(startOfWeek)
  // }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isPastDate = (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const compareDate = new Date(date)
    compareDate.setHours(0, 0, 0, 0)
    return compareDate < today
  }

  const formatWeekRange = () => {
    const endOfWeek = new Date(currentWeekStart)
    endOfWeek.setDate(currentWeekStart.getDate() + 6)
    
    const startMonth = monthNames[currentWeekStart.getMonth()]
    const endMonth = monthNames[endOfWeek.getMonth()]
    const startYear = currentWeekStart.getFullYear()
    const endYear = endOfWeek.getFullYear()
    
    if (startYear === endYear && startMonth === endMonth) {
      return `${startMonth} ${currentWeekStart.getDate()}-${endOfWeek.getDate()}, ${startYear}`
    } else if (startYear === endYear) {
      return `${startMonth} ${currentWeekStart.getDate()} - ${endMonth} ${endOfWeek.getDate()}, ${startYear}`
    } else {
      return `${startMonth} ${currentWeekStart.getDate()}, ${startYear} - ${endMonth} ${endOfWeek.getDate()}, ${endYear}`
    }
  }

  const getDateKey = (date: Date) => {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
  }

  return (
    <div className="w-full">
      {/* Calendar Header */}
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold sm:text-xl">
          {formatWeekRange()}
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateWeek('prev')}
            className="w-full justify-center sm:w-auto"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            className="w-full justify-center sm:w-auto"
          >
            This Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateWeek('next')}
            className="w-full justify-center sm:w-auto"
          >
            Next Week
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week View */}
      <div
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:grid md:grid-cols-7 md:gap-2 md:overflow-visible md:pb-0"
      >
        {weekDays.map((date, index) => {
          const dateKey = getDateKey(date)
          const dayEvents = eventsByDate[dateKey] || []
          
          return (
            <div
              key={index}
              className={`
                min-w-[220px] shrink-0 p-3 border rounded-2xl relative bg-white/8 backdrop-blur-xl
                ${isToday(date) ? 'ring-2 ring-primary bg-primary/15' : ''}
                ${isPastDate(date) ? 'opacity-60' : ''}
                md:min-w-0 md:min-h-[220px]
              `}
            >
              {/* Day Header */}
              <div className="mb-3 pb-2 border-b md:text-center">
                <div className="text-xs font-medium text-muted-foreground">
                  {dayNames[date.getDay()]}
                </div>
                <div className={`
                  text-lg font-semibold
                  ${isToday(date) ? 'text-primary' : 'text-foreground'}
                `}>
                  {date.getDate()}
                </div>
                <div className="text-xs text-muted-foreground">
                  {monthNames[date.getMonth()]}
                </div>
              </div>

              {/* Events */}
              <div className="space-y-2">
                {dayEvents.map((event) => (
                  <div
                    key={event.id}
                    className={`
                      text-xs p-2 rounded-xl cursor-pointer transition-colors backdrop-blur-xl border
                      ${event.confidenceScore >= 0.9 
                        ? 'bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30 border-emerald-400/30' 
                        : event.confidenceScore >= 0.8
                        ? 'bg-amber-400/25 text-amber-100 hover:bg-amber-400/35 border-amber-400/25'
                        : 'bg-rose-500/25 text-rose-100 hover:bg-rose-500/35 border-rose-500/25'
                      }
                    `}
                    onClick={() => onEventClick?.(event)}
                    title={`${event.eventTitle}\n${event.description || ''}\nConfidence: ${Math.round(event.confidenceScore * 100)}%`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      {event.eventTime ? (
                        <div className="flex items-center gap-1 font-medium">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          <span>{event.eventTime}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wide opacity-70">All day</span>
                      )}
                      {event.googleCalendarSyncStatus === 'synced' && (
                        <CalendarCheck className="h-3 w-3 text-emerald-200 flex-shrink-0" />
                      )}
                      {event.googleCalendarSyncStatus === 'pending' && (
                        <Loader2 className="h-3 w-3 text-primary flex-shrink-0 animate-spin" />
                      )}
                      {event.googleCalendarSyncStatus === 'error' && (
                        <AlertCircle className="h-3 w-3 text-rose-300 flex-shrink-0" />
                      )}
                    </div>
                    <div className="font-medium leading-tight text-slate-100">
                      {event.eventTitle || event.description || 'Untitled Event'}
                    </div>
                    {event.senderName && (
                      <div className="mt-1 text-xs opacity-80 text-slate-200 font-medium">
                        From: {event.senderName}
                      </div>
                    )}
                    {event.description && (
                      <div className="mt-1 text-xs opacity-80 text-slate-200/90 line-clamp-2">
                        {event.description}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSyncRequest?.(event)
                        }}
                        className="h-7 w-7 rounded-full"
                        title="Sync to Google Calendar"
                      >
                        <FcGoogle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {dayEvents.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4">
                    No events
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-6 text-xs sm:gap-6">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border border-emerald-300/60 bg-emerald-400/40"></div>
          <span>High Confidence (90%+)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border border-amber-300/60 bg-amber-400/40"></div>
          <span>Medium Confidence (80-89%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border border-rose-300/60 bg-rose-500/40"></div>
          <span>Low Confidence (&lt;80%)</span>
        </div>
      </div>
    </div>
  )
}
