import * as cheerio from 'cheerio';
import type { JsonExtraction, RawJob } from '../types.js';

/**
 * Normalize a description field. Some JSON APIs (e.g. Greenhouse) return the
 * body as entity-encoded HTML, so we decode entities, strip tags and collapse
 * whitespace, then cap the length to keep the LLM prompt lean. Plain text passes
 * through unchanged.
 */
function cleanDescription(value: unknown): string | undefined {
  if (value == null) return undefined;
  const decoded = cheerio.load(String(value)).text(); // entities → real HTML/text
  const text = cheerio.load(decoded).text().replace(/\s+/g, ' ').trim(); // strip tags
  return text ? text.slice(0, 4000) : undefined;
}

/** Read a dot-path from an object; empty path returns the value itself. */
function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function asString(value: unknown): string | undefined {
  if (value == null) return undefined;
  return String(value).trim() || undefined;
}

export function extractJson(body: string, extraction: JsonExtraction): RawJob[] {
  const data = JSON.parse(body);
  const list = getPath(data, extraction.jobsPath);
  if (!Array.isArray(list)) {
    throw new Error(`json extraction: path "${extraction.jobsPath}" is not an array`);
  }

  const jobs: RawJob[] = [];
  for (const item of list) {
    const title = asString(getPath(item, extraction.fields.title));
    const url = asString(getPath(item, extraction.fields.url));
    if (!title || !url) continue;
    jobs.push({
      title,
      url,
      description: cleanDescription(getPath(item, extraction.fields.description ?? '')),
      company: asString(getPath(item, extraction.fields.company ?? '')),
      location: asString(getPath(item, extraction.fields.location ?? '')),
    });
  }
  return jobs;
}
