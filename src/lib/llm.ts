import { LLMResponse } from '../types';

export interface LLMProvider {
  extractDates(emailContent: EmailContent): Promise<LLMResponse[]>;
}

export interface EmailContent {
  subject: string;
  body: string;
  senderEmail: string;
  sentDate: string;
}

export class OpenAIService implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4-turbo-preview') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async extractDates(emailContent: EmailContent): Promise<LLMResponse[]> {
    const prompt = this.createPrompt(emailContent);

    try {
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
              content: 'You are an AI assistant that extracts important dates and events from school emails. Focus on academic deadlines, events, meetings, and other time-sensitive information. Return only valid JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      // Parse JSON response
      const events = JSON.parse(content);
      
      // Validate and normalize the response
      return this.validateAndNormalizeResponse(events, emailContent.sentDate);

    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`Failed to extract dates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private createPrompt(emailContent: EmailContent): string {
    return `Extract all important dates from this school email:

Email Details:
- Sent Date: ${emailContent.sentDate}
- From: ${emailContent.senderEmail}
- Subject: ${emailContent.subject}

Email Content (cleaned from HTML):
${emailContent.body}

Instructions:
1. Focus on school-related events like:
   - Assignment deadlines
   - Test dates
   - Parent-teacher conferences
   - School events
   - Field trips
   - School holidays
   - Registration deadlines
   - Meeting dates

2. Convert relative dates (like "this Friday", "next week") to absolute dates based on the email sent date
3. Include only future dates (after the email sent date)
4. Provide a confidence score (0-1) for each extracted date
5. Extract meaningful event titles and descriptions

Return a JSON array with this exact structure:
[
  {
    "title": "Event or deadline title",
    "date": "YYYY-MM-DD",
    "time": "HH:MM" (optional, use 24-hour format),
    "description": "Brief description of the event",
    "confidence": 0.95
  }
]

If no dates are found, return an empty array: []`;
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

      validEvents.push({
        title: String(event.title).trim(),
        date: event.date,
        time: event.time || undefined,
        description: event.description ? String(event.description).trim() : '',
        confidence: confidence
      });
    }

    return validEvents;
  }
}

export class ClaudeService implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-sonnet-20240229') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async extractDates(emailContent: EmailContent): Promise<LLMResponse[]> {
    const prompt = this.createPrompt(emailContent);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.content[0]?.text;

      if (!content) {
        throw new Error('No response content from Claude');
      }

      // Parse JSON response
      const events = JSON.parse(content);
      
      // Validate and normalize the response
      return this.validateAndNormalizeResponse(events, emailContent.sentDate);

    } catch (error) {
      console.error('Claude API error:', error);
      throw new Error(`Failed to extract dates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private createPrompt(emailContent: EmailContent): string {
    return `Extract all important dates from this school email:

Email Details:
- Sent Date: ${emailContent.sentDate}
- From: ${emailContent.senderEmail}
- Subject: ${emailContent.subject}

Email Content (cleaned from HTML):
${emailContent.body}

Instructions:
1. Focus on school-related events like:
   - Assignment deadlines
   - Test dates
   - Parent-teacher conferences
   - School events
   - Field trips
   - School holidays
   - Registration deadlines
   - Meeting dates

2. Convert relative dates (like "this Friday", "next week") to absolute dates based on the email sent date
3. Include only future dates (after the email sent date)
4. Provide a confidence score (0-1) for each extracted date
5. Extract meaningful event titles and descriptions

Return a JSON array with this exact structure:
[
  {
    "title": "Event or deadline title",
    "date": "YYYY-MM-DD",
    "time": "HH:MM" (optional, use 24-hour format),
    "description": "Brief description of the event",
    "confidence": 0.95
  }
]

If no dates are found, return an empty array: []`;
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

      validEvents.push({
        title: String(event.title).trim(),
        date: event.date,
        time: event.time || undefined,
        description: event.description ? String(event.description).trim() : '',
        confidence: confidence
      });
    }

    return validEvents;
  }
}

// Factory function to create LLM provider
export const createLLMProvider = (provider: 'openai' | 'claude' = 'openai'): LLMProvider => {
  switch (provider) {
    case 'openai':
      // Check both server and client environment variables
      const openaiKey = process.env.OPENAI_API_KEY || import.meta.env?.VITE_OPENAI_API_KEY;
      if (!openaiKey) {
        throw new Error('OpenAI API key not found in environment variables');
      }
      return new OpenAIService(openaiKey);
    case 'claude':
      // Check both server and client environment variables
      const claudeKey = process.env.CLAUDE_API_KEY || import.meta.env?.VITE_CLAUDE_API_KEY;
      if (!claudeKey) {
        throw new Error('Claude API key not found in environment variables');
      }
      return new ClaudeService(claudeKey);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}; 