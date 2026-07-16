import type { RawJob } from '../types.js';
import { isEuropeAlpha2 } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const DEFAULT_HOST = 'https://www.github.careers';
const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_PAGES = 5;

const TARGET_TITLE =
  /\b(intern|internship|working student|werkstudent|new grad(uate)?|graduate|student|campus|early career)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?|cloud|devops|sre|copilot|product)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|vp|sales|account executive|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|talent|operations)\b/i;

interface GitHubCareersJob {
  slug: string;
  language?: string;
  title: string;
  /** HTML body of the posting. */
  description?: string;
  qualifications?: string;
  responsibilities?: string;
  location_name?: string;
  /** ISO-3166 alpha-2, e.g. "GB". */
  country_code?: string;
  tags4?: string[];
}

interface GitHubCareersPage {
  jobs: Array<{ data: GitHubCareersJob }>;
  totalCount: number;
}

/**
 * GitHub hosts its jobs on github.careers, an iCIMS/Jibe careers site whose
 * `/api/jobs` endpoint returns the whole board with descriptions inline —
 * `limit=100` covers today's ~78 postings in one request, and the page loop
 * only continues if the board ever outgrows that. Each posting carries a real
 * alpha-2 `country_code`, so Europe is an exact filter. The board is almost
 * entirely senior full-time roles (intern postings are rare and seasonal), so
 * the title filter is what keeps the steady state at 0 without LLM cost.
 */
export class GitHubSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const host = this.option<string>('host', DEFAULT_HOST);
    const limit = this.option<number>('limit', DEFAULT_LIMIT);
    const maxPages = this.option<number>('maxPages', DEFAULT_MAX_PAGES);

    // Dedupe by slug in case a posting ever appears on two pages mid-pagination.
    const kept = new Map<string, RawJob>();
    for (let page = 1, seen = 0, total = Infinity; page <= maxPages && seen < total; page++) {
      const res = await this.fetchJson<GitHubCareersPage>(
        `${host}/api/jobs?page=${page}&limit=${limit}`,
      );
      total = res.totalCount;
      seen += res.jobs.length;
      if (res.jobs.length === 0) break;

      for (const { data: job } of res.jobs) {
        if (!this.keep(job) || kept.has(job.slug)) continue;
        kept.set(job.slug, {
          title: job.title,
          url: `${host}/careers-home/jobs/${job.slug}`,
          location: job.location_name,
          description: htmlToText(
            [job.description, job.responsibilities, job.qualifications].filter(Boolean).join('\n\n'),
          ),
          company: 'GitHub',
        });
      }
    }
    return [...kept.values()];
  }

  private keep(job: GitHubCareersJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    // Unknown country is kept and left to the LLM to judge.
    if (!job.country_code) return true;
    return isEuropeAlpha2(job.country_code);
  }
}
