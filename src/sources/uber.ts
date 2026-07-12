import type { RawJob } from '../types.js';
import { EUROPE_ALPHA3 } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const API_URL = 'https://www.uber.com/api/loadSearchJobsResults?localeCode=en';
const JOB_URL = 'https://www.uber.com/careers/list';
const DEFAULT_QUERY = 'intern';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const INTERN_TITLE = /\bintern(ship)?\b|praktikum|werkstudent|\btrainee\b|\bgraduate\b/i;

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
 * validated (any non-empty string works). The list carries no descriptions, so we
 * pass the department (which encodes the function, e.g. "Engineer - Software
 * Engineering - Backend") to the LLM judge and prefilter to interns by title + to
 * Europe by country code.
 */
export class UberSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const query = this.option<string>('query', DEFAULT_QUERY);
    const countries = this.option<string[]>('countries', EUROPE_ALPHA3);

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
    const data = (
      await this.fetchJson<{
        data?: { results?: UberJob[] | null; totalResults?: { low?: number } };
      }>(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': 'x' },
        body: JSON.stringify({
          params: { query, location: countries.map((country) => ({ country })) },
          limit: PAGE_SIZE,
          page,
        }),
      })
    ).data;
    return { results: data?.results ?? [], total: data?.totalResults?.low ?? 0 };
  }
}
