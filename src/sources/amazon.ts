import { jobs as jobsCol } from '../db.js';
import type { RawJob } from '../types.js';
import { EUROPE_ALPHA3 } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const SEARCH_URL = 'https://www.amazon.jobs/en/search.json';
const DEFAULT_QUERY = 'intern';
const INTERN_TITLE = /intern|internship|praktikum|werkstudent/i;
const PAGE = 100;
const MAX_JOBS = 1000; // safety bound on the newest-first crawl (first run only)

interface AmazonJob {
  title: string;
  job_path: string;
  normalized_location?: string;
  description?: string;
  description_short?: string;
  basic_qualifications?: string;
  preferred_qualifications?: string;
}

/**
 * amazon.jobs exposes a public search API that returns full descriptions +
 * qualifications inline, so there are no detail fetches. We prefilter to
 * internships via `base_query=intern` + a title check (the `is_intern` field is
 * unreliable) and to Europe via country codes. Results are sorted newest-first
 * and we page only until we reach a job already stored for this portal — so
 * incremental runs stop early instead of re-scanning the whole intern list. The
 * LLM judge then applies the software/research + education rules.
 */
export class AmazonSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const query = this.option<string>('query', DEFAULT_QUERY);
    const countries = this.option<string[]>('countries', EUROPE_ALPHA3);

    // URLs already stored for this portal — results are sorted newest-first, so
    // hitting one means every later job is already processed and we can stop.
    const seen = new Set(
      (await jobsCol().find({ portalId: this.portal._id }).project({ url: 1 }).toArray()).map(
        (d) => d.url as string,
      ),
    );

    const fresh: AmazonJob[] = [];
    let reachedSeen = false;
    for (let offset = 0; !reachedSeen && offset < MAX_JOBS; offset += PAGE) {
      const data = await this.search(query, countries, PAGE, offset);
      const page = data.jobs ?? [];
      if (page.length === 0) break;

      for (const j of page) {
        if (seen.has(this.urlOf(j))) {
          reachedSeen = true;
          break;
        }
        fresh.push(j);
      }

      if (page.length < PAGE || offset + PAGE >= (data.hits ?? 0)) break;
    }

    return fresh
      .filter((j) => INTERN_TITLE.test(j.title))
      .map((j) => ({
        title: j.title,
        url: this.urlOf(j),
        location: j.normalized_location,
        company: 'Amazon',
        // qualifications carry the education requirements, so keep them first
        description: htmlToText(
          [j.description_short, j.basic_qualifications, j.preferred_qualifications]
            .filter(Boolean)
            .join('\n\n'),
        ),
      }));
  }

  private urlOf(j: AmazonJob): string {
    return `https://www.amazon.jobs${j.job_path}`;
  }

  private async search(
    query: string,
    countries: string[],
    limit: number,
    offset: number,
  ): Promise<{ hits?: number; jobs?: AmazonJob[] }> {
    const params = new URLSearchParams();
    params.set('base_query', query);
    params.set('result_limit', String(limit));
    params.set('offset', String(offset));
    params.set('sort', 'recent');
    for (const c of countries) params.append('normalized_country_code[]', c);

    return this.fetchJson<{ hits?: number; jobs?: AmazonJob[] }>(
      `${SEARCH_URL}?${params.toString()}`,
    );
  }
}
