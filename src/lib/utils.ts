import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converts HTML content to clean plain text
 * Handles HTML entities, preserves meaningful whitespace, and cleans up formatting
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  
  let text = html;
  
  // Replace common block elements with line breaks
  text = text.replace(/<\/?(div|p|br|h[1-6]|li|tr|td|th)[^>]*>/gi, '\n');
  
  // Replace list items with bullet points
  text = text.replace(/<li[^>]*>/gi, '\n• ');
  
  // Remove all other HTML tags
  text = text.replace(/<[^>]*>/g, '');
  
  // Decode common HTML entities
  const entities: { [key: string]: string } = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™'
  };
  
  // Replace HTML entities
  for (const [entity, replacement] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, 'gi'), replacement);
  }
  
  // Handle numeric HTML entities (like &#160; for non-breaking space)
  text = text.replace(/&#(\d+);/g, (_match, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });
  
  // Handle hex HTML entities (like &#x00A0; for non-breaking space)
  text = text.replace(/&#x([0-9A-F]+);/gi, (_match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  
  // Clean up whitespace
  text = text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Replace multiple line breaks with double line breaks
    .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
    .replace(/[ \t]*\n[ \t]*/g, '\n') // Remove spaces around line breaks
    .trim(); // Remove leading/trailing whitespace
  
  return text;
}

/**
 * Extracts and cleans text content from email body, handling both plain text and HTML
 */
export function extractEmailText(body: string): string {
  if (!body) return '';
  
  // Check if content appears to be HTML (contains HTML tags)
  const hasHtmlTags = /<[^>]+>/.test(body);
  
  if (hasHtmlTags) {
    return htmlToText(body);
  }
  
  // For plain text, just clean up whitespace
  return body
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Check if the date is valid
  if (isNaN(dateObj.getTime())) {
    console.warn('Invalid date provided to formatDate:', date);
    return 'Invalid Date';
  }
  
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(dateObj)
}

export function formatDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Check if the date is valid
  if (isNaN(dateObj.getTime())) {
    console.warn('Invalid date provided to formatDateTime:', date);
    return 'Invalid Date';
  }
  
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(dateObj)
} 