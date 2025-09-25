export interface User {
  id: string
  email: string
  gmailToken?: string
  gmailRefreshToken?: string
  createdAt: Date
  lastSyncAt?: Date
}

export interface Tag {
  id: string
  userId: string
  name: string
  type: 'kid' | 'general'
  color: string
  emoji?: string
  createdAt: Date
  updatedAt: Date
}

export interface EmailSource {
  id: string
  userId: string
  email: string
  domain?: string
  isActive: boolean
  tagId?: string
  tag?: Tag
  createdAt: Date
}

export interface ProcessedEmail {
  id: string
  userId: string
  gmailMessageId: string
  senderEmail: string
  subject: string
  sentDate: Date
  processedAt: Date
  contentHash: string
  hasAttachments: boolean
}

export interface ExtractedDate {
  id: string
  emailId: string
  userId: string
  eventTitle: string
  eventDate: Date
  eventTime?: string
  description?: string
  confidenceScore: number
  extractedAt: Date
  isVerified: boolean
  // Sender information from the email
  senderEmail?: string
  senderName?: string
  // Additional email details for troubleshooting
  emailSubject?: string
  emailSentDate?: Date
  emailBodyPreview?: string
  // LLM reasoning for extraction
  reasoning?: string
  // Tag information from email source
  tag?: Tag
  // Google Calendar sync metadata
  googleCalendarEventId?: string
  googleCalendarSyncedAt?: Date
  googleCalendarSyncStatus?: 'pending' | 'synced' | 'error'
  googleCalendarSyncError?: string
}

export interface ProcessingHistory {
  id: string
  userId: string
  emailId: string
  llmProvider: string
  processingTime: number
  tokenUsage: number
  successStatus: boolean
  errorMessage?: string
}

export interface LLMResponse {
  title: string
  date: string
  time?: string
  description: string
  confidence: number
}

export interface GmailMessage {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  payload: {
    partId: string
    mimeType: string
    filename: string
    headers: Array<{
      name: string
      value: string
    }>
    body: {
      size: number
      data?: string
    }
    parts?: Array<{
      partId: string
      mimeType: string
      filename: string
      body: {
        size: number
        data?: string
      }
    }>
  }
  sizeEstimate: number
  historyId: string
  internalDate: string
}

export interface ConfigSettings {
  emailSources: EmailSource[]
  llmProvider: 'openai' | 'claude'
  processingInterval: number
  confidenceThreshold: number
}

export interface EmailSummary {
  id: string
  emailId: string
  userId: string
  subject: string
  senderEmail: string
  senderName?: string
  sentDate: Date
  summary: {
    keyPoints: string[]
    importantDates: Array<{
      date: string
      description: string
      originalText: string
    }>
    actionItems: string[]
    categories: string[]
  }
  confidence: number
  generatedAt: Date
  emailBodyPreview?: string
}

export interface SummaryResponse {
  keyPoints: string[]
  importantDates: Array<{
    date: string
    description: string
    originalText: string
  }>
  actionItems: string[]
  categories: string[]
  confidence: number
} 
