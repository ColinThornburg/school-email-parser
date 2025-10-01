/**
 * PromptConfig centralizes every LLM prompt used in the app so you can tweak
 * wording without diving into the code. Update the text strings below and the
 * changes will propagate across the classification, extraction, and summary
 * pipeline after a redeploy.
 *
 * Editing guide:
 * - Feel free to rewrite the sentences and bullet lists.
 * - Leave anything wrapped in double curly braces (e.g., {{subject}}) exactly
 *   as-is – those placeholders are filled in automatically when the prompts run.
 * - JSON shapes should remain valid (e.g., keep braces/brackets and field names).
 */

export const prompts = {
  /**
   * Quick triage prompt (Gemini) that decides if an email has date/time info.
   * Used before the expensive extraction pass and controls whether we skip an email.
   * NOTE: This is typically skipped for trusted school senders that are pre-configured.
   */
  classificationPrompt: `Analyze this school email to decide if it contains actionable date or time information that parents should see.

Email Subject: {{subject}}
Email From: {{senderEmail}}
Email Body: {{bodyPreview}}...

Return ONLY JSON:
{
  "hasDateContent": boolean,
  "confidence": number (0-1),
  "reasoning": "short explanation"
}

Look carefully for:
- Calendar sections or event listings (often titled "MARK YOUR CALENDAR", "UPCOMING EVENTS", "SAVE THE DATE")
- Cafeteria/lunch menus with days of the week
- Assignment due dates, test dates, project deadlines
- School events: meetings, sports, performances, field trips
- Conference schedules, parent sessions
- School breaks, early dismissals, holidays
- Any dates mentioned with month names or day-of-week patterns

Return true if ANY of these date patterns are found, even if they appear later in the email.`,

  /**
   * Main extraction prompt (OpenAI) that pulls structured events from an email.
   * Adjust tone/requirements to change the level of detail in the calendar events.
   */
  extractionPrompt: `Extract parent-facing events from this school email.

Subject: {{subject}}
From: {{senderEmail}}
Sent: {{sentDate}}
Full Body: {{body}}

Instructions:
- Focus on real-world dates for assignments, events, meetings, practices, trips, reminders.
- Convert relative references ("next Thursday") into absolute YYYY-MM-DD using the sent date.
- Only include events after the sent date.
- Use rich, specific titles and descriptions.
- IMPORTANT: Always extract lunch/cafeteria menus. When you see a section like "CAFETERIA" or "WHAT'S FOR LUNCH" with day-of-week entries (Monday: Chicken, Tuesday: Pizza, etc.), convert each day to the actual date of that weekday in the upcoming week. For example, if the email was sent on Saturday Sept 28, then "Monday: Chicken" becomes "2025-09-30" (the following Monday). Create one event per day with title "Lunch: [menu item]".

Respond with JSON array:
[
  {
    "title": "specific event title",
    "date": "YYYY-MM-DD",
    "time": "HH:MM" (24h, optional),
    "description": "context + requirements",
    "confidence": 0.93,
    "reasoning": "explain which text triggered this event"
  }
]

Return [] if nothing actionable is found.`,

  /**
   * Summary prompt (OpenAI) that produces parent-friendly highlights and action items.
   * Changing this alters the dashboard summaries shown in the Email Summaries view.
   */
  summaryPrompt: `Create a concise summary for this school email.  Include the key points and details including key dates.  The sender email should be cleaned from punctuation. at the end or beginning of the email address.

Sent Date: {{sentDate}}
From: {{senderEmail}}
Subject: {{subject}}
Body: {{body}}

Output JSON:
{
  "keyPoints": ["bullet highlighting the main updates"],
  "importantDates": [{
    "date": "YYYY-MM-DD",
    "description": "what happens",
    "originalText": "quote from email"
  }],
  "actionItems": ["what parents/students should do"],
  "categories": ["Academic", "Events", ...],
  "confidence": 0.9
}

Keep tone clear and warm. Use plain language and preserve any must-know instructions.`
} as const;