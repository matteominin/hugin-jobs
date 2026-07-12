import { HttpFetcher } from '../fetchers/http.js';
import type { Portal, RawJob } from '../types.js';
import { htmlToText } from '../util/html.js';
import type { Source } from './index.js';

const LIST_URL = 'https://bolt.eu/en/careers/positions/';
const BASE = 'https://bolt.eu';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const INTERN_TITLE = /\bintern(ship)?\b|\btrainee\b|\bgraduate\b|working.?student|\bthesis\b|\bpraktik/i;
// Europe (EU/EEA/UK/CH) as ISO-3166 alpha-2 — Bolt also hires in Africa, so we
// keep only roles with at least one European location.
const EUROPE = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'GB', 'CH', 'NO', 'IS', 'LI',
]);
// Each position is embedded in the page's Next.js RSC payload as escaped JSON.
// Capture: 1 roleTitle, 2 parentTeamTitle, 3 locations[], 4 description, 5 href.
const POSITION_RE =
  /"header":\{"roleTitle":"((?:[^"\\]|\\.)*)","parentTeamTitle":"((?:[^"\\]|\\.)*)","locations":(\[[^\]]*\])\},"body":\{"description":"((?:[^"\\]|\\.)*)"[\s\S]*?"applyLinkProps":\{[^}]*?"href":"((?:[^"\\]|\\.)*)"/g;

interface BoltLocation {
  city?: string;
  country?: string;
  countryCode?: string;
}

/**
 * Bolt (bolt.eu) runs a custom Next.js careers site with no third-party ATS API —
 * the full list of roles is embedded in the page's RSC payload as escaped JSON. We
 * fetch the page once and regex out each position (title, team, locations, apply
 * link), then prefilter to intern-titled roles in Europe. Descriptions in the list
 * are a generic teaser, so we pass the team to the LLM judge for the role signal.
 * Best-effort scraper: the RSC shape can change, in which case the regex yields
 * nothing rather than throwing.
 */
export class BoltSource implements Source {
  private readonly http = new HttpFetcher();

  constructor(private readonly portal: Portal) {}

  async produce(): Promise<RawJob[]> {
    const html = (
      await this.http.fetch({
        url: LIST_URL,
        method: 'GET',
        headers: { 'user-agent': BROWSER_UA },
      })
    )
      // collapse the RSC string escaping to real JSON punctuation
      .replace(/\\u0026/g, '&')
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/');

    const jobs: RawJob[] = [];
    for (const m of html.matchAll(POSITION_RE)) {
      const [, title, team, locationsJson, description, href] = m;
      if (!INTERN_TITLE.test(title)) continue;

      let locations: BoltLocation[] = [];
      try {
        locations = JSON.parse(locationsJson) as BoltLocation[];
      } catch {
        /* keep the role even if the location blob is malformed */
      }
      if (
        locations.length &&
        !locations.some((l) => EUROPE.has((l.countryCode ?? '').toUpperCase()))
      ) {
        continue;
      }

      jobs.push({
        title,
        url: href.startsWith('http') ? href : `${BASE}${href}`,
        location:
          locations
            .map((l) => [l.city, l.country].filter(Boolean).join(', '))
            .filter(Boolean)
            .join(' / ') || undefined,
        description: htmlToText(`Team: ${team}. ${description}`),
        company: 'Bolt',
      });
    }
    return jobs;
  }
}
