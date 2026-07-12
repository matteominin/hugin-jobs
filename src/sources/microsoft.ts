import { jobs as jobsCol } from '../db.js';
import type { RawJob } from '../types.js';
import { isEuropeAlpha2 } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const SEARCH_URL = 'https://apply.careers.microsoft.com/api/pcsx/search';
const BASE = 'https://apply.careers.microsoft.com';
const DEFAULT_SENIORITIES = ['Intern'];
const MAX_JOBS = 500; // safety bound on the newest-first crawl

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
export class MicrosoftSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const seniorities = this.option<string[]>('seniorities', DEFAULT_SENIORITIES);

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
    return std.some((s) => isEuropeAlpha2(s.split(',').pop()));
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

    const data = (
      await this.fetchJson<MsResponse>(`${SEARCH_URL}?${params.toString()}`, {
        headers: { accept: 'application/json' },
      })
    ).data;
    return { positions: data?.positions ?? [], count: data?.count ?? 0 };
  }
}
