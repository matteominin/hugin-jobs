import { HttpFetcher } from '../fetchers/http.js';
import type { Portal, RawJob } from '../types.js';
import type { Source } from './index.js';

const SEARCH_URL = 'https://api.lifeatspotify.com/wp-json/animal/v1/job/search';
const JOB_URL = 'https://www.lifeatspotify.com/jobs';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const DEFAULT_CATEGORIES = ['engineering'];
const INTERN_TITLE = /\bintern(ship)?\b|\btrainee\b|\bthesis\b|\bpraktik/i;

interface SpotifyJob {
  id: string;
  text: string;
  locations?: { location?: string; slug?: string }[];
}

/**
 * Spotify's careers site (lifeatspotify.com) exposes a WordPress search API that
 * lists jobs by category. We fetch the engineering category once (a browser UA is
 * required — an Akamai WAF blocks the default one) and keep intern-titled roles.
 * The search response carries no descriptions and no region filter, so we hand the
 * LLM judge the title + location and let it apply the Europe + role rules.
 */
export class SpotifySource implements Source {
  private readonly http = new HttpFetcher();

  constructor(private readonly portal: Portal) {}

  async produce(): Promise<RawJob[]> {
    const categories =
      (this.portal.sourceOptions?.categories as string[] | undefined) ?? DEFAULT_CATEGORIES;

    // dedupe by id — a role can appear under more than one category
    const jobs = new Map<string, RawJob>();
    for (const category of categories) {
      for (const j of await this.searchCategory(category)) {
        if (!INTERN_TITLE.test(j.text)) continue;
        jobs.set(j.id, {
          title: j.text,
          url: `${JOB_URL}/${j.id}`,
          location:
            (j.locations ?? [])
              .map((l) => l.location)
              .filter(Boolean)
              .join(', ') || undefined,
          company: 'Spotify',
        });
      }
    }
    return [...jobs.values()];
  }

  private async searchCategory(category: string): Promise<SpotifyJob[]> {
    const body = await this.http.fetch({
      url: `${SEARCH_URL}?c=${encodeURIComponent(category)}`,
      method: 'GET',
      headers: { 'user-agent': BROWSER_UA },
    });
    return (JSON.parse(body) as { result?: SpotifyJob[] }).result ?? [];
  }
}
