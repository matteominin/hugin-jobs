import type { RawJob } from '../types.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const BASE = 'https://adobe.wd5.myworkdayjobs.com';
const TENANT = 'adobe';
/**
 * Adobe posts to two Workday sites: the main external one (which carries the
 * few year-round intern/working-student roles) and a university site that is
 * empty outside intern season. Sweeping both costs one facet probe each.
 */
const DEFAULT_SITES = ['external_experienced', 'external_university'];
/** Workday's CXS page size. 20 is its hard cap — a larger limit is a 400. */
const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_PAGES = 5;

const EUROPE_COUNTRIES = new Set([
  'Austria',
  'Belgium',
  'Bulgaria',
  'Croatia',
  'Cyprus',
  'Czechia',
  'Denmark',
  'Estonia',
  'Finland',
  'France',
  'Germany',
  'Greece',
  'Hungary',
  'Iceland',
  'Ireland',
  'Italy',
  'Latvia',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Malta',
  'Netherlands',
  'Norway',
  'Poland',
  'Portugal',
  'Romania',
  'Slovakia',
  'Slovenia',
  'Spain',
  'Sweden',
  'Switzerland',
  'United Kingdom',
]);

const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|staff|principal|lead|manager|director|sales|marketing|business development|operations|legal|finance|recruit(?:er|ing)|human resources|hr\b|designer|design)\b/i;
const EXCLUDED_TEXT = /\b(post-?doctoral|postdoc|phd required|required.*phd|must.*phd)\b/i;

interface WorkdayFacetValue {
  descriptor: string;
  id: string;
  values?: WorkdayFacetValue[];
  facetParameter?: string;
}

interface WorkdayFacet {
  facetParameter: string;
  descriptor?: string;
  values?: WorkdayFacetValue[];
}

interface WorkdayPosting {
  title: string;
  externalPath: string;
  locationsText?: string;
}

interface WorkdaySearchResponse {
  total?: number;
  jobPostings?: WorkdayPosting[];
  facets?: WorkdayFacet[];
}

interface WorkdayJobInfo {
  title: string;
  jobDescription?: string;
  location?: string;
  country?: { descriptor?: string };
  jobReqId?: string;
  timeType?: string;
}

interface WorkdayDetailResponse {
  jobPostingInfo?: WorkdayJobInfo;
}

/**
 * Adobe uses Workday's public CXS JSON endpoints. Like NVIDIA, the source
 * discovers the current facet IDs at runtime and pages one search per site
 * crossing the European countries (facet `locationCountry`) with Workday's
 * Intern worker subtype — Adobe tags its intern/working-student postings
 * consistently (the Intern subtype and the University job family are the same
 * set), so no free-text queries are needed. The trade-off is that a role Adobe
 * mis-tags as Regular won't be seen.
 */
export class AdobeSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const sites = this.option<string[]>('sites', DEFAULT_SITES);
    const limit = this.option<number>('limit', DEFAULT_LIMIT);
    const maxPages = this.option<number>('maxPages', DEFAULT_MAX_PAGES);

    const rawJobs: RawJob[] = [];
    for (const site of sites) {
      rawJobs.push(...(await this.produceSite(site, limit, maxPages)));
    }
    return rawJobs;
  }

  private async produceSite(site: string, limit: number, maxPages: number): Promise<RawJob[]> {
    const probe = await this.search(site, { appliedFacets: {}, limit: 1, offset: 0, searchText: '' });
    if ((probe.total ?? 0) === 0) return [];

    const facets = probe.facets ?? [];
    const europeIds = this.facetIds(facets, 'locationCountry', (d) => EUROPE_COUNTRIES.has(d));
    const internIds = this.facetIds(facets, 'workerSubType', (d) => /intern/i.test(d));
    if (europeIds.length === 0 || internIds.length === 0) return [];

    const postings = new Map<string, WorkdayPosting>();
    for (let page = 0; page < maxPages; page++) {
      const offset = page * limit;
      const response = await this.search(site, {
        appliedFacets: { locationCountry: europeIds, workerSubType: internIds },
        limit,
        offset,
        searchText: '',
      });
      const pagePostings = response.jobPostings ?? [];
      if (pagePostings.length === 0) break;
      for (const posting of pagePostings) postings.set(posting.externalPath, posting);
      if (offset + pagePostings.length >= (response.total ?? 0)) break;
    }

    const rawJobs: RawJob[] = [];
    for (const posting of postings.values()) {
      if (EXCLUDED_TITLE.test(posting.title)) continue;

      const detail = await this.detail(site, posting.externalPath).catch(() => undefined);
      const info = detail?.jobPostingInfo;
      const text = [posting.title, info?.jobDescription].filter(Boolean).join('\n\n');
      if (EXCLUDED_TEXT.test(text)) continue;

      rawJobs.push({
        title: info?.title ?? posting.title,
        url: `${BASE}/en-US/${site}${posting.externalPath}`,
        location: info?.location ?? posting.locationsText,
        description: htmlToText(
          [info?.jobDescription, info?.jobReqId, info?.timeType, info?.country?.descriptor]
            .filter(Boolean)
            .join('\n\n'),
        ),
        company: 'Adobe',
      });
    }
    return rawJobs;
  }

  private async search(
    site: string,
    body: { appliedFacets: Record<string, string[]>; limit: number; offset: number; searchText: string },
  ): Promise<WorkdaySearchResponse> {
    return this.fetchJson<WorkdaySearchResponse>(`${BASE}/wday/cxs/${TENANT}/${site}/jobs`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: BASE,
        referer: `${BASE}/${site}`,
      },
      body: JSON.stringify(body),
    });
  }

  private async detail(site: string, externalPath: string): Promise<WorkdayDetailResponse> {
    return this.fetchJson<WorkdayDetailResponse>(`${BASE}/wday/cxs/${TENANT}/${site}${externalPath}`, {
      headers: { accept: 'application/json', referer: `${BASE}/en-US/${site}${externalPath}` },
    });
  }

  /** Facet values live either at the top level or nested (locationMainGroup > locationCountry). */
  private facetIds(
    facets: WorkdayFacet[],
    facetParameter: string,
    match: (descriptor: string) => boolean,
  ): string[] {
    return this.findFacetValues(facets, facetParameter)
      .filter((value) => match(value.descriptor))
      .map((value) => value.id);
  }

  private findFacetValues(facets: WorkdayFacet[], facetParameter: string): WorkdayFacetValue[] {
    const direct = facets.find((facet) => facet.facetParameter === facetParameter);
    if (direct?.values) return direct.values;

    for (const facet of facets) {
      for (const value of facet.values ?? []) {
        if (value.facetParameter === facetParameter && value.values) return value.values;
      }
    }

    return [];
  }
}
