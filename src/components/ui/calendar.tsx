import { useState } from 'react'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { Button } from './button'
import { ExtractedDate } from '../../types'

interface CalendarProps {
  events: ExtractedDate[]
  onEventClick?: (event: ExtractedDate) => void
}

export default function Calendar({ events, onEventClick }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())

  // Get the first day of the month and the number of days
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
  const firstDayOfWeek = firstDayOfMonth.getDay() // 0 = Sunday
  const daysInMonth = lastDayOfMonth.getDate()

  // Get events for the current month
  const monthEvents = events.filter(event => {
    const eventDate = new Date(event.eventDate)
    return eventDate.getMonth() === currentDate.getMonth() && 
           eventDate.getFullYear() === currentDate.getFullYear()
  })

  // Group events by date
  const eventsByDate = monthEvents.reduce((acc, event) => {
    const dateKey = new Date(event.eventDate).getDate().toString()
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(event)
    return acc
  }, {} as Record<string, ExtractedDate[]>)

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1)
      } else {
        newDate.setMonth(prev.getMonth() + 1)
      }
      return newDate
    })
  }

  const isToday = (day: number) => {
    const today = new Date()
    return today.getDate() === day && 
           today.getMonth() === currentDate.getMonth() && 
           today.getFullYear() === currentDate.getFullYear()
  }

  const isPastDate = (day: number) => {
    const today = new Date()
    const cellDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
    today.setHours(0, 0, 0, 0)
    cellDate.setHours(0, 0, 0, 0)
    return cellDate < today
  }

  // Generate calendar days including empty cells for padding
  const calendarDays = []
  
  // Add empty cells for days before the first day of the month
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null)
  }
  
  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day)
  }

  return (
    <div className="w-full">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateMonth('prev')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateMonth('next')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map(day => (
          <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, index) => (
          <div
            key={index}
            className={`
              min-h-[120px] p-2 border rounded-lg relative
              ${day === null ? 'bg-muted/30' : 'bg-background hover:bg-muted/50'}
              ${day && isToday(day) ? 'ring-2 ring-primary' : ''}
              ${day && isPastDate(day) ? 'opacity-60' : ''}
            `}
          >
            {day && (
              <>
                {/* Day Number */}
                <div className={`
                  text-sm font-medium mb-1
                  ${isToday(day) ? 'text-primary font-bold' : 'text-foreground'}
                `}>
                  {day}
                </div>

                {/* Events */}
                <div className="space-y-1">
                  {eventsByDate[day.toString()]?.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className={`
                        text-xs p-1 rounded cursor-pointer hover:opacity-80
                        ${event.confidenceScore >= 0.9 
                          ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                          : event.confidenceScore >= 0.8
                          ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                          : 'bg-red-100 text-red-800 hover:bg-red-200'
                        }
                      `}
                      onClick={() => onEventClick?.(event)}
                      title={`${event.eventTitle}\n${event.description || ''}\nConfidence: ${Math.round(event.confidenceScore * 100)}%`}
                    >
                      <div className="flex items-center gap-1">
                        {event.eventTime && (
                          <Clock className="h-2 w-2 flex-shrink-0" />
                        )}
                        <span className="truncate">
                          {event.eventTime && `${event.eventTime} `}
                          {event.eventTitle}
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  {/* Show +X more indicator if there are more than 3 events */}
                  {eventsByDate[day.toString()]?.length > 3 && (
                    <div className="text-xs text-muted-foreground px-1">
                      +{eventsByDate[day.toString()].length - 3} more
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span>High Confidence (90%+)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-yellow-500 rounded"></div>
          <span>Medium Confidence (80-89%)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500 rounded"></div>
          <span>Low Confidence (&lt;80%)</span>
        </div>
      </div>
    </div>
  )
}