export interface User {
  id: string
  email: string
  gmailToken?: string
  gmailRefreshToken?: string
  createdAt: Date
  lastSyncAt?: Date
}

export interface EmailSource {
  id: string
  userId: string
  email: string
  domain?: string
  isActive: boolean
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