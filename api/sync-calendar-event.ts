import { createClient } from '@supabase/supabase-js'
import { VercelRequest, VercelResponse } from '@vercel/node'
import { DateTime } from 'luxon'

interface CalendarSyncRequestBody {
  userId: string
  accessToken: string
  refreshToken?: string
  timeZone?: string
  event: {
    id: string
    title: string
    date: string
    time?: string | null
    description?: string | null
    emailSubject?: string | null
    location?: string | null
    durationMinutes?: number | null
    calendarEventId?: string | null
  }
}

interface GoogleTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID || process.env.VITE_GMAIL_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET || process.env.VITE_GMAIL_CLIENT_SECRET

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration for calendar sync')
}

if (!googleClientId || !googleClientSecret) {
  throw new Error('Missing Google OAuth client configuration for calendar sync')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'

function parseEventTime(time?: string | null): { hours: number; minutes: number } | null {
  if (!time) {
    return null
  }

  const normalized = time.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (normalized.includes('noon')) {
    return { hours: 12, minutes: 0 }
  }

  if (normalized.includes('midnight')) {
    return { hours: 0, minutes: 0 }
  }

  const amPmMatch = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/)
  if (amPmMatch) {
    let hours = parseInt(amPmMatch[1], 10)
    const minutes = amPmMatch[2] ? parseInt(amPmMatch[2], 10) : 0
    const period = amPmMatch[3]

    if (period === 'pm' && hours < 12) {
      hours += 12
    }
    if (period === 'am' && hours === 12) {
      hours = 0
    }

    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return { hours, minutes }
    }
  }

  const hourMinuteMatch = normalized.match(/^(\d{1,2}):(\d{2})$/)
  if (hourMinuteMatch) {
    const hours = parseInt(hourMinuteMatch[1], 10)
    const minutes = parseInt(hourMinuteMatch[2], 10)

    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return { hours, minutes }
    }
  }

  const compactMatch = normalized.match(/^(\d{1,2})(\d{2})$/)
  if (compactMatch) {
    const hours = parseInt(compactMatch[1], 10)
    const minutes = parseInt(compactMatch[2], 10)

    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return { hours, minutes }
    }
  }

  const hourOnlyMatch = normalized.match(/^(\d{1,2})$/)
  if (hourOnlyMatch) {
    const hours = parseInt(hourOnlyMatch[1], 10)
    if (hours >= 0 && hours < 24) {
      return { hours, minutes: 0 }
    }
  }

  return null
}

function buildGoogleEventPayload(
  body: CalendarSyncRequestBody,
  timeZone: string
): {
  payload: Record<string, any>
  startType: 'dateTime' | 'date'
} {
  const descriptionParts: string[] = []

  if (body.event.description) {
    descriptionParts.push(body.event.description.trim())
  }

  if (body.event.emailSubject) {
    descriptionParts.push(`Email Subject: ${body.event.emailSubject}`)
  }

  descriptionParts.push('Synced via School Email Parser')

  const description = descriptionParts.join('\n\n')
  const durationMinutes = body.event.durationMinutes && body.event.durationMinutes > 0
    ? body.event.durationMinutes
    : 60

  const parsedTime = parseEventTime(body.event.time)

  if (!parsedTime) {
    const startDate = DateTime.fromISO(body.event.date, { zone: 'utc' })
    const endDate = startDate.plus({ days: 1 })

    return {
      payload: {
        summary: body.event.title,
        description,
        start: {
          date: startDate.toISODate(),
        },
        end: {
          date: endDate.toISODate(),
        },
      },
      startType: 'date',
    }
  }

  const startDateTime = DateTime.fromISO(body.event.date, { zone: timeZone })
    .set({ hour: parsedTime.hours, minute: parsedTime.minutes, second: 0, millisecond: 0 })
  const endDateTime = startDateTime.plus({ minutes: durationMinutes })

  return {
    payload: {
      summary: body.event.title,
      description,
      start: {
        dateTime: startDateTime.toISO({ suppressMilliseconds: true }),
        timeZone,
      },
      end: {
        dateTime: endDateTime.toISO({ suppressMilliseconds: true }),
        timeZone,
      },
      ...(body.event.location ? { location: body.event.location } : {}),
    },
    startType: 'dateTime',
  }
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: googleClientId!,
      client_secret: googleClientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token refresh failed: ${response.statusText}. ${errorText}`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    refreshToken: refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

async function updateUserTokens(userId: string, tokens: GoogleTokens) {
  const { error } = await supabase
    .from('users')
    .update({
      gmail_token: tokens.accessToken,
      gmail_refresh_token: tokens.refreshToken,
      last_sync_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    console.error('Failed to update user tokens after refresh:', error)
  }
}

async function updateEventSyncStatus(
  userId: string,
  eventId: string,
  data: {
    google_calendar_event_id?: string | null
    google_calendar_synced_at?: string | null
    google_calendar_sync_status?: 'pending' | 'synced' | 'error' | null
    google_calendar_sync_error?: string | null
  }
) {
  const { error } = await supabase
    .from('extracted_dates')
    .update(data)
    .eq('id', eventId)
    .eq('user_id', userId)

  if (error) {
    console.error('Failed to update event sync status:', error)
  }
}

async function pushEventToCalendar(
  accessToken: string,
  eventId: string | null | undefined,
  payload: Record<string, any>
) {
  const baseUrl = `${GOOGLE_CALENDAR_API_BASE}/calendars/primary/events`
  const requestInit: RequestInit = {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }

  if (eventId) {
    const updateResponse = await fetch(`${baseUrl}/${eventId}`, {
      ...requestInit,
      method: 'PATCH',
    })

    if (updateResponse.status === 404) {
      const createResponse = await fetch(baseUrl, {
        ...requestInit,
        method: 'POST',
      })
      return createResponse
    }

    return updateResponse
  }

  const response = await fetch(baseUrl, {
    ...requestInit,
    method: 'POST',
  })

  return response
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const body = req.body as CalendarSyncRequestBody

    if (!body || !body.userId || !body.accessToken || !body.event || !body.event.date || !body.event.title) {
      return res.status(400).json({ error: 'Missing required fields for calendar sync' })
    }

    const timeZone = body.timeZone || 'UTC'

    const eventDateIso = DateTime.fromISO(body.event.date, { zone: 'utc' })
    if (!eventDateIso.isValid) {
      return res.status(400).json({ error: 'Invalid event date provided' })
    }

    await updateEventSyncStatus(body.userId, body.event.id, {
      google_calendar_sync_status: 'pending',
      google_calendar_sync_error: null,
    })

    const { payload, startType } = buildGoogleEventPayload(body, timeZone)

    const attemptPush = async (token: string) => {
      const response = await pushEventToCalendar(token, body.event.calendarEventId, payload)
      const responseText = await response.text()

      let parsedJson: any
      try {
        parsedJson = responseText ? JSON.parse(responseText) : {}
      } catch (jsonError) {
        parsedJson = { raw: responseText }
      }

      if (!response.ok) {
        const firstError = parsedJson?.error?.message || response.statusText
        throw new Error(`Google Calendar API error: ${firstError}`)
      }

      return parsedJson
    }

    let accessTokenToUse = body.accessToken
    let calendarResponse

    try {
      calendarResponse = await attemptPush(accessTokenToUse)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown calendar error'

      if (
        body.refreshToken &&
        (errorMessage.includes('Invalid Credentials') || errorMessage.includes('invalid_grant') || errorMessage.includes('401'))
      ) {
        try {
          const tokens = await refreshGoogleAccessToken(body.refreshToken)
          accessTokenToUse = tokens.accessToken
          await updateUserTokens(body.userId, tokens)
          calendarResponse = await attemptPush(accessTokenToUse)
        } catch (refreshError) {
          const refreshMessage = refreshError instanceof Error ? refreshError.message : 'Unknown token refresh error'
          await updateEventSyncStatus(body.userId, body.event.id, {
            google_calendar_sync_status: 'error',
            google_calendar_sync_error: refreshMessage,
          })
          return res.status(500).json({ error: refreshMessage })
        }
      } else {
        await updateEventSyncStatus(body.userId, body.event.id, {
          google_calendar_sync_status: 'error',
          google_calendar_sync_error: errorMessage,
        })
        return res.status(500).json({ error: errorMessage })
      }
    }

    const calendarEventId: string | undefined = calendarResponse?.id

    await updateEventSyncStatus(body.userId, body.event.id, {
      google_calendar_event_id: calendarEventId || body.event.calendarEventId || null,
      google_calendar_synced_at: new Date().toISOString(),
      google_calendar_sync_status: 'synced',
      google_calendar_sync_error: null,
    })

    return res.status(200).json({
      calendarEventId,
      googleResponse: calendarResponse,
      startType,
    })
  } catch (error) {
    console.error('Calendar sync handler error:', error)
    const message = error instanceof Error ? error.message : 'Unknown server error'
    return res.status(500).json({ error: message })
  }
}
