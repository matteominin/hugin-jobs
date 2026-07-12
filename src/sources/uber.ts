import { HttpFetcher } from '../fetchers/http.js';
import type { Portal, RawJob } from '../types.js';
import { htmlToText } from '../util/html.js';
import type { Source } from './index.js';

const API_URL = 'https://www.uber.com/api/loadSearchJobsResults?localeCode=en';
const JOB_URL = 'https://www.uber.com/careers/list';
const DEFAULT_QUERY = 'intern';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const INTERN_TITLE = /\bintern(ship)?\b|praktikum|werkstudent|\btrainee\b|\bgraduate\b/i;
// Europe (EU/EEA/UK/CH) as ISO-3166 alpha-3 — the form Uber's API expects.
const DEFAULT_COUNTRIES = [
  'DEU', 'GBR', 'IRL', 'FRA', 'ESP', 'ITA', 'NLD', 'LUX', 'POL', 'SWE', 'PRT',
  'AUT', 'CZE', 'ROU', 'BEL', 'FIN', 'EST', 'DNK', 'CHE', 'GRC', 'HUN', 'SVK',
  'SVN', 'LTU', 'LVA', 'HRV', 'BGR', 'NOR',
];

interface UberJob {
  id: number | string;
  title: string;
  description?: string;
  department?: string;
  location?: { city?: string; countryName?: string };
}

/**
 * Uber's careers API is a POST search that returns paged results filtered by
 * country. The endpoint needs an `x-csrf-token` header, but the value isn't
 * validated (any non-empty string works), so the plain HttpFetcher is enough. The
 * list carries no descriptions, so we pass the department (which encodes the
 * function, e.g. "Engineer - Software Engineering - Backend") to the LLM judge and
 * prefilter to interns by title + to Europe by country code (like amazon.ts).
 */
export class UberSource implements Source {
  private readonly http = new HttpFetcher();

  constructor(private readonly portal: Portal) {}

  async produce(): Promise<RawJob[]> {
    const opts = this.portal.sourceOptions ?? {};
    const query = (opts.query as string | undefined) ?? DEFAULT_QUERY;
    const countries = (opts.countries as string[] | undefined) ?? DEFAULT_COUNTRIES;

    const raw: UberJob[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { results, total } = await this.search(query, countries, page);
      raw.push(...results);
      if (results.length < PAGE_SIZE || (page + 1) * PAGE_SIZE >= total) break;
    }

    return raw
      .filter((j) => INTERN_TITLE.test(j.title))
      .map(
        (j) =>
          ({
            title: htmlToText(j.title) ?? j.title,
            url: `${JOB_URL}/${j.id}/`,
            location:
              [j.location?.city, j.location?.countryName].filter(Boolean).join(', ') || undefined,
            description: htmlToText([j.department, j.description].filter(Boolean).join('. ')),
            company: 'Uber',
          }) satisfies RawJob,
      );
  }

  private async search(
    query: string,
    countries: string[],
    page: number,
  ): Promise<{ results: UberJob[]; total: number }> {
    const body = await this.http.fetch({
      url: API_URL,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'x' },
      body: JSON.stringify({
        params: { query, location: countries.map((country) => ({ country })) },
        limit: PAGE_SIZE,
        page,
      }),
    });
    const data = (
      JSON.parse(body) as {
        data?: { results?: UberJob[] | null; totalResults?: { low?: number } };
      }
    ).data;
    return { results: data?.results ?? [], total: data?.totalResults?.low ?? 0 };
  }
}
