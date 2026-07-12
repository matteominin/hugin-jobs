import type { RawJob } from '../types.js';
import { EUROPE_ALPHA3 } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const SEARCH_URL = 'https://www.amazon.jobs/en/search.json';
const DEFAULT_QUERY = 'intern';
const INTERN_TITLE = /intern|internship|praktikum|werkstudent/i;

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
 * qualifications inline, so the whole portal is a single (paged) request — no
 * detail fetches. We prefilter to internships via `base_query=intern` + a title
 * check (the `is_intern` field is unreliable) and to Europe via country codes.
 * The LLM judge then applies the software/research + education rules.
 */
export class AmazonSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const query = this.option<string>('query', DEFAULT_QUERY);
    const countries = this.option<string[]>('countries', EUROPE_ALPHA3);

    const limit = 100;
    const raw: AmazonJob[] = [];
    for (let offset = 0; offset < 1000; offset += limit) {
      const data = await this.search(query, countries, limit, offset);
      const page = data.jobs ?? [];
      raw.push(...page);
      if (page.length < limit || offset + limit >= (data.hits ?? 0)) break;
    }

    return raw
      .filter((j) => INTERN_TITLE.test(j.title))
      .map((j) => ({
        title: j.title,
        url: `https://www.amazon.jobs${j.job_path}`,
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
    for (const c of countries) params.append('normalized_country_code[]', c);

    return this.fetchJson<{ hits?: number; jobs?: AmazonJob[] }>(
      `${SEARCH_URL}?${params.toString()}`,
    );
  }
}
