import { jobs as jobsCol } from '../db.js';
import { HttpFetcher } from '../fetchers/http.js';
import type { Portal, RawJob } from '../types.js';
import { htmlToText } from '../util/html.js';
import type { Source } from './index.js';

const SEARCH_URL = 'https://apply.careers.microsoft.com/api/pcsx/search';
const BASE = 'https://apply.careers.microsoft.com';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const DEFAULT_SENIORITIES = ['Intern'];
const MAX_JOBS = 500; // safety bound on the newest-first crawl
// Europe (EU/EEA/UK/CH) as ISO-3166 alpha-2 — the trailing token of each
// standardizedLocations entry, e.g. "Dublin, D, IE" → "IE".
const EUROPE = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'GB', 'CH', 'NO', 'IS', 'LI',
]);

interface MsPosition {
  id: number;
  name: string;
  locations?: string[];
  standardizedLocations?: string[];
  department?: string;
  positionUrl?: string;
}
interface MsResponse {
  data?: { positions?: MsPosition[]; count?: number };
}

/**
 * Microsoft's apply.careers.microsoft.com (pcsx) search API. `filter_seniority`
 * is the only reliable server-side filter (the site's `location=emea` returns
 * nothing), so we filter to interns there and to Europe client-side by the
 * standardizedLocations country code. Results are sorted newest-first and we
 * page until we reach a job already stored for this portal — so incremental runs
 * stop early instead of re-scanning the whole intern list. The list carries no
 * description, so we pass the department to the LLM as the role signal.
 */
export class MicrosoftSource implements Source {
  private readonly http = new HttpFetcher();

  constructor(private readonly portal: Portal) {}

  async produce(): Promise<RawJob[]> {
    const seniorities =
      (this.portal.sourceOptions?.seniorities as string[] | undefined) ?? DEFAULT_SENIORITIES;

    // URLs already stored for this portal — hitting one means every older job
    // (timestamp-sorted) is already processed, so we can stop paging.
    const seen = new Set(
      (await jobsCol().find({ portalId: this.portal._id }).project({ url: 1 }).toArray()).map(
        (d) => d.url as string,
      ),
    );

    const fresh: MsPosition[] = [];
    let start = 0;
    let reachedSeen = false;
    while (!reachedSeen && start < MAX_JOBS) {
      const { positions, count } = await this.search(seniorities, start);
      if (positions.length === 0) break;

      for (const p of positions) {
        if (seen.has(this.urlOf(p))) {
          reachedSeen = true;
          break;
        }
        fresh.push(p);
      }

      start += positions.length;
      if (start >= count) break;
    }

    return fresh
      .filter((p) => this.inEurope(p))
      .map(
        (p) =>
          ({
            title: p.name,
            url: this.urlOf(p),
            location: (p.locations ?? []).join(' · ') || undefined,
            description: htmlToText(p.department),
            company: 'Microsoft',
          }) satisfies RawJob,
      );
  }

  private urlOf(p: MsPosition): string {
    return `${BASE}${p.positionUrl ?? `/careers/job/${p.id}`}`;
  }

  private inEurope(p: MsPosition): boolean {
    const std = p.standardizedLocations ?? [];
    if (std.length === 0) return true; // no location data — let the LLM decide
    return std.some((s) => EUROPE.has(s.split(',').pop()!.trim().toUpperCase()));
  }

  private async search(
    seniorities: string[],
    start: number,
  ): Promise<{ positions: MsPosition[]; count: number }> {
    const params = new URLSearchParams();
    params.set('domain', 'microsoft.com');
    params.set('query', '');
    params.set('location', '');
    params.set('start', String(start));
    params.set('sort_by', 'timestamp');
    for (const s of seniorities) params.append('filter_seniority', s);

    const body = await this.http.fetch({
      url: `${SEARCH_URL}?${params.toString()}`,
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': BROWSER_UA },
    });
    const data = (JSON.parse(body) as MsResponse).data;
    return { positions: data?.positions ?? [], count: data?.count ?? 0 };
  }
}
