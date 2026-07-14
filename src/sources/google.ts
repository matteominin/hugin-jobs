import type { RawJob } from '../types.js';
import { isEuropeAlpha2 } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const SEARCH_URL = 'https://www.google.com/about/careers/applications/jobs/results/';
const DEFAULT_QUERIES = [
  'student researcher BS/MS',
  'software engineer intern',
  'research engineer intern',
  'software engineering internship',
  'research internship',
  'early careers software engineer',
  'university graduate software engineer',
  'new grad software engineer',
  'graduate software engineer',
  'research software engineer',
  'deepmind student researcher',
  'google deepmind student researcher',
  'deepmind research engineer',
];
const DEFAULT_MAX_PAGES = 3;

const TARGET_TITLE =
  /\b(student researcher|software engineer|software engineering|research engineer|research software engineer|production engineer|security engineer|data scientist|research scientist|research intern(ship)?|intern(ship)?.*(software|engineer|research)|graduate.*(software|engineer|research)|new grad.*(software|engineer|research)|early career|early careers|university graduate|working student.*(software|engineer|research))\b/i;

const EXCLUDED_TITLE =
  /\b(apprentice|apprenticeship|efz|step|greach|post-?doctoral|postdoc|senior|staff|principal|manager|director|iii|lll|iv|v|vi|vii|viii|ix|x|recruit(?:er|ing)|sales|marketing|legal|finance|account(?:ing|ant)|people operations|hr|human resources|designer|design)\b/i;

interface GoogleLocation {
  label: string;
  countryCode?: string;
}

interface GoogleJob {
  id: string;
  title: string;
  locations: GoogleLocation[];
  responsibilities?: string;
  qualifications?: string;
  about?: string;
}

/**
 * Google Careers embeds full search-result job tuples in the HTML response.
 * We query student/intern-oriented searches, parse those JSON-like tuples, then
 * cheaply filter to Bachelor/Master-accessible technical student roles in Europe.
 */
export class GoogleSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const queries = this.option<string[]>('queries', DEFAULT_QUERIES);
    const maxPages = this.option<number>('maxPages', DEFAULT_MAX_PAGES);
    const jobs = new Map<string, GoogleJob>();

    for (const query of queries) {
      for (let page = 1; page <= maxPages; page++) {
        const html = await this.fetchText(searchUrl(query, page));
        const parsed = parseGoogleJobs(html);
        if (parsed.length === 0) break;

        for (const job of parsed) {
          if (this.keep(job)) jobs.set(job.id, job);
        }
      }
    }

    return [...jobs.values()].map(
      (j) =>
        ({
          title: j.title,
          url: `${SEARCH_URL}${j.id}`,
          location: j.locations.map((l) => l.label).join(' / ') || undefined,
          description: htmlToText([j.about, j.responsibilities, j.qualifications].join('\n\n')),
          company: 'Google',
        }) satisfies RawJob,
    );
  }

  private keep(job: GoogleJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    if (!this.inEurope(job)) return false;

    const text = `${job.title}\n${job.qualifications ?? ''}\n${job.about ?? ''}`;
    if (/\bcurrently attending a degree program in the United States\b/i.test(text)) return false;
    if (/\bhigh(?: |-)?school\b/i.test(text)) return false;
    return true;
  }

  private inEurope(job: GoogleJob): boolean {
    const countryCodes = job.locations.map((l) => l.countryCode).filter(Boolean);
    if (countryCodes.length === 0) return true;
    return countryCodes.some((code) => isEuropeAlpha2(code));
  }
}

function searchUrl(query: string, page: number): string {
  const params = new URLSearchParams();
  params.set('q', query);
  if (page > 1) params.set('page', String(page));
  return `${SEARCH_URL}?${params.toString()}`;
}

function parseGoogleJobs(html: string): GoogleJob[] {
  const jobs: GoogleJob[] = [];
  const starts = html.matchAll(/\["(\d{12,})","/g);
  for (const match of starts) {
    const tuple = parseArrayAt(html, match.index ?? 0);
    if (!isGoogleJobTuple(tuple)) continue;
    jobs.push({
      id: tuple[0],
      title: tuple[1],
      responsibilities: tupleText(tuple[3]),
      qualifications: tupleText(tuple[4]),
      about: tupleText(tuple[10]),
      locations: parseLocations(tuple[9]),
    });
  }
  return jobs;
}

function parseArrayAt(input: string, start: number): unknown {
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (ch === '\\') {
        escaping = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(input.slice(start, i + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function isGoogleJobTuple(value: unknown): value is unknown[] & [string, string, string] {
  return (
    Array.isArray(value) &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'string' &&
    typeof value[2] === 'string' &&
    value[2].startsWith('https://www.google.com/about/careers/applications/signin?jobId')
  );
}

function tupleText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  return typeof value[1] === 'string' ? value[1] : undefined;
}

function parseLocations(value: unknown): GoogleLocation[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(Array.isArray)
    .map((location) => ({
      label: typeof location[0] === 'string' ? location[0] : '',
      countryCode: typeof location[5] === 'string' ? location[5] : undefined,
    }))
    .filter((location) => location.label);
}
