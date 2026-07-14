import type { RawJob } from '../types.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const BASE = 'https://nvidia.wd5.myworkdayjobs.com';
const SITE = 'NVIDIAExternalCareerSite';
const SEARCH_URL = `${BASE}/wday/cxs/nvidia/${SITE}/jobs`;
const PUBLIC_BASE = `${BASE}/en-US/${SITE}`;
const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_QUERIES = [
  '',
  'intern',
  'internship',
  'software intern',
  'research intern',
  'machine learning intern',
  'new college graduate',
  'new grad',
  'graduate software',
  'working student',
  'student software',
];

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

const TARGET_LEVEL =
  /\b(intern(ship)?|new college graduate|new grad|graduate|university graduate|working student|student)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|systems?|engineer|engineering|research|machine learning|deep learning|ml\b|ai\b|artificial intelligence|computer vision|formal verification|verification|cuda|gpu|compiler|firmware|embedded|hardware|silicon|soc|vlsi|fpga|architecture|robotics|autonomous|algorithm|data|security|networking|performance|simulation)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|manager|director|architect|solutions architect|sales|marketing|business development|product manager|program manager|operations|legal|finance|recruit(?:er|ing)|human resources|hr\b|facilities|administration|customer|technical account manager|designer|design)\b/i;
const EXCLUDED_TEXT =
  /\b(post-?doctoral|postdoc|phd required|required.*phd|must.*phd)\b/i;

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
  postedOn?: string;
  bulletFields?: string[];
}

interface WorkdaySearchResponse {
  total?: number;
  jobPostings?: WorkdayPosting[];
  facets?: WorkdayFacet[];
}

interface WorkdayCountry {
  descriptor?: string;
}

interface WorkdayJobInfo {
  title: string;
  jobDescription?: string;
  location?: string;
  country?: WorkdayCountry;
  jobReqId?: string;
  timeType?: string;
  externalUrl?: string;
}

interface WorkdayDetailResponse {
  jobPostingInfo?: WorkdayJobInfo;
}

interface SearchBody {
  appliedFacets: Record<string, string[]>;
  limit: number;
  offset: number;
  searchText: string;
}

/**
 * NVIDIA uses Workday's public CXS JSON endpoints. The source discovers the
 * current Workday facet IDs at runtime, filters to Europe countries, then scans
 * student-level search terms and Workday's Intern/New College Graduate subtype.
 */
export class NvidiaSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const limit = this.option<number>('limit', DEFAULT_LIMIT);
    const maxPages = this.option<number>('maxPages', DEFAULT_MAX_PAGES);
    const queries = this.option<string[]>('queries', DEFAULT_QUERIES);

    const facets = await this.loadFacets();
    const europeIds = this.facetIds(facets, 'locationHierarchy1', EUROPE_COUNTRIES);
    const studentWorkerIds = this.facetIdsMatching(facets, 'workerSubType', /intern|new college graduate/i);
    const technicalFamilyIds = this.facetIdsMatching(
      facets,
      'jobFamilyGroup',
      /engineering|research|it|univ employment/i,
    );

    const postings = new Map<string, WorkdayPosting>();

    if (europeIds.length > 0 && studentWorkerIds.length > 0) {
      await this.collectPostings(
        postings,
        { locationHierarchy1: europeIds, workerSubType: studentWorkerIds },
        '',
        limit,
        maxPages,
      );
    }

    for (const query of queries) {
      const appliedFacets: Record<string, string[]> = {};
      if (europeIds.length > 0) appliedFacets.locationHierarchy1 = europeIds;
      if (technicalFamilyIds.length > 0) appliedFacets.jobFamilyGroup = technicalFamilyIds;
      await this.collectPostings(postings, appliedFacets, query, limit, maxPages);
    }

    const rawJobs: RawJob[] = [];
    for (const posting of postings.values()) {
      if (!this.keepListPosting(posting)) continue;

      const detail = await this.detail(posting.externalPath).catch(() => undefined);
      const info = detail?.jobPostingInfo;
      const text = [posting.title, info?.jobDescription].filter(Boolean).join('\n\n');
      if (!this.keepDetail(posting, info, text)) continue;

      rawJobs.push({
        title: info?.title ?? posting.title,
        url: `${PUBLIC_BASE}${posting.externalPath}`,
        location: info?.location ?? posting.locationsText,
        description: htmlToText(
          [
            info?.jobDescription,
            info?.jobReqId ?? posting.bulletFields?.join(', '),
            info?.timeType,
            info?.country?.descriptor,
          ]
            .filter(Boolean)
            .join('\n\n'),
        ),
        company: 'NVIDIA',
      });
    }

    return rawJobs;
  }

  private async loadFacets(): Promise<WorkdayFacet[]> {
    const response = await this.search({ appliedFacets: {}, limit: 1, offset: 0, searchText: '' });
    return response.facets ?? [];
  }

  private async collectPostings(
    postings: Map<string, WorkdayPosting>,
    appliedFacets: Record<string, string[]>,
    searchText: string,
    limit: number,
    maxPages: number,
  ): Promise<void> {
    for (let page = 0; page < maxPages; page++) {
      const offset = page * limit;
      const response = await this.search({ appliedFacets, limit, offset, searchText });
      const pagePostings = response.jobPostings ?? [];
      if (pagePostings.length === 0) break;

      for (const posting of pagePostings) {
        postings.set(posting.externalPath, posting);
      }

      if (offset + pagePostings.length >= (response.total ?? 0)) break;
    }
  }

  private async search(body: SearchBody): Promise<WorkdaySearchResponse> {
    return this.fetchJson<WorkdaySearchResponse>(SEARCH_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: BASE,
        referer: `${BASE}/${SITE}`,
      },
      body: JSON.stringify(body),
    });
  }

  private async detail(externalPath: string): Promise<WorkdayDetailResponse> {
    return this.fetchJson<WorkdayDetailResponse>(`${BASE}/wday/cxs/nvidia/${SITE}${externalPath}`, {
      headers: { accept: 'application/json', referer: `${PUBLIC_BASE}${externalPath}` },
    });
  }

  private keepListPosting(posting: WorkdayPosting): boolean {
    if (!TARGET_LEVEL.test(posting.title)) return false;
    if (EXCLUDED_TITLE.test(posting.title)) return false;
    return true;
  }

  private keepDetail(
    posting: WorkdayPosting,
    info: WorkdayJobInfo | undefined,
    text: string,
  ): boolean {
    if (!this.inEurope(posting, info)) return false;
    if (!TARGET_LEVEL.test(text)) return false;
    if (!TECHNICAL_SIGNAL.test(text)) return false;
    if (EXCLUDED_TITLE.test(info?.title ?? posting.title)) return false;
    if (EXCLUDED_TEXT.test(text)) return false;
    return true;
  }

  private inEurope(posting: WorkdayPosting, info: WorkdayJobInfo | undefined): boolean {
    const country = info?.country?.descriptor;
    if (country && EUROPE_COUNTRIES.has(country)) return true;
    const location = [info?.location, posting.locationsText].filter(Boolean).join(' ');
    return Array.from(EUROPE_COUNTRIES).some((name) => location.includes(name));
  }

  private facetIds(facets: WorkdayFacet[], facetParameter: string, descriptors: Set<string>): string[] {
    return this.findFacetValues(facets, facetParameter)
      .filter((value) => descriptors.has(value.descriptor))
      .map((value) => value.id);
  }

  private facetIdsMatching(facets: WorkdayFacet[], facetParameter: string, pattern: RegExp): string[] {
    return this.findFacetValues(facets, facetParameter)
      .filter((value) => pattern.test(value.descriptor))
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
