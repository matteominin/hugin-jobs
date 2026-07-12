import type { RawJob } from '../types.js';
import { BaseSource } from './base.js';

const SEARCH_URL = 'https://api.lifeatspotify.com/wp-json/animal/v1/job/search';
const JOB_URL = 'https://www.lifeatspotify.com/jobs';
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
 * required — an Akamai WAF blocks the default one, which BaseSource sends) and keep
 * intern-titled roles. The search response carries no descriptions and no region
 * filter, so we hand the LLM judge the title + location and let it apply the rules.
 */
export class SpotifySource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const categories = this.option<string[]>('categories', DEFAULT_CATEGORIES);

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
    const { result = [] } = await this.fetchJson<{ result?: SpotifyJob[] }>(
      `${SEARCH_URL}?c=${encodeURIComponent(category)}`,
    );
    return result;
  }
}
