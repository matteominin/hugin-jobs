import { config } from '../config.js';
import type { RawJob } from '../types.js';
import { EUROPE_ALPHA3, isEuropeAlpha2 } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource, BROWSER_UA } from './base.js';

const BASE = 'https://jobs.apple.com';
const LOCALE = 'en-us';
const SEARCH_URL = `${BASE}/api/v1/search`;
const DETAILS_URL = `${BASE}/api/v1/jobDetails`;
/** Every European country Apple can post in — the search takes them in one filter. */
const DEFAULT_LOCATION_IDS = EUROPE_ALPHA3.map((code) => `postLocation-${code}`);
/**
 * Pages of 20 to walk before giving up. Europe is ~300 postings (15 pages), so
 * this is headroom: `searchAll` stops as soon as it has every record, and the
 * cap only exists to bound a runaway loop. Keep it well clear of the real page
 * count or the sweep silently truncates.
 */
const DEFAULT_MAX_LOCATION_PAGES = 40;

const TARGET_LEVEL =
  /\b(intern(ship)?|student|students|working student|graduate|new grad|university graduate|masters? internship|early career)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineering|engineer|research|machine learning|ml\b|ai\b|artificial intelligence|siri|swift|compiler|cloud|systems?|firmware|platform|security|data|algorithm|vision|developer tools?)\b/i;
const EXCLUDED_TITLE =
  /\b(phd internship|post-?doctoral|postdoc|senior|staff|principal|lead|manager|director|retail|specialist|operations|sales|marketing|business|creative|expert|store|channel|partner|legal|finance|recruit(?:er|ing)|designer|design)\b/i;
const EUROPE_LOCATION_NAME =
  /\b(United Kingdom|UK|Ireland|Cork|London|Cambridge|Germany|Munich|Berlin|France|Paris|Switzerland|Zurich|Netherlands|Amsterdam|Spain|Madrid|Barcelona|Italy|Milan|Sweden|Stockholm|Denmark|Copenhagen|Norway|Oslo|Finland|Helsinki|Belgium|Brussels|Austria|Vienna|Poland|Warsaw|Portugal|Czech|Prague|Romania|Luxembourg)\b/i;

interface AppleLocation {
  name?: string;
  countryName?: string;
  countryID?: string;
  code?: string;
}

interface AppleJob {
  id: string;
  jobNumber?: string;
  reqId?: string;
  postingTitle: string;
  transformedPostingTitle?: string;
  jobSummary?: string;
  description?: string;
  minimumQualifications?: string[];
  preferredQualifications?: string[];
  team?: { teamName?: string };
  teamNames?: string[];
  locations?: AppleLocation[];
}

interface AppleSearchData {
  searchResults?: AppleJob[];
  totalRecords?: number;
}

interface AppleResponse<T> {
  res?: T;
}

interface AppleSearchBody {
  query: string;
  filters: Record<string, unknown>;
  page: number;
  locale: string;
  sort: string;
  format: { longDate: string; mediumDate: string };
}

/**
 * Apple Jobs exposes a public React route plus JSON endpoints. Direct API calls
 * work after the jobs site sets its lightweight routing cookies, so this source
 * initializes that cookie, pages one search filtered to every European country,
 * then fetches details for the student-level technical roles that survive local
 * filtering.
 *
 * The search takes all of Europe in a single `locations` filter, so that sweep
 * already contains every European posting; keyword searches on top of it can
 * only return jobs it has already seen (they search globally and are then
 * Europe-filtered anyway), which is why there are none.
 */
export class AppleSource extends BaseSource {
  private cookie = '';

  async produce(): Promise<RawJob[]> {
    await this.establishCookie();

    const locationIds = this.option<string[]>('locationIds', DEFAULT_LOCATION_IDS);
    const maxLocationPages = this.option<number>('maxLocationPages', DEFAULT_MAX_LOCATION_PAGES);
    const jobs = new Map<string, AppleJob>();

    const locationResults = await this.searchAll(
      { query: '', filters: { locations: locationIds } },
      maxLocationPages,
    );
    for (const job of locationResults) {
      if (this.keep(job)) jobs.set(this.idOf(job), job);
    }

    const rawJobs: RawJob[] = [];
    for (const job of jobs.values()) {
      const detail = await this.details(this.idOf(job)).catch(() => job);
      const merged = { ...job, ...detail };
      rawJobs.push({
        title: merged.postingTitle,
        url: this.urlOf(merged),
        location: this.locationLabel(merged) || undefined,
        description: htmlToText(
          [
            merged.jobSummary,
            merged.description,
            ...(merged.minimumQualifications ?? []),
            ...(merged.preferredQualifications ?? []),
            ...(merged.teamNames ?? []),
            merged.team?.teamName,
          ]
            .filter(Boolean)
            .join('\n\n'),
        ),
        company: 'Apple',
      });
    }

    return rawJobs;
  }

  private keep(job: AppleJob): boolean {
    const text = [
      job.postingTitle,
      job.jobSummary,
      job.description,
      job.team?.teamName,
      ...(job.teamNames ?? []),
    ].join('\n');

    if (!this.inEurope(job)) return false;
    if (!TARGET_LEVEL.test(text)) return false;
    if (!TECHNICAL_SIGNAL.test(text)) return false;
    if (EXCLUDED_TITLE.test(job.postingTitle)) return false;
    return true;
  }

  private inEurope(job: AppleJob): boolean {
    const locations = job.locations ?? [];
    if (locations.length === 0) return true;

    return locations.some((location) => {
      const code = countryCodeOf(location);
      if (isEuropeAlpha2(code)) return true;
      if (code && EUROPE_ALPHA3.includes(code.toUpperCase())) return true;
      return EUROPE_LOCATION_NAME.test([location.name, location.countryName].filter(Boolean).join(' '));
    });
  }

  private idOf(job: AppleJob): string {
    return job.jobNumber ?? job.id;
  }

  private urlOf(job: AppleJob): string {
    const id = this.idOf(job);
    const slug = job.transformedPostingTitle;
    return `${BASE}/${LOCALE}/details/${id}${slug ? `/${slug}` : ''}`;
  }

  private locationLabel(job: AppleJob): string {
    return (job.locations ?? [])
      .map((location) => [location.name, location.countryName].filter(Boolean).join(', '))
      .filter(Boolean)
      .join(' / ');
  }

  private async searchAll(
    base: Pick<AppleSearchBody, 'query' | 'filters'>,
    maxPages: number,
  ): Promise<AppleJob[]> {
    const results: AppleJob[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const data = await this.search({ ...base, page });
      const jobs = data.searchResults ?? [];
      if (jobs.length === 0) break;

      results.push(...jobs);
      if (results.length >= (data.totalRecords ?? 0)) break;
    }

    return results;
  }

  private async search(input: Pick<AppleSearchBody, 'query' | 'filters' | 'page'>): Promise<AppleSearchData> {
    const body = {
      ...input,
      locale: LOCALE,
      sort: 'newest',
      format: { longDate: 'MMMM D, YYYY', mediumDate: 'MMM D, YYYY' },
    } satisfies AppleSearchBody;

    const response = await this.fetchAppleJson<AppleResponse<AppleSearchData>>(SEARCH_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', referer: `${BASE}/${LOCALE}/search` },
      body: JSON.stringify(body),
    });
    return response.res ?? {};
  }

  private async details(id: string): Promise<AppleJob> {
    const response = await this.fetchAppleJson<AppleResponse<AppleJob>>(`${DETAILS_URL}/${id}`, {
      headers: { accept: 'application/json', referer: `${BASE}/${LOCALE}/details/${id}` },
    });
    return response.res ?? ({ id, postingTitle: id } satisfies AppleJob);
  }

  private async establishCookie(): Promise<void> {
    const res = await fetch(`${BASE}/${LOCALE}/search`, {
      headers: { 'user-agent': BROWSER_UA },
      signal: AbortSignal.timeout(config.httpTimeoutMs),
    });
    this.cookie = mergeCookieHeaders('', setCookieHeaders(res.headers));
  }

  private async fetchAppleJson<T>(
    url: string,
    opts: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<T> {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        'user-agent': BROWSER_UA,
        cookie: this.cookie,
        ...opts.headers,
      },
      body: opts.body,
      signal: AbortSignal.timeout(config.httpTimeoutMs),
    });
    this.cookie = mergeCookieHeaders(this.cookie, setCookieHeaders(res.headers));

    if (!res.ok) {
      throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new Error(`fetch ${url} returned non-JSON response: ${(err as Error).message}`);
    }
  }
}

function countryCodeOf(location: AppleLocation): string | undefined {
  const raw = location.countryID ?? location.code;
  return raw?.replace(/^iso-country-/i, '').trim();
}

function setCookieHeaders(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  const fromGetter = withGetter.getSetCookie?.();
  if (fromGetter?.length) return fromGetter;

  const combined = headers.get('set-cookie');
  if (!combined) return [];
  return combined.match(/(?:^|,\s*)([^=;,]+=[^;]*)/g)?.map((value) => value.replace(/^,\s*/, '')) ?? [];
}

function mergeCookieHeaders(current: string, setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const cookie of current.split(';')) {
    const [name, ...value] = cookie.trim().split('=');
    if (name && value.length > 0) jar.set(name, value.join('='));
  }

  for (const setCookie of setCookies) {
    const [pair] = setCookie.split(';');
    const [name, ...value] = pair.trim().split('=');
    if (name && value.length > 0 && value[0] !== '') jar.set(name, value.join('='));
  }

  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}
