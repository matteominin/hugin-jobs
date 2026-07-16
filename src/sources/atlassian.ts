import type { RawJob } from '../types.js';
import { isEuropeLocationText } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const DEFAULT_ENDPOINT = 'https://www.atlassian.com/endpoint/careers/listings';

const TARGET_TITLE =
  /\b(intern|internship|working student|werkstudent|new grad(uate)?|graduate|student|campus|early career)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data|analytics|backend|frontend|fullstack|full stack|platform|infrastructure|security|cloud|systems?|sre|site reliability)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account executive|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations|apprentice(ship)?)\b/i;
/** Categories that are clearly technical even if the title regex misses. */
const TECHNICAL_CATEGORY = /\b(engineering|analytics|data science)\b/i;

interface AtlassianListing {
  id: number;
  title: string;
  /** Free-text location strings, e.g. "London - United Kingdom -   London,  EC1V United Kingdom". */
  locations?: string[];
  /** e.g. "Engineering", "Analytics & Data Science", "Sales". */
  category?: string;
  overview?: string;
  responsibilities?: string;
  qualifications?: string;
}

/**
 * Atlassian hosts jobs on regional iCIMS portals, but its own careers site
 * aggregates all of them behind one public endpoint that returns the whole
 * board with descriptions inline — one request per cycle, no paging (query
 * params are ignored; the full list always comes back). Locations are free
 * text, so Europe is the best-effort `isEuropeLocationText` check across all
 * of a posting's locations; interns are hired seasonally (mostly Aug–Sep
 * openings), so 0 jobs much of the year is the normal steady state.
 */
export class AtlassianSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const endpoint = this.option<string>('endpoint', DEFAULT_ENDPOINT);
    const listings = await this.fetchJson<AtlassianListing[]>(endpoint);

    return listings
      .filter((listing) => this.keep(listing))
      .map(
        (listing) =>
          ({
            title: listing.title,
            url: `https://www.atlassian.com/company/careers/details/${listing.id}`,
            location: this.locationText(listing),
            description: htmlToText(
              [listing.overview, listing.responsibilities, listing.qualifications]
                .filter(Boolean)
                .join('\n\n'),
            ),
            company: 'Atlassian',
          }) satisfies RawJob,
      );
  }

  private keep(listing: AtlassianListing): boolean {
    if (!TARGET_TITLE.test(listing.title)) return false;
    const technical =
      TECHNICAL_SIGNAL.test(listing.title) || TECHNICAL_CATEGORY.test(listing.category ?? '');
    if (!technical) return false;
    if (EXCLUDED_TITLE.test(listing.title)) return false;
    return this.inEurope(listing);
  }

  /** Keep if any location reads as Europe; no locations at all goes to the LLM. */
  private inEurope(listing: AtlassianListing): boolean {
    const locations = listing.locations ?? [];
    if (locations.length === 0) return true;
    return locations.some((location) => isEuropeLocationText(location));
  }

  private locationText(listing: AtlassianListing): string | undefined {
    const text = (listing.locations ?? [])
      .map((location) => location.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' / ');
    return text || undefined;
  }
}
