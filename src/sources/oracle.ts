import { HttpFetcher } from '../fetchers/http.js';
import type { Portal, RawJob } from '../types.js';
import { htmlToText } from '../util/html.js';
import type { Source } from './index.js';

const BASE =
  'https://eeho.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions';
const JOB_URL = 'https://careers.oracle.com/en/sites/jobsearch/job';
// The internal site number behind careers.oracle.com's `jobsearch` site. Passing
// it is required — without it the REST resource 302-redirects to the SPA page.
const SITE_NUMBER = 'CX_45001';
const DEFAULT_KEYWORD = 'intern';
const PAGE_SIZE = 200;
const MAX_JOBS = 2000; // most-recent N worldwide postings scanned per cycle
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
// Europe (EU/EEA/UK/CH) as ISO-3166 alpha-2 — the form Oracle returns in
// PrimaryLocationCountry / secondaryLocations[].CountryCode.
const EUROPE = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'GB', 'CH', 'NO', 'IS', 'LI',
]);

interface OracleReq {
  Id: string;
  Title: string;
  PrimaryLocation?: string;
  PrimaryLocationCountry?: string;
  ShortDescriptionStr?: string;
  secondaryLocations?: { CountryCode?: string }[];
}
interface OracleResp {
  items?: { TotalJobsCount?: number; requisitionList?: OracleReq[] }[];
}

/**
 * Oracle's own careers site (careers.oracle.com) runs on Oracle Recruiting Cloud.
 * Its REST resource returns a `keyword=intern` search inline (title, location,
 * short description) in one paged request — no per-job detail calls. There is no
 * "Europe" facet, so we page the most-recent postings and prefilter to Europe by
 * country code (like src/sources/amazon.ts); the LLM judge then applies the
 * software/research + education rules.
 */
export class OracleSource implements Source {
  private readonly http = new HttpFetcher();

  constructor(private readonly portal: Portal) {}

  async produce(): Promise<RawJob[]> {
    const keyword =
      (this.portal.sourceOptions?.keyword as string | undefined) ?? DEFAULT_KEYWORD;

    // The first page reveals the total; fetch the remaining pages concurrently
    // (each page is ~400KB, so serial paging would take ~30s for ~1800 jobs).
    const first = await this.search(keyword, 0);
    const total = Math.min(first.total, MAX_JOBS);
    const offsets: number[] = [];
    for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) offsets.push(offset);
    const rest = await Promise.all(offsets.map((offset) => this.search(keyword, offset)));

    const raw: OracleReq[] = [first, ...rest].flatMap((page) => page.list);

    const inEurope = (j: OracleReq): boolean =>
      EUROPE.has((j.PrimaryLocationCountry ?? '').toUpperCase()) ||
      (j.secondaryLocations ?? []).some((s) => EUROPE.has((s.CountryCode ?? '').toUpperCase()));

    return raw.filter(inEurope).map(
      (j) =>
        ({
          title: j.Title,
          url: `${JOB_URL}/${j.Id}`,
          location: j.PrimaryLocation,
          description: htmlToText(j.ShortDescriptionStr),
          company: 'Oracle',
        }) satisfies RawJob,
    );
  }

  private async search(
    keyword: string,
    offset: number,
  ): Promise<{ list: OracleReq[]; total: number }> {
    const finder =
      `findReqs;siteNumber=${SITE_NUMBER},keyword=${encodeURIComponent(keyword)}` +
      `,limit=${PAGE_SIZE},offset=${offset},sortBy=POSTING_DATES_DESC`;
    const url = `${BASE}?onlyData=true&expand=requisitionList.secondaryLocations&finder=${finder}`;

    const body = await this.http.fetch({
      url,
      method: 'GET',
      headers: { 'user-agent': BROWSER_UA },
    });
    const item = (JSON.parse(body) as OracleResp).items?.[0];
    return { list: item?.requisitionList ?? [], total: item?.TotalJobsCount ?? 0 };
  }
}
