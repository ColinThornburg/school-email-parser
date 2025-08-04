import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { VercelRequest, VercelResponse } from '@vercel/node';

// LLM Response interface
interface LLMResponse {
  title: string;
  date: string;
  time?: string;
  description: string;
  confidence: number;
  reasoning?: string;
}

// Email Content interface
interface EmailContent {
  subject: string;
  body: string;
  senderEmail: string;
  sentDate: string;
}

// Gmail Token interface
interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// Email Classification interface
interface EmailClassification {
  hasDateContent: boolean;
  confidence: number;
  reasoning: string;
}

// Batch Processing interface
interface BatchRequest {
  id: string;
  emailContent: EmailContent;
  method: 'classify' | 'extract' | 'fallback';
}

// Cost Tracking interface
interface CostTracking {
  provider: 'openai' | 'gemini';
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

// Processing Mode type
type ProcessingMode = 'single' | 'batch';

// Helper function to create event hash for deduplication
function createEventHash(userId: string, title: string, date: string, time?: string): string {
  const normalizedTime = normalizeTimeValue(time);
  const eventKey = `${userId}:${title.toLowerCase().trim()}:${date}:${normalizedTime || 'no-time'}`;
  return crypto.createHash('md5').update(eventKey).digest('hex');
}

// Helper function to clean up duplicate events
async function cleanupDuplicateEvents(supabase: any, userId: string): Promise<number> {
  console.log('Starting duplicate event cleanup...');
  
  // Find duplicate events based on user_id, event_title, event_date, and event_time
  const { data: duplicates, error } = await supabase.rpc('find_duplicate_events', {
    p_user_id: userId
  });

  if (error) {
    console.error('Error finding duplicates:', error);
    // If the RPC doesn't exist, fall back to manual cleanup
    return await manualCleanupDuplicates(supabase, userId);
  }

  let deletedCount = 0;
  for (const duplicate of duplicates || []) {
    // Keep the oldest event (first extracted) and delete the rest
    const { error: deleteError } = await supabase
      .from('extracted_dates')
      .delete()
      .eq('id', duplicate.id);
    
    if (!deleteError) {
      deletedCount++;
    }
  }

  console.log(`Cleaned up ${deletedCount} duplicate events`);
  return deletedCount;
}

// Manual fallback cleanup method
async function manualCleanupDuplicates(supabase: any, userId: string): Promise<number> {
  console.log('Performing manual duplicate cleanup...');
  
  // Get all events for the user
  const { data: events, error } = await supabase
    .from('extracted_dates')
    .select('*')
    .eq('user_id', userId)
    .order('extracted_at', { ascending: true });

  if (error) {
    console.error('Error fetching events for cleanup:', error);
    return 0;
  }

  const eventMap = new Map<string, any>();
  const duplicatesToDelete: string[] = [];

  // Group events by their unique identifier
  for (const event of events) {
    const normalizedTime = normalizeTimeValue(event.event_time);
    const eventKey = `${event.event_title.toLowerCase().trim()}:${event.event_date}:${normalizedTime || 'no-time'}`;
    
    if (eventMap.has(eventKey)) {
      // This is a duplicate, mark for deletion
      duplicatesToDelete.push(event.id);
    } else {
      // This is the first occurrence, keep it
      eventMap.set(eventKey, event);
    }
  }

  // Delete duplicates
  let deletedCount = 0;
  for (const eventId of duplicatesToDelete) {
    const { error: deleteError } = await supabase
      .from('extracted_dates')
      .delete()
      .eq('id', eventId);
    
    if (!deleteError) {
      deletedCount++;
    }
  }

  console.log(`Manually cleaned up ${deletedCount} duplicate events`);
  return deletedCount;
}

// Helper function to normalize time value
function normalizeTimeValue(time?: string | null): string | null {
  // Handle null, undefined, or falsy values
  if (!time) {
    return null;
  }
  
  // Convert to string if it's not already (in case it's passed as some other type)
  const timeStr = String(time).trim();
  
  // Handle various representations of null/empty values
  if (
    timeStr === '' ||
    timeStr.toLowerCase() === 'null' ||
    timeStr.toLowerCase() === 'undefined' ||
    timeStr === '""' ||           // Empty string with quotes
    timeStr === "''" ||           // Empty string with single quotes
    timeStr === 'none' ||         // Common LLM null representation
    timeStr === 'n/a' ||          // Not applicable
    timeStr === '-' ||            // Dash as placeholder
    timeStr === '0' ||            // Zero as placeholder
    timeStr === '00:00' ||        // Midnight as placeholder
    timeStr === '00:00:00'        // Full midnight as placeholder
  ) {
    return null;
  }
  
  // Remove any surrounding quotes
  const cleaned = timeStr.replace(/^["']|["']$/g, '');
  
  // Final check after cleaning
  if (cleaned === '' || cleaned.toLowerCase() === 'null' || cleaned.toLowerCase() === 'undefined') {
    return null;
  }
  
  return cleaned;
}

// Additional safety check for database operations
function validateTimeForDatabase(time: string | null): string | null {
  if (time === null || time === undefined) {
    return null;
  }
  
  // Extra safety: if somehow a string "null" still gets through, catch it here
  if (typeof time === 'string' && (time === 'null' || time === 'undefined' || time.trim() === '')) {
    console.warn(`Database validator caught invalid time value: "${time}"`);
    return null;
  }
  
  return time;
}

// Helper function to check if event already exists
async function eventExists(
  supabase: any, 
  userId: string, 
  title: string, 
  date: string, 
  time?: string | null,
  emailSubject?: string
): Promise<boolean> {
  const normalizedTime = normalizeTimeValue(time);
  
  // Debug logging to identify the problematic time value
  if (time !== normalizedTime) {
    console.log(`Time normalization: "${time}" -> ${normalizedTime === null ? 'NULL' : `"${normalizedTime}"`}`);
  }
  
  const safeTime = validateTimeForDatabase(normalizedTime);
  
  // Build query with proper null handling for Supabase
  let query = supabase
    .from('extracted_dates')
    .select('id')
    .eq('user_id', userId)
    .eq('event_title', title.trim())
    .eq('event_date', date);
    
  // Handle null time values explicitly for Supabase
  if (safeTime === null || safeTime === undefined) {
    query = query.is('event_time', null);
  } else {
    query = query.eq('event_time', safeTime);
  }
  
  const { data, error } = await query.limit(1);

  if (error) {
    console.error('Error checking event existence:', error);
    console.error('Query parameters:', {
      emailSubject: emailSubject || 'Unknown',
      userId,
      title: title.trim(),
      date,
      originalTime: time,
      normalizedTime,
      safeTime,
      safeTimeType: typeof safeTime
    });
    return false;
  }

  return data && data.length > 0;
}

// Enhanced OpenAI Service class with GPT-4o mini and batch processing
class OpenAIService {
  private apiKey: string;
  private model: string;
  private systemPrompt: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
    this.systemPrompt = 'Extract important dates from school emails. Focus on academic deadlines, events, sports, meetings. Return only valid JSON.';
  }

  async extractDates(emailContent: EmailContent): Promise<LLMResponse[]> {
    const prompt = this.createOptimizedPrompt(emailContent);

    try {
      return await retryApiCall(async () => {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: 'system',
                content: this.systemPrompt
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.1,
            max_tokens: 800,
            response_format: { type: "json_object" }
          })
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unable to read error response');
          throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (!content) {
          throw new Error('No response content from OpenAI');
        }

        console.log('OpenAI response received, parsing...');
        console.log('OpenAI raw response (first 500 chars):', content.substring(0, 500));
        
        let parsedData;
        try {
          parsedData = JSON.parse(content);
          // Handle both direct array format and object with events property
          const events = Array.isArray(parsedData) ? parsedData : (parsedData.events || []);
          console.log('OpenAI parsed events with reasoning:', events.map(e => ({ title: e.title, reasoning: e.reasoning || 'MISSING' })));
          return this.validateAndNormalizeResponse(events, emailContent.sentDate);
        } catch (parseError) {
          console.error('OpenAI JSON parsing failed. Raw content:', content.substring(0, 1000));
          console.error('Parse error:', parseError);
          
          // Try basic cleanup similar to Gemini approach
          try {
            const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const retryParsed = JSON.parse(cleanedContent);
            const events = Array.isArray(retryParsed) ? retryParsed : (retryParsed.events || []);
            console.log('OpenAI JSON parsing succeeded after cleanup, events with reasoning:', events.map(e => ({ title: e.title, reasoning: e.reasoning || 'MISSING' })));
            return this.validateAndNormalizeResponse(events, emailContent.sentDate);
          } catch (retryError) {
            throw new Error(`Invalid JSON response from OpenAI: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
          }
        }
      }, 3, 1000, 'OpenAI');

    } catch (error) {
      console.error('OpenAI API error after retries:', error);
      throw new Error(`Failed to extract dates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Batch processing for multiple emails using OpenAI Batch API
  async batchExtractDates(emailContents: EmailContent[]): Promise<{ [key: string]: LLMResponse[] }> {
    const results: { [key: string]: LLMResponse[] } = {};

    // OpenAI Batch API implementation
    try {
      const batchRequests = emailContents.map((emailContent, index) => ({
        custom_id: `extract-${index}`,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: this.systemPrompt
            },
            {
              role: 'user',
              content: this.createOptimizedPrompt(emailContent)
            }
          ],
          temperature: 0.1,
          max_tokens: 800,
          response_format: { type: "json_object" }
        }
      }));

      // Create batch file
      const batchFile = batchRequests.map(req => JSON.stringify(req)).join('\n');
      
      // Upload batch file
      const formData = new FormData();
      formData.append('file', new Blob([batchFile], { type: 'application/jsonl' }), 'batch.jsonl');
      formData.append('purpose', 'batch');
      
      const fileResponse = await fetch('https://api.openai.com/v1/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      if (!fileResponse.ok) {
        throw new Error('Failed to upload batch file');
      }

      const fileData = await fileResponse.json();
      
      // Create batch job
      const batchResponse = await fetch('https://api.openai.com/v1/batches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          input_file_id: fileData.id,
          endpoint: '/v1/chat/completions',
          completion_window: '24h'
        })
      });

      if (!batchResponse.ok) {
        throw new Error('Failed to create batch job');
      }

      const batchData = await batchResponse.json();
      
      // For now, fall back to parallel processing since batch is async
      return await this.parallelExtractDates(emailContents);

    } catch (error) {
      console.error('Batch processing failed, falling back to parallel:', error);
      return await this.parallelExtractDates(emailContents);
    }
  }

  // Parallel processing as fallback for batch API
  private async parallelExtractDates(emailContents: EmailContent[]): Promise<{ [key: string]: LLMResponse[] }> {
    const results: { [key: string]: LLMResponse[] } = {};
    const batchSize = 5; // Process in smaller batches to avoid rate limits

    for (let i = 0; i < emailContents.length; i += batchSize) {
      const batch = emailContents.slice(i, i + batchSize);
      
      const promises = batch.map(async (emailContent, index) => {
        const key = `email-${i + index}`;
        try {
          const events = await this.extractDates(emailContent);
          return { key, events };
        } catch (error) {
          console.error(`Error processing email ${key}:`, error);
          return { key, events: [] };
        }
      });

      const batchResults = await Promise.all(promises);
      
      for (const result of batchResults) {
        results[result.key] = result.events;
      }

      // Small delay between batches
      if (i + batchSize < emailContents.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  private createOptimizedPrompt(emailContent: EmailContent): string {
    return `Extract important dates from this school email. Be specific and detailed.

Email: ${emailContent.subject}
From: ${emailContent.senderEmail}
Date: ${emailContent.sentDate}
Body: ${emailContent.body}

Focus on school events: assignments, tests, meetings, sports, trips, performances.
Include specific details in titles and descriptions.
Convert relative dates to absolute dates based on sent date: ${emailContent.sentDate}
Only include future dates.

Return JSON object with events array:
{
  "events": [
    {
      "title": "specific event title with details",
      "date": "YYYY-MM-DD",
      "time": "HH:MM" (optional),
      "description": "detailed context and instructions",
      "confidence": 0.95,
      "reasoning": "explain exactly which text/phrase led to this date extraction and your interpretation"
    }
  ]
}

Return {"events": []} if no dates found.`;
  }

  private validateAndNormalizeResponse(events: any[], sentDate: string): LLMResponse[] {
    if (!Array.isArray(events)) {
      return [];
    }

    const sentDateTime = new Date(sentDate);
    const validEvents: LLMResponse[] = [];

    for (const event of events) {
      // Validate required fields
      if (!event.title || !event.date || typeof event.confidence !== 'number') {
        continue;
      }

      // Validate date format
      const eventDate = new Date(event.date);
      if (isNaN(eventDate.getTime())) {
        continue;
      }

      // Only include future dates
      if (eventDate <= sentDateTime) {
        continue;
      }

      // Validate confidence score
      const confidence = Math.max(0, Math.min(1, event.confidence));

      // Normalize time value
      const normalizedTime = normalizeTimeValue(event.time);

      validEvents.push({
        title: String(event.title).trim(),
        date: event.date,
        time: normalizedTime || undefined,
        description: event.description ? String(event.description).trim() : '',
        confidence: confidence
      });
    }

    return validEvents;
  }
}

// LLM Orchestrator class for managing tiered processing workflow
class LLMOrchestrator {
  private geminiService: GeminiService;
  private openaiService: OpenAIService;
  private confidenceThreshold: number;
  private enableBatchProcessing: boolean;

  constructor(
    geminiApiKey: string,
    openaiApiKey: string,
    options: {
      confidenceThreshold?: number;
      enableBatchProcessing?: boolean;
      geminiPrefilterModel?: string;
      geminiFallbackModel?: string;
      openaiMainModel?: string;
    } = {}
  ) {
    this.geminiService = new GeminiService(
      geminiApiKey,
      options.geminiPrefilterModel || 'gemini-1.5-flash',
      options.geminiFallbackModel || 'gemini-1.5-pro'
    );
    this.openaiService = new OpenAIService(
      openaiApiKey,
      options.openaiMainModel || 'gpt-4o-mini'
    );
    this.confidenceThreshold = options.confidenceThreshold || 0.7;
    this.enableBatchProcessing = options.enableBatchProcessing || false;
  }

  // Main processing method with tiered approach
  async processEmails(emailContents: EmailContent[], processingMode: ProcessingMode = 'single'): Promise<{
    results: { [key: string]: LLMResponse[] };
    costTracking: CostTracking[];
    processingStats: {
      totalEmails: number;
      prefilterPassed: number;
      mainExtractions: number;
      fallbackUsed: number;
      totalCost: number;
    };
  }> {
    const results: { [key: string]: LLMResponse[] } = {};
    const costTracking: CostTracking[] = [];
    const processingStats = {
      totalEmails: emailContents.length,
      prefilterPassed: 0,
      mainExtractions: 0,
      fallbackUsed: 0,
      totalCost: 0
    };

    console.log(`Starting tiered processing for ${emailContents.length} emails in ${processingMode} mode`);

    if (processingMode === 'batch' && this.enableBatchProcessing) {
      return await this.batchProcess(emailContents, results, costTracking, processingStats);
    } else {
      return await this.singleProcess(emailContents, results, costTracking, processingStats);
    }
  }

  // Single processing mode
  private async singleProcess(
    emailContents: EmailContent[],
    results: { [key: string]: LLMResponse[] },
    costTracking: CostTracking[],
    processingStats: any
  ) {
    for (let i = 0; i < emailContents.length; i++) {
      const emailContent = emailContents[i];
      const emailKey = `email-${i}`;

      console.log(`Processing email ${i + 1}/${emailContents.length}: "${emailContent.subject}"`);

      try {
        // Step 1: Pre-filter with Gemini 2.0 Flash
        console.log('Step 1: Pre-filtering with Gemini 2.0 Flash...');
        const classification = await this.geminiService.classifyEmail(emailContent);
        
        // Track cost for classification
        const classificationTokens = estimateTokenUsage(emailContent.subject + emailContent.body.substring(0, 500));
        const classificationCost = calculateGeminiCost('gemini-1.5-flash', classificationTokens, 50);
        costTracking.push({
          provider: 'gemini',
          model: 'gemini-1.5-flash',
          inputTokens: classificationTokens,
          outputTokens: 50,
          cost: classificationCost
        });
        processingStats.totalCost += classificationCost;

        console.log(`Classification result: ${classification.hasDateContent} (confidence: ${classification.confidence})`);

        if (!classification.hasDateContent) {
          console.log('Email does not contain date content, skipping extraction');
          results[emailKey] = [];
          continue;
        }

        processingStats.prefilterPassed++;

        // Step 2: Main extraction with GPT-4o mini
        console.log('Step 2: Main extraction with GPT-4o mini...');
        const mainExtractionResults = await this.openaiService.extractDates(emailContent);
        
        // Track cost for main extraction
        const extractionTokens = estimateTokenUsage(emailContent.subject + emailContent.body);
        const extractionCost = calculateOpenAICost('gpt-4o-mini', extractionTokens, 400);
        costTracking.push({
          provider: 'openai',
          model: 'gpt-4o-mini',
          inputTokens: extractionTokens,
          outputTokens: 400,
          cost: extractionCost
        });
        processingStats.totalCost += extractionCost;
        processingStats.mainExtractions++;

        console.log(`Main extraction found ${mainExtractionResults.length} events`);

        // Step 3: Check confidence and use fallback if needed
        const lowConfidenceEvents = mainExtractionResults.filter(event => event.confidence < this.confidenceThreshold);
        
        if (lowConfidenceEvents.length > 0) {
          console.log(`Step 3: Using Gemini 2.5 Flash fallback for ${lowConfidenceEvents.length} low-confidence events...`);
          
          const fallbackResults = await this.geminiService.extractDates(emailContent);
          
          // Track cost for fallback
          const fallbackTokens = estimateTokenUsage(emailContent.subject + emailContent.body);
          const fallbackCost = calculateGeminiCost('gemini-1.5-pro', fallbackTokens, 600);
          costTracking.push({
            provider: 'gemini',
            model: 'gemini-1.5-pro',
            inputTokens: fallbackTokens,
            outputTokens: 600,
            cost: fallbackCost
          });
          processingStats.totalCost += fallbackCost;
          processingStats.fallbackUsed++;

          // Merge results, preferring higher confidence events
          const mergedResults = this.mergeResults(mainExtractionResults, fallbackResults);
          results[emailKey] = mergedResults;
          
          console.log(`Fallback processing completed, final result: ${mergedResults.length} events`);
        } else {
          results[emailKey] = mainExtractionResults;
        }

      } catch (error) {
        console.error(`Error processing email ${emailKey}:`, error);
        results[emailKey] = [];
      }

      // Small delay to avoid rate limiting
      if (i < emailContents.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`Single processing completed. Total cost: $${processingStats.totalCost.toFixed(4)}`);

    return {
      results,
      costTracking,
      processingStats
    };
  }

  // Batch processing mode
  private async batchProcess(
    emailContents: EmailContent[],
    results: { [key: string]: LLMResponse[] },
    costTracking: CostTracking[],
    processingStats: any
  ) {
    console.log('Starting batch processing...');

    // Step 1: Batch classify all emails
    const batchRequests = emailContents.map((emailContent, index) => ({
      id: `email-${index}`,
      emailContent,
      method: 'classify' as const
    }));

    try {
                    // Temporarily disable batch processing due to type issues
       // TODO: Fix BatchRequest type issues and implement proper batch processing
       console.log('Batch processing temporarily disabled, falling back to single processing');
       return await this.singleProcess(emailContents, results, costTracking, processingStats);

    } catch (error) {
      console.error('Batch processing failed, falling back to single processing:', error);
      return await this.singleProcess(emailContents, results, costTracking, processingStats);
    }

    return {
      results,
      costTracking,
      processingStats
    };
  }

  // Merge results from main extraction and fallback, preferring higher confidence
  private mergeResults(mainResults: LLMResponse[], fallbackResults: LLMResponse[]): LLMResponse[] {
    const mergedEvents = [...mainResults];
    const existingEvents = new Set(mainResults.map(e => `${e.title}:${e.date}:${e.time || ''}`));

    for (const fallbackEvent of fallbackResults) {
      const eventKey = `${fallbackEvent.title}:${fallbackEvent.date}:${fallbackEvent.time || ''}`;
      
      if (!existingEvents.has(eventKey)) {
        mergedEvents.push(fallbackEvent);
      } else {
        // Replace if fallback has higher confidence
        const existingIndex = mergedEvents.findIndex(e => 
          `${e.title}:${e.date}:${e.time || ''}` === eventKey);
        
        if (existingIndex >= 0 && fallbackEvent.confidence > mergedEvents[existingIndex].confidence) {
          mergedEvents[existingIndex] = fallbackEvent;
        }
      }
    }

    return mergedEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
}

// Gmail Service class
class GmailService {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  // Refresh access token
  async refreshAccessToken(refreshToken: string): Promise<GmailTokens> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: refreshToken, // Refresh token usually doesn't change
      expiresAt: Date.now() + (data.expires_in * 1000)
    };
  }

  // List messages from Gmail
  async listMessages(
    accessToken: string,
    options: {
      maxResults?: number;
      pageToken?: string;
      q?: string; // Gmail search query
    } = {}
  ): Promise<{
    messages: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
  }> {
    const params = new URLSearchParams({
      maxResults: (options.maxResults || 10).toString(),
      ...(options.pageToken && { pageToken: options.pageToken }),
      ...(options.q && { q: options.q }),
    });

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gmail API listMessages error: ${response.status} ${response.statusText}`, errorText);
      
      if (response.status === 401) {
        throw new Error('Gmail access token expired or invalid');
      } else if (response.status === 403) {
        throw new Error('Gmail API access forbidden - check OAuth scopes and permissions');
      } else if (response.status === 429) {
        throw new Error('Gmail API rate limit exceeded');
      } else {
        throw new Error(`Failed to list messages: ${response.status} ${response.statusText}`);
      }
    }

    const data = await response.json();
    return {
      messages: data.messages || [],
      nextPageToken: data.nextPageToken
    };
  }

  // Get a specific message
  async getMessage(accessToken: string, messageId: string): Promise<any> {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gmail API getMessage error: ${response.status} ${response.statusText}`, errorText);
      
      if (response.status === 401) {
        throw new Error('Gmail access token expired or invalid');
      } else if (response.status === 403) {
        throw new Error('Gmail API access forbidden - check OAuth scopes and permissions');
      } else if (response.status === 429) {
        throw new Error('Gmail API rate limit exceeded');
      } else {
        throw new Error(`Failed to get message: ${response.status} ${response.statusText}`);
      }
    }

    return await response.json();
  }

  // Extract text content from Gmail message
  extractTextFromMessage(message: any): {
    subject: string;
    body: string;
    from: string;
    date: string;
  } {
    const headers = message.payload.headers;
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    let body = '';
    
    // Extract body text recursively
    const extractBody = (part: any): string => {
      if (part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      
      if (part.parts) {
        return part.parts.map(extractBody).join('\n');
      }
      
      return '';
    };

    if (message.payload.body?.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    } else if (message.payload.parts) {
      body = message.payload.parts.map(extractBody).join('\n');
    }

    // Clean HTML tags from body
    body = body.replace(/<[^>]*>/g, '').trim();

    return { subject, body, from, date };
  }
}

// Helper function to estimate token usage
function estimateTokenUsage(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

// Helper function for API calls with retry logic
async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  apiName: string = 'API'
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt === 1) {
        console.log(`${apiName} call starting...`);
      } else {
        console.log(`${apiName} retry attempt ${attempt}/${maxRetries}`);
      }
      return await apiCall();
    } catch (error) {
      lastError = error as Error;
      
      // Log error details only for non-transient issues or final attempt
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
      const isTransientError = errorMessage.includes('bad gateway') || 
                              errorMessage.includes('timeout') || 
                              errorMessage.includes('service unavailable') ||
                              errorMessage.includes('too many requests');
      
      if (!isTransientError || attempt === maxRetries) {
        console.error(`${apiName} attempt ${attempt} failed:`, error);
      } else {
        console.warn(`${apiName} attempt ${attempt} failed with transient error (${errorMessage}), will retry`);
      }
      
      // Don't retry on certain errors (authentication, invalid request format)
      if (error instanceof Error) {
        if (errorMessage.includes('unauthorized') || 
            errorMessage.includes('forbidden') || 
            errorMessage.includes('invalid') ||
            errorMessage.includes('not found')) {
          console.log(`${apiName} non-retryable error, not retrying`);
          throw error;
        }
      }
      
      // Don't delay after the last attempt
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`${apiName} retrying in ${delay}ms due to transient error...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`${apiName} failed after ${maxRetries} attempts`);
  throw lastError!;
}

// Cost calculation functions
function calculateOpenAICost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = {
    'gpt-4o-mini': { input: 0.60 / 1000000, output: 2.40 / 1000000 },
    'gpt-4-turbo-preview': { input: 10 / 1000000, output: 30 / 1000000 }
  };
  const modelCost = costs[model as keyof typeof costs] || costs['gpt-4o-mini'];
  return (inputTokens * modelCost.input + outputTokens * modelCost.output);
}

function calculateGeminiCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = {
    'gemini-1.5-flash': { input: 0.075 / 1000000, output: 0.30 / 1000000 },
    'gemini-1.5-pro': { input: 1.25 / 1000000, output: 5.00 / 1000000 }
  };
  const modelCost = costs[model as keyof typeof costs] || costs['gemini-1.5-flash'];
  return (inputTokens * modelCost.input + outputTokens * modelCost.output);
}

// GeminiService class for pre-filtering and fallback processing
class GeminiService {
  private apiKey: string;
  private prefilterModel: string;
  private fallbackModel: string;

  constructor(apiKey: string, prefilterModel: string = 'gemini-1.5-flash', fallbackModel: string = 'gemini-1.5-pro') {
    this.apiKey = apiKey;
    this.prefilterModel = prefilterModel;
    this.fallbackModel = fallbackModel;
  }

  // Pre-filter emails to determine if they likely contain date information
  async classifyEmail(emailContent: EmailContent): Promise<EmailClassification> {
    const prompt = this.createClassificationPrompt(emailContent);
    let content = '';

    try {
      return await retryApiCall(async () => {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 100,
              topP: 0.8,
              topK: 10
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unable to read error response');
          throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        content = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!content) {
          throw new Error('No response content from Gemini');
        }

        // Parse classification response with robust JSON cleaning
        console.log('Raw Gemini response (first 500 chars):', content.substring(0, 500));
        
        let classification;
        try {
          classification = this.parseGeminiJSON(content);
        } catch (parseError) {
          console.error('All JSON parsing attempts failed:', parseError);
          // If JSON parsing completely fails, try to extract boolean from text content
          const hasDateKeywords = /true|yes|contains|found|date|time|event|deadline/i.test(content);
          return {
            hasDateContent: hasDateKeywords,
            confidence: 0.3,
            reasoning: 'JSON parsing failed completely, used text analysis fallback'
          };
        }
        
        return {
          hasDateContent: classification.hasDateContent || false,
          confidence: Math.max(0, Math.min(1, classification.confidence || 0)),
          reasoning: classification.reasoning || ''
        };
      }, 3, 1000, 'Gemini');

    } catch (error) {
      console.error('Gemini classification error after retries:', error);
      
      // Default to processing if classification fails completely
      return {
        hasDateContent: true,
        confidence: 0.5,
        reasoning: 'Classification failed completely, defaulting to processing'
      };
    }
  }

  // Fallback extraction for complex cases
  async extractDates(emailContent: EmailContent): Promise<LLMResponse[]> {
    const prompt = this.createExtractionPrompt(emailContent);

    try {
      return await retryApiCall(async () => {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1500,
              topP: 0.9,
              topK: 40
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unable to read error response');
          throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!content) {
          throw new Error('No response content from Gemini');
        }

        // Parse extraction response using robust JSON parser
        console.log('Raw Gemini extraction response (first 500 chars):', content.substring(0, 500));
        const parsedResponse = this.parseGeminiJSON(content);
        
        // Handle different response formats - could be array directly or object with events property
        let events = parsedResponse;
        if (parsedResponse && typeof parsedResponse === 'object' && !Array.isArray(parsedResponse)) {
          if (parsedResponse.events && Array.isArray(parsedResponse.events)) {
            events = parsedResponse.events;
          } else if (Array.isArray(parsedResponse)) {
            events = parsedResponse;
          } else {
            // If it's an object but not an array and no events property, treat as empty
            events = [];
          }
        }
        
        console.log('Gemini parsed events with reasoning:', events.map(e => ({ title: e.title, reasoning: e.reasoning || 'MISSING' })));
        return this.validateAndNormalizeResponse(events, emailContent.sentDate);
      }, 3, 1000, 'Gemini Extraction');

    } catch (error) {
      console.error('Gemini extraction error after retries:', error);
      return [];
    }
  }

  // Batch processing for multiple emails (temporarily disabled due to type issues)
  async batchClassifyEmails(batchRequests: any[]): Promise<{ [key: string]: EmailClassification }> {
    // TODO: Fix type issues and implement proper batch processing
    const results: { [key: string]: EmailClassification } = {};
    
    console.log('Batch processing temporarily disabled, processing individually');
    
    for (const request of batchRequests) {
      try {
        const classification = await this.classifyEmail(request.emailContent);
        results[request.id] = classification;
      } catch (error) {
        console.error(`Error classifying email ${request.id}:`, error);
        results[request.id] = {
          hasDateContent: true,
          confidence: 0.5,
          reasoning: 'Classification failed, defaulting to processing'
        };
      }
    }

    return results;
  }

  // Robust JSON parser for Gemini responses
  private parseGeminiJSON(content: string): any {
    console.log('Attempting to parse Gemini JSON...');
    
    // Step 1: Remove markdown code blocks
    let cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Step 2: Basic cleanup
    cleanedContent = cleanedContent.replace(/[\r\n\t]/g, ' '); // Remove newlines/tabs
    cleanedContent = cleanedContent.replace(/\s+/g, ' '); // Normalize whitespace
    cleanedContent = cleanedContent.replace(/,\s*}/, '}'); // Remove trailing commas in objects
    cleanedContent = cleanedContent.replace(/,\s*]/, ']'); // Remove trailing commas in arrays
    
    // Step 3: Try to extract JSON object boundaries
    const objectMatch = cleanedContent.match(/\{.*\}/);
    if (objectMatch) {
      cleanedContent = objectMatch[0];
    }
    
    console.log('Cleaned content:', cleanedContent.substring(0, 200) + '...');
    
    // Step 4: Multiple parsing attempts with different repair strategies
    const repairStrategies = [
      // Strategy 1: Try as-is
      cleanedContent,
      
      // Strategy 2: Fix unterminated strings by closing them
      cleanedContent.replace(/"[^"]*$/, '""'),
      
      // Strategy 3: Fix unterminated strings and ensure proper object closure
      cleanedContent.replace(/"[^"]*$/, '""').replace(/[^}]*$/, '}'),
      
      // Strategy 4: Extract and reconstruct basic structure
      cleanedContent.replace(/^[^{]*/, '').replace(/[^}]*$/, ''),
      
      // Strategy 5: If all else fails, try to build a minimal valid JSON
      '{"hasDateContent": true, "confidence": 0.5, "reasoning": "Parsing fallback"}'
    ];
    
    for (let i = 0; i < repairStrategies.length; i++) {
      const attempt = repairStrategies[i];
      try {
        const parsed = JSON.parse(attempt);
        if (i > 0) {
          console.log(`Successfully parsed JSON with repair strategy ${i + 1}:`, attempt.substring(0, 100));
        } else {
          console.log('Successfully parsed JSON without repairs');
        }
        return parsed;
      } catch (error) {
        console.log(`Repair strategy ${i + 1} failed:`, error instanceof Error ? error.message : 'Unknown error');
        continue;
      }
    }
    
    throw new Error('All JSON parsing strategies failed');
  }

  private createClassificationPrompt(emailContent: EmailContent): string {
    return `Analyze this school email to determine if it contains date/time information that should be extracted for a calendar.

Email Subject: ${emailContent.subject}
Email From: ${emailContent.senderEmail}
Email Body: ${emailContent.body.substring(0, 500)}...

Return ONLY a JSON object with this structure:
{
  "hasDateContent": boolean,
  "confidence": number (0-1),
  "reasoning": "brief explanation"
}

Look for:
- Assignment deadlines
- Test dates
- Events, meetings, conferences
- Sports games
- Field trips
- Registration deadlines
- Performance dates

Return true if ANY date/time information is found, false otherwise.`;
  }

  private createExtractionPrompt(emailContent: EmailContent): string {
    return `Extract important dates from this school email. Be specific and detailed.

Email: ${emailContent.subject}
From: ${emailContent.senderEmail}
Date: ${emailContent.sentDate}
Body: ${emailContent.body}

Focus on school events: assignments, tests, meetings, sports, trips, performances.
Include specific details in titles and descriptions.
Convert relative dates to absolute dates based on sent date: ${emailContent.sentDate}
Only include future dates.

Return JSON array:
[
  {
    "title": "specific event title with details",
    "date": "YYYY-MM-DD",
    "time": "HH:MM" (optional),
    "description": "detailed context and instructions",
    "confidence": 0.95,
    "reasoning": "explain exactly which text/phrase led to this date extraction and your interpretation"
  }
]

Return [] if no dates found.`;
  }

  private validateAndNormalizeResponse(events: any[], sentDate: string): LLMResponse[] {
    if (!Array.isArray(events)) {
      return [];
    }

    const sentDateTime = new Date(sentDate);
    const validEvents: LLMResponse[] = [];

    for (const event of events) {
      if (!event.title || !event.date || typeof event.confidence !== 'number') {
        continue;
      }

      const eventDate = new Date(event.date);
      if (isNaN(eventDate.getTime()) || eventDate <= sentDateTime) {
        continue;
      }

      const confidence = Math.max(0, Math.min(1, event.confidence));

      // Normalize time value
      const normalizedTime = normalizeTimeValue(event.time);

      validEvents.push({
        title: String(event.title).trim(),
        date: event.date,
        time: normalizedTime || undefined,
        description: event.description ? String(event.description).trim() : '',
        confidence: confidence,
        reasoning: event.reasoning ? String(event.reasoning).trim() : ''
      });
    }

    return validEvents;
  }
}

// Serverless function handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('Sync emails function called');
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check required environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase environment variables');
    }
    console.log('Environment variables check passed');

    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    console.log('Supabase client initialized');

    // Get user and access token from request
    const { userId, accessToken: initialAccessToken, refreshToken, forceReprocess = false } = req.body;
    console.log('Request body parsed, userId:', userId, 'forceReprocess:', forceReprocess);

    if (!userId || !initialAccessToken) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Check Gmail environment variables
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
      throw new Error('Missing Gmail environment variables');
    }

    // Check required API keys
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OpenAI API key');
    }
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Missing Gemini API key');
    }

    // Initialize services
    console.log('Initializing Gmail service');
    const gmailService = new GmailService(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET
    );

    console.log('Initializing LLM Orchestrator with tiered processing');
    const llmOrchestrator = new LLMOrchestrator(
      process.env.GEMINI_API_KEY,
      process.env.OPENAI_API_KEY,
      {
        confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.7'),
        enableBatchProcessing: process.env.ENABLE_BATCH_PROCESSING === 'true',
        geminiPrefilterModel: process.env.GEMINI_MODEL_PREFILTER || 'gemini-1.5-flash',
        geminiFallbackModel: process.env.GEMINI_MODEL_FALLBACK || 'gemini-1.5-pro',
        openaiMainModel: process.env.OPENAI_MODEL_MAIN || 'gpt-4o-mini'
      }
    );
    console.log('Services initialized successfully');

    // Create a new sync session to track this processing run (optional)
    console.log('Attempting to create sync session...');
    let sessionId: string | null = null;
    const sessionType = forceReprocess ? 'reprocess' : 'sync';
    
    try {
      const { data: syncSession, error: sessionError } = await supabase
        .from('sync_sessions')
        .insert({
          user_id: userId,
          session_type: sessionType,
          lookback_days: parseInt(process.env.EMAIL_LOOKBACK_DAYS || '7'),
          processing_mode: process.env.ENABLE_BATCH_PROCESSING === 'true' ? 'batch' : 'single'
        })
        .select()
        .single();

      if (sessionError || !syncSession) {
        console.warn(`Failed to create sync session: ${sessionError?.message || 'Unknown error'}`);
        console.warn('Continuing sync without session tracking...');
      } else {
        sessionId = syncSession.id;
        console.log(`Created sync session ${sessionId} (${sessionType})`);
      }
    } catch (error) {
      console.warn('Sync session creation failed (table may not exist):', error);
      console.warn('Continuing sync without session tracking...');
    }

    // Handle cleanup - for reprocess, do it BEFORE checking emails
    let cleanupCount = 0;
    
    if (forceReprocess) {
      console.log('Force reprocess enabled, performing complete cleanup FIRST...');
      
      // For full reprocess, clear ALL extracted dates for this user to avoid duplicates
      console.log('Removing all existing extracted dates for user...');
      const { error: deleteDatesError, count: deletedDatesCount } = await supabase
        .from('extracted_dates')
        .delete()
        .eq('user_id', userId);
      
      if (deleteDatesError) {
        console.error('Error deleting existing dates:', deleteDatesError);
      } else {
        console.log(`Removed ${deletedDatesCount || 0} existing extracted events`);
      }
      
      // Also clear processed emails so they get reprocessed
      console.log('Removing processed email records for reprocessing...');
      const { error: deleteEmailsError, count: deletedEmailsCount } = await supabase
        .from('processed_emails')
        .delete()
        .eq('user_id', userId);
      
      if (deleteEmailsError) {
        console.error('Error deleting processed emails:', deleteEmailsError);
      } else {
        console.log(`Removed ${deletedEmailsCount || 0} processed email records`);
      }
      
      cleanupCount = (deletedDatesCount || 0) + (deletedEmailsCount || 0);
      console.log(`Complete cleanup finished. Removed ${cleanupCount} total records.`);
    }

    // Handle token refresh if needed
    let accessToken = initialAccessToken;
    let tokenRefreshed = false;
    
    const validateAndRefreshToken = async (token: string): Promise<string> => {
      try {
        // Test Gmail API access specifically with a simple call
        const testResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (testResponse.ok) {
          return token; // Token is valid
        }

        // If token is invalid and we have a refresh token, try to refresh
        if ((testResponse.status === 401 || testResponse.status === 403) && refreshToken && !tokenRefreshed) {
          console.log('Access token invalid, attempting refresh...');
          const refreshedTokens = await gmailService.refreshAccessToken(refreshToken);
          tokenRefreshed = true;
          console.log('Token refreshed successfully');
          return refreshedTokens.accessToken;
        }

        throw new Error(`Gmail API access failed: ${testResponse.status} ${testResponse.statusText}`);
      } catch (error) {
        console.error('Token validation error:', error);
        
        // Try refresh token as last resort
        if (refreshToken && !tokenRefreshed) {
          try {
            console.log('Attempting token refresh as last resort...');
            const refreshedTokens = await gmailService.refreshAccessToken(refreshToken);
            tokenRefreshed = true;
            console.log('Token refreshed successfully');
            return refreshedTokens.accessToken;
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            throw new Error('Authentication failed - unable to refresh Gmail access token');
          }
        }
        
        throw error;
      }
    };

    try {
      accessToken = await validateAndRefreshToken(accessToken);
    } catch (authError) {
      console.error('Authentication error:', authError);
      return res.status(401).json({ 
        error: 'Authentication failed', 
        message: authError instanceof Error ? authError.message : 'Gmail API access denied'
      });
    }

    // Get email sources for the user
    const { data: emailSources, error: sourcesError } = await supabase
      .from('email_sources')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (sourcesError) {
      throw new Error(`Failed to fetch email sources: ${sourcesError.message}`);
    }

    if (!emailSources || emailSources.length === 0) {
      return res.status(200).json({ 
        message: 'No email sources configured', 
        processed: 0,
        duplicatesRemoved: cleanupCount
      });
    }

    // Build Gmail search query with configurable lookback window
    const sourceEmails = emailSources.map(source => source.email);
    
    // Get configurable lookback days with reasonable limits
    const configuredLookbackDays = parseInt(process.env.EMAIL_LOOKBACK_DAYS || '7');
    const maxLookbackDays = 30; // Maximum 30 days to prevent API abuse
    const minLookbackDays = 1;  // Minimum 1 day
    
    // Clamp the configured value within reasonable bounds
    const safeLookbackDays = Math.max(minLookbackDays, Math.min(maxLookbackDays, configuredLookbackDays));
    
    // For reprocess, use a much longer lookback to find historical emails
    // For normal sync, use the configured lookback window
    let query;
    if (forceReprocess) {
      // For reprocess, look back 90 days to find historical emails to reprocess
      // But limit results to avoid timeouts
      query = `to:(${sourceEmails.join(' OR ')}) newer_than:90d`;
      console.log('Reprocess mode: Using 90-day lookback to find historical emails');
    } else {
      query = `to:(${sourceEmails.join(' OR ')}) newer_than:${safeLookbackDays}d`;
    }
    
    // Fetch emails from Gmail with optimized batch size
    // Use smaller batch for full refresh to avoid timeouts
    const maxResults = forceReprocess ? 5 : 10;
    
    if (forceReprocess) {
      console.log(`Using reprocess mode: 90-day lookback with ${maxResults} max results`);
    } else {
      console.log(`Using sync mode: ${safeLookbackDays}-day lookback (configured: ${configuredLookbackDays})`);
    }
    console.log(`Gmail search query: ${query}`);
    console.log(`Searching for emails received by ${sourceEmails.length} configured sources: ${sourceEmails.join(', ')}`);
    const messagesResponse = await gmailService.listMessages(accessToken, {
      maxResults: maxResults,
      q: query
    });

    console.log(`Gmail API returned ${messagesResponse.messages.length} messages`);
    
    if (!messagesResponse.messages || messagesResponse.messages.length === 0) {
      console.log('No messages found matching the search query');
      
      // Update sync session if it exists (no processing done)
      if (sessionId) {
        try {
          await supabase
            .from('sync_sessions')
            .update({
              total_emails_processed: 0,
              total_events_extracted: 0,
              total_cost: 0,
              duplicates_removed: 0,
              skipped_duplicate_emails: 0,
              skipped_duplicate_events: 0,
              completed_at: new Date().toISOString(),
              success_status: true
            })
            .eq('id', sessionId);
        } catch (updateError) {
          console.warn('Failed to update sync session:', updateError);
        }
      }
      
      return res.status(200).json({
        message: 'No emails found matching the configured sources',
        processed: 0,
        extracted: 0,
        duplicatesRemoved: 0,
        emails: [],
        dates: []
      });
    }

    // For normal sync (not reprocess), perform routine duplicate cleanup now that we know there are messages
    if (!forceReprocess) {
      console.log('Performing routine duplicate cleanup...');
      cleanupCount = await cleanupDuplicateEvents(supabase, userId);
    }

    const processedEmails: any[] = [];
    const extractedDates: any[] = [];
    let skippedDuplicateEmails = 0;
    let skippedDuplicateEvents = 0;

    console.log(`Starting to process ${messagesResponse.messages.length} messages...`);

    // First pass: collect all email content and store in database
    const emailContentsToProcess: EmailContent[] = [];
    const emailMetadata: Array<{ messageId: string; processedEmailId: string; index: number }> = [];

    for (let i = 0; i < messagesResponse.messages.length; i++) {
      const messageRef = messagesResponse.messages[i];
      console.log(`Processing email ${i + 1}/${messagesResponse.messages.length}, ID: ${messageRef.id}`);
      
      try {
        // Get full message details with retry logic for token refresh
        console.log(`Fetching message details for ${messageRef.id}...`);
        let message;
        try {
          message = await gmailService.getMessage(accessToken, messageRef.id);
          console.log(`Successfully fetched message ${messageRef.id}`);
        } catch (gmailError) {
          // If Gmail API call fails with auth error, try to refresh token once
          if (gmailError instanceof Error && 
              (gmailError.message.includes('expired') || gmailError.message.includes('invalid') || gmailError.message.includes('forbidden')) &&
              refreshToken && !tokenRefreshed) {
            console.log('Gmail API call failed, attempting token refresh...');
            try {
              const refreshedTokens = await gmailService.refreshAccessToken(refreshToken);
              accessToken = refreshedTokens.accessToken;
              tokenRefreshed = true;
              console.log('Token refreshed, retrying Gmail API call...');
              message = await gmailService.getMessage(accessToken, messageRef.id);
            } catch (refreshError) {
              console.error('Token refresh failed during processing:', refreshError);
              throw gmailError; // Re-throw original error
            }
          } else {
            throw gmailError;
          }
        }
        
        // Extract content
        const { subject, body, from, date } = gmailService.extractTextFromMessage(message);
        console.log(`Extracted content - Subject: "${subject}", From: "${from}", Body length: ${body.length} chars`);
        
        // Create content hash for deduplication
        const contentHash = crypto
          .createHash('md5')
          .update(subject + body + from + date)
          .digest('hex');

        console.log(`Checking for existing email with ID: ${messageRef.id}`);
        // Check if email is already processed (unless force reprocess is enabled)
        if (!forceReprocess) {
          const { data: existingEmail } = await supabase
            .from('processed_emails')
            .select('id')
            .eq('gmail_message_id', messageRef.id)
            .single();

          if (existingEmail) {
            console.log(`Email ${messageRef.id} already processed, skipping...`);
            skippedDuplicateEmails++;
            continue; // Skip already processed emails
          }

          // Also check by content hash for more robust deduplication
          const { data: existingByHash } = await supabase
            .from('processed_emails')
            .select('id')
            .eq('content_hash', contentHash)
            .eq('user_id', userId)
            .single();

          if (existingByHash) {
            console.log(`Email with same content already processed, skipping...`);
            skippedDuplicateEmails++;
            continue;
          }
        }

        console.log(`Email ${messageRef.id} is new, storing in database...`);
        // Store processed email (or update if force reprocessing) with initial processing info
        const { data: processedEmail, error: emailError } = await supabase
          .from('processed_emails')
          .upsert({
            user_id: userId,
            gmail_message_id: messageRef.id,
            sender_email: from,
            subject: subject,
            sent_date: new Date(date).toISOString(),
            content_hash: contentHash,
            has_attachments: message.payload.parts?.some((part: any) => part.filename) || false,
            processed_at: new Date().toISOString(),
            // Add processing tracking fields
            processing_status: 'retrieved',
            processing_started_at: new Date().toISOString(),
            email_body_preview: body.substring(0, 500), // Store preview for dashboard
            session_id: sessionId
          }, {
            onConflict: 'gmail_message_id'
          })
          .select()
          .single();

        if (emailError) {
          console.error('Error storing email:', emailError);
          continue;
        }

        console.log(`Successfully stored email ${messageRef.id} in database`);
        processedEmails.push(processedEmail);

        // Collect email content for batch processing
        emailContentsToProcess.push({
          subject,
          body,
          senderEmail: from,
          sentDate: date
        });

        emailMetadata.push({
          messageId: messageRef.id,
          processedEmailId: processedEmail.id,
          index: i
        });

        console.log(`Completed processing email ${i + 1}/${messagesResponse.messages.length}`);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error processing email ${messageRef.id}:`, error);
        
        // Store failed processing history
        if (processedEmails.length > 0) {
          try {
            await supabase
              .from('processing_history')
              .insert({
                user_id: userId,
                session_id: sessionId,
                email_id: processedEmails[processedEmails.length - 1].id,
                llm_provider: 'gmail',
                model_name: null,
                processing_step: 'email_retrieval',
                processing_time: 0,
                input_tokens: 0,
                output_tokens: 0,
                cost: 0,
                success_status: false,
                retry_count: 0,
                error_message: error instanceof Error ? error.message : 'Unknown error'
              });
          } catch (historyError) {
            console.warn('Failed to store Gmail error processing history:', historyError);
          }
        }
      }
    }

    // Second pass: Process emails through LLM Orchestrator
    console.log(`\nStarting tiered LLM processing for ${emailContentsToProcess.length} emails...`);
    console.log(`Estimated processing time: ${emailContentsToProcess.length * 2}s (timeout limit: 300s)`);
    
    if (emailContentsToProcess.length > 0) {
      try {
        const processingMode: ProcessingMode = process.env.ENABLE_BATCH_PROCESSING === 'true' ? 'batch' : 'single';
        console.log(`Using processing mode: ${processingMode}`);
        
        const llmStartTime = Date.now();
        const llmResults = await llmOrchestrator.processEmails(emailContentsToProcess, processingMode);
        const totalLLMTime = Date.now() - llmStartTime;

        console.log(`LLM processing completed in ${totalLLMTime}ms`);
        console.log(`Processing stats:`, llmResults.processingStats);
        console.log(`Total cost: $${llmResults.processingStats.totalCost.toFixed(4)}`);
        
        // Debug: Log sample events to see if reasoning is present
        const sampleEvents = Object.values(llmResults.results).flat().slice(0, 2);
        console.log('Sample extracted events from LLM:');
        sampleEvents.forEach((event, i) => {
          console.log(`Event ${i + 1}:`, {
            title: event.title,
            date: event.date,
            confidence: event.confidence,
            reasoning: event.reasoning || 'MISSING'
          });
        });

        // Store processing history for each cost tracking entry
        console.log('Storing processing history...');
        for (const cost of llmResults.costTracking) {
          try {
            console.log(`Attempting to store processing history for ${cost.provider} ${cost.model}`);
            const { data: historyData, error: historyError } = await supabase
              .from('processing_history')
              .insert({
                user_id: userId,
                session_id: sessionId, // Can be null - that's okay now
                email_id: null, // Batch processing doesn't map to individual emails
                llm_provider: cost.provider,
                model_name: cost.model,
                processing_step: cost.provider === 'gemini' ? 
                  (cost.model.includes('flash') ? 'classification' : 'fallback') : 
                  'extraction',
                processing_time: Math.round(totalLLMTime / llmResults.costTracking.length), // Distribute time
                input_tokens: cost.inputTokens,
                output_tokens: cost.outputTokens,
                cost: cost.cost,
                success_status: true,
                retry_count: 0
              })
              .select();
            
            if (historyError) {
              console.error('Failed to store processing history:', historyError);
              console.error('Processing history table might not exist or have wrong schema');
            } else {
              console.log(`✅ Successfully stored processing history: ${cost.provider} ${cost.model} - $${cost.cost.toFixed(4)}`);
            }
          } catch (historyError) {
            console.error('Exception storing processing history:', historyError);
          }
        }

        // Store detailed email processing history
        console.log('Storing email-level processing history...');
        for (const [emailKey, events] of Object.entries(llmResults.results)) {
          const emailIndex = parseInt(emailKey.replace('email-', ''));
          const metadata = emailMetadata[emailIndex];
          
          if (metadata) {
            try {
              console.log(`Attempting to store email processing history for: ${emailContentsToProcess[emailIndex]?.subject}`);
              const { data: emailHistoryData, error: emailHistoryError } = await supabase
                .from('processing_history')
                .insert({
                  user_id: userId,
                  session_id: sessionId, // Can be null
                  email_id: metadata.processedEmailId,
                  llm_provider: 'email_processing',
                  model_name: 'orchestrator',
                  processing_step: 'email_analysis',
                  processing_time: Math.round(totalLLMTime / emailContentsToProcess.length),
                  input_tokens: 0, // Will be summed from LLM calls above
                  output_tokens: events.length, // Number of events extracted
                  cost: 0, // Cost is tracked at LLM level
                  success_status: events.length >= 0, // Success if no errors
                  confidence_score: events.length > 0 ? events.reduce((sum, e) => sum + e.confidence, 0) / events.length : null,
                  retry_count: 0
                })
                .select();
              
              if (emailHistoryError) {
                console.error(`❌ Failed to store email processing history:`, emailHistoryError);
                console.error('Email details:', {
                  subject: emailContentsToProcess[emailIndex]?.subject,
                  messageId: metadata.messageId
                });
              } else {
                console.log(`✅ Stored email processing: ${emailContentsToProcess[emailIndex]?.subject} -> ${events.length} events`);
              }
            } catch (historyError) {
              console.error(`Exception storing email processing history for ${metadata.messageId}:`, historyError);
            }
          }
        }

        // Update processed emails with comprehensive processing results and store extracted events
        console.log('Updating emails with processing results and storing events...');
        for (const [emailKey, events] of Object.entries(llmResults.results)) {
          const emailIndex = parseInt(emailKey.replace('email-', ''));
          const metadata = emailMetadata[emailIndex];
          const emailContent = emailContentsToProcess[emailIndex];
          
          if (!metadata || !emailContent) {
            console.error(`No metadata or content found for email index ${emailIndex}`);
            continue;
          }

          console.log(`Processing ${events.length} events for email: "${emailContent.subject}"`);
          
          // Calculate processing stats for this email
          const avgConfidence = events.length > 0 ? events.reduce((sum, e) => sum + e.confidence, 0) / events.length : null;
          const emailCosts = llmResults.costTracking.filter(cost => 
            cost.provider === 'openai' || cost.provider === 'gemini'
          );
          const totalEmailCost = emailCosts.reduce((sum, cost) => sum + cost.cost, 0) / emailContentsToProcess.length;
          const totalTokens = emailCosts.reduce((sum, cost) => sum + cost.inputTokens + cost.outputTokens, 0) / emailContentsToProcess.length;
          
          // Update the processed email with comprehensive processing information
          try {
            const { error: updateError } = await supabase
              .from('processed_emails')
              .update({
                processing_status: 'completed',
                processing_completed_at: new Date().toISOString(),
                events_extracted_count: events.length,
                average_confidence_score: avgConfidence,
                processing_cost: totalEmailCost,
                total_tokens_used: Math.round(totalTokens),
                llm_providers_used: [...new Set(emailCosts.map(c => c.provider))].join(', '),
                models_used: [...new Set(emailCosts.map(c => c.model))].join(', '),
                processing_time_ms: Math.round(totalLLMTime / emailContentsToProcess.length),
                had_date_content: events.length > 0,
                classification_passed: true, // If we got here, classification passed
                extraction_successful: true
              })
              .eq('id', metadata.processedEmailId);
              
            if (updateError) {
              console.error(`Failed to update processing info for email ${emailContent.subject}:`, updateError);
            } else {
              console.log(`✅ Updated processing info for: "${emailContent.subject}"`);
            }
          } catch (updateError) {
            console.error(`Exception updating email processing info:`, updateError);
          }

          for (const event of events) {
            // Normalize the time value before checking existence and storing
            const normalizedTime = normalizeTimeValue(event.time);
            
            // Check if this exact event already exists for this user
            const emailSubject = emailContentsToProcess[emailIndex]?.subject || 'Unknown';
            const exists = await eventExists(supabase, userId, event.title, event.date, normalizedTime, emailSubject);
            
            if (exists && !forceReprocess) {
              console.log(`Event "${event.title}" on ${event.date} already exists, skipping...`);
              skippedDuplicateEvents++;
              continue;
            }

            console.log(`Storing extracted event: "${event.title}" on ${event.date} (confidence: ${event.confidence})`);
            console.log(`Event time normalization: "${event.time}" -> ${normalizedTime === null ? 'NULL' : `"${normalizedTime}"`}`);
            console.log(`Event reasoning: ${event.reasoning ? `"${event.reasoning}"` : 'MISSING/NULL'}`);
            
            const safeTime = validateTimeForDatabase(normalizedTime);
            
            // Build upsert data with proper null handling
            const upsertData = {
              email_id: metadata.processedEmailId,
              user_id: userId,
              event_title: event.title,
              event_date: event.date,
              event_time: safeTime === null || safeTime === undefined ? null : safeTime,
              description: event.description,
              confidence_score: event.confidence,
              is_verified: false,
              extracted_at: new Date().toISOString(),
              reasoning: event.reasoning || null
            };
            
            const { data: extractedDate, error: dateError } = await supabase
              .from('extracted_dates')
              .upsert(upsertData, {
                onConflict: 'user_id,event_title,event_date,event_time',
                ignoreDuplicates: !forceReprocess
              })
              .select()
              .single();

            if (!dateError && extractedDate) {
              extractedDates.push(extractedDate);
            } else if (dateError) {
              console.error('Error storing extracted date:', dateError);
              console.error('Failed event data:', {
                emailSubject: emailContentsToProcess[emailIndex]?.subject || 'Unknown',
                emailSender: emailContentsToProcess[emailIndex]?.senderEmail || 'Unknown',
                title: event.title,
                date: event.date,
                originalTime: event.time,
                normalizedTime,
                safeTime,
                safeTimeType: typeof safeTime,
                userId
              });
            }
          }
        }

      } catch (error) {
        console.error('LLM processing error:', error);
        
        // Update all processed emails to show processing failed
        console.log('Updating emails with processing failure status...');
        try {
          const emailIds = emailMetadata.map(m => m.processedEmailId);
          const { error: updateError } = await supabase
            .from('processed_emails')
            .update({
              processing_status: 'failed',
              processing_completed_at: new Date().toISOString(),
              events_extracted_count: 0,
              extraction_successful: false,
              processing_error_message: error instanceof Error ? error.message : 'Unknown LLM processing error'
            })
            .in('id', emailIds);
            
          if (updateError) {
            console.error('Failed to update emails with failure status:', updateError);
          } else {
            console.log(`Updated ${emailIds.length} emails with failure status`);
          }
        } catch (updateError) {
          console.error('Exception updating emails with failure status:', updateError);
        }
        
        // Store failed processing history
        try {
          await supabase
            .from('processing_history')
            .insert({
              user_id: userId,
              session_id: sessionId,
              email_id: null,
              llm_provider: 'orchestrator',
              model_name: null,
              processing_step: 'orchestration',
              processing_time: 0,
              input_tokens: 0,
              output_tokens: 0,
              cost: 0,
              success_status: false,
              retry_count: 0,
              error_message: error instanceof Error ? error.message : 'Unknown error'
            });
        } catch (historyError) {
          console.warn('Failed to store error processing history:', historyError);
        }
      }
    }

    console.log(`Finished processing all emails. Total processed: ${processedEmails.length}, Total dates extracted: ${extractedDates.length}, Skipped duplicate emails: ${skippedDuplicateEmails}, Skipped duplicate events: ${skippedDuplicateEvents}`);

    // Update sync session with final results (if session tracking is enabled)
    if (sessionId) {
      try {
        // Calculate total cost from processing history for this session
        const { data: sessionCosts } = await supabase
          .from('processing_history')
          .select('cost')
          .eq('session_id', sessionId);

        const totalSessionCost = sessionCosts?.reduce((sum, item) => sum + parseFloat(item.cost || '0'), 0) || 0;

        // Update sync session with final results
        await supabase
          .from('sync_sessions')
          .update({
            total_emails_processed: processedEmails.length,
            total_events_extracted: extractedDates.length,
            total_cost: totalSessionCost,
            duplicates_removed: cleanupCount,
            skipped_duplicate_emails: skippedDuplicateEmails,
            skipped_duplicate_events: skippedDuplicateEvents,
            completed_at: new Date().toISOString(),
            success_status: true
          })
          .eq('id', sessionId);
        
        console.log(`Updated sync session ${sessionId} with final results`);
      } catch (updateError) {
        console.warn('Failed to update sync session:', updateError);
      }
    }

    // Update user's last sync timestamp
    await supabase
      .from('users')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', userId);

    console.log(`Updated user last sync timestamp${sessionId ? ' and sync session' : ' (no session tracking)'}`);

    const responseMessage = forceReprocess 
      ? 'Email reprocessing completed successfully'
      : 'Email sync completed successfully';

    // Calculate final statistics
    const finalStats = {
      message: responseMessage,
      processed: processedEmails.length,
      extracted: extractedDates.length,
      duplicatesRemoved: cleanupCount,
      skippedDuplicateEmails,
      skippedDuplicateEvents,
      forceReprocess,
      processingMode: process.env.ENABLE_BATCH_PROCESSING === 'true' ? 'batch' : 'single',
      lookbackConfiguration: {
        requestedDays: parseInt(process.env.EMAIL_LOOKBACK_DAYS || '7'),
        actualDays: forceReprocess ? 90 : safeLookbackDays,
        usedInQuery: forceReprocess ? '90d' : `${safeLookbackDays}d`,
        maxAllowed: 30,
        reprocessMode: forceReprocess
      },
      costOptimization: {
        prefilterEnabled: true,
        confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.7'),
        tieredProcessing: true
      },
      emails: processedEmails,
      dates: extractedDates
    };

    res.status(200).json(finalStats);

  } catch (error) {
    console.error('Sync emails error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 