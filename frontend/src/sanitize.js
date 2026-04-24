/**
 * HTML Sanitizer — XSS protection for dynamic content.
 * Wraps DOMPurify with a safe default configuration.
 */
import DOMPurify from 'dompurify';

// Configure DOMPurify with safe defaults
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'b', 'i', 'em', 'strong', 'br', 'hr',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'span', 'div', 'section',
    'code', 'pre', 'blockquote',
    'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img', 'sup', 'sub',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'class', 'style', 'id',
    'title', 'alt', 'src', 'width', 'height',
    'data-*',
  ],
  ALLOW_DATA_ATTR: true,
  // Block dangerous tags and attributes
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus'],
};

/**
 * Sanitize HTML string to prevent XSS attacks.
 * Use this for ALL innerHTML assignments that contain:
 * - LLM-generated content (executive summaries, recommendations, etc.)
 * - User-provided content (filenames, notes, search queries)
 * - External content (research source summaries)
 * 
 * @param {string} html - Raw HTML string to sanitize
 * @returns {string} Sanitized HTML safe for innerHTML assignment
 */
export function sanitizeHTML(html) {
  if (!html || typeof html !== 'string') return '';
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}

/**
 * Escape a plain text string for safe embedding in HTML.
 * Use for user-provided TEXT that should NOT contain any HTML.
 * 
 * @param {string} text - Plain text to escape
 * @returns {string} HTML-escaped string
 */
export function escapeHTML(text) {
  if (!text || typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
