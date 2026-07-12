import { HttpFetcher } from '../fetchers/http.js';
import type { Portal, RawJob } from '../types.js';
import { htmlToText } from '../util/html.js';
import type { Source } from './index.js';

const SEARCH_URL = 'https://www.amazon.jobs/en/search.json';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const DEFAULT_QUERY = 'intern';
const INTERN_TITLE = /intern|internship|praktikum|werkstudent/i;
// Europe (EU/EEA/UK/CH) as ISO-3166 alpha-3, the format amazon.jobs expects.
const DEFAULT_COUNTRIES = [
  'DEU', 'GBR', 'IRL', 'FRA', 'ESP', 'ITA', 'NLD', 'LUX', 'POL', 'SWE', 'PRT',
  'AUT', 'CZE', 'ROU', 'BEL', 'FIN', 'EST', 'DNK', 'CHE', 'GRC', 'HUN', 'SVK',
  'SVN', 'LTU', 'LVA', 'HRV', 'BGR', 'NOR',
];

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
export class AmazonSource implements Source {
  private readonly http = new HttpFetcher();

  constructor(private readonly portal: Portal) {}

  async produce(): Promise<RawJob[]> {
    const opts = this.portal.sourceOptions ?? {};
    const query = (opts.query as string | undefined) ?? DEFAULT_QUERY;
    const countries = (opts.countries as string[] | undefined) ?? DEFAULT_COUNTRIES;

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

    const body = await this.http.fetch({
      url: `${SEARCH_URL}?${params.toString()}`,
      method: 'GET',
      headers: { 'user-agent': BROWSER_UA },
    });
    return JSON.parse(body);
  }
}
