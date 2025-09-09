import { useState } from 'react'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { Button } from './button'
import { ExtractedDate } from '../../types'

interface CalendarProps {
  events: ExtractedDate[]
  onEventClick?: (event: ExtractedDate) => void
}

export default function Calendar({ events, onEventClick }: CalendarProps) {
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

  const goToDate = (targetDate: Date) => {
    const dayOfWeek = targetDate.getDay()
    const startOfWeek = new Date(targetDate)
    startOfWeek.setDate(targetDate.getDate() - dayOfWeek)
    setCurrentWeekStart(startOfWeek)
  }

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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">
          {formatWeekRange()}
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateWeek('prev')}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
          >
            This Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateWeek('next')}
          >
            Next Week
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week View */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((date, index) => {
          const dateKey = getDateKey(date)
          const dayEvents = eventsByDate[dateKey] || []
          
          return (
            <div
              key={index}
              className={`
                min-h-[200px] p-3 border rounded-lg relative
                ${isToday(date) ? 'ring-2 ring-primary bg-primary/5' : 'bg-background'}
                ${isPastDate(date) ? 'opacity-60' : ''}
              `}
            >
              {/* Day Header */}
              <div className="text-center mb-3 pb-2 border-b">
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
                      text-xs p-2 rounded cursor-pointer hover:opacity-80 transition-opacity
                      ${event.confidenceScore >= 0.9 
                        ? 'bg-green-100 text-green-800 hover:bg-green-200 border-l-2 border-green-500' 
                        : event.confidenceScore >= 0.8
                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-l-2 border-yellow-500'
                        : 'bg-red-100 text-red-800 hover:bg-red-200 border-l-2 border-red-500'
                      }
                    `}
                    onClick={() => onEventClick?.(event)}
                    title={`${event.eventTitle}\n${event.description || ''}\nConfidence: ${Math.round(event.confidenceScore * 100)}%`}
                  >
                    {event.eventTime && (
                      <div className="flex items-center gap-1 mb-1 font-medium">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        <span>{event.eventTime}</span>
                      </div>
                    )}
                    <div className="font-medium leading-tight">
                      {event.eventTitle || event.event_title || event.description || 'Untitled Event'}
                    </div>
                    {event.senderName && (
                      <div className="mt-1 text-xs opacity-60 font-medium">
                        From: {event.senderName}
                      </div>
                    )}
                    {event.description && (
                      <div className="mt-1 text-xs opacity-75 line-clamp-2">
                        {event.description}
                      </div>
                    )}
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
      <div className="flex items-center gap-6 mt-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded border-l-2 border-green-600"></div>
          <span>High Confidence (90%+)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-500 rounded border-l-2 border-yellow-600"></div>
          <span>Medium Confidence (80-89%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded border-l-2 border-red-600"></div>
          <span>Low Confidence (&lt;80%)</span>
        </div>
      </div>
    </div>
  )
}