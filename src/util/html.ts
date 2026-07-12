import * as cheerio from 'cheerio';

/**
 * Turn a possibly-HTML string into plain text for the LLM. Some APIs return
 * entity-encoded HTML (e.g. Greenhouse `content`), so we decode entities, strip
 * tags, collapse whitespace and cap the length. Plain text passes through.
 */
export function htmlToText(value: unknown): string | undefined {
  if (value == null) return undefined;
  const decoded = cheerio.load(String(value)).text(); // entities → real HTML/text
  const text = cheerio.load(decoded).text().replace(/\s+/g, ' ').trim(); // strip tags
  return text ? text.slice(0, 4000) : undefined;
}
