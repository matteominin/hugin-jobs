import type { JsonExtraction, RawJob } from '../types.js';
import { htmlToText } from '../util/html.js';

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
      description: htmlToText(getPath(item, extraction.fields.description ?? '')),
      company: asString(getPath(item, extraction.fields.company ?? '')),
      location: asString(getPath(item, extraction.fields.location ?? '')),
    });
  }
  return jobs;
}
