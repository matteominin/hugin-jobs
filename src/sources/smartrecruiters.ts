import type { RawJob } from '../types.js';
import { isEuropeAlpha2 } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const PAGE_SIZE = 100; // SmartRecruiters caps `limit` at 100.

const listUrl = (company: string, offset: number): string =>
  `https://api.smartrecruiters.com/v1/companies/${company}/postings?limit=${PAGE_SIZE}&offset=${offset}`;

const detailUrl = (company: string, id: string): string =>
  `https://api.smartrecruiters.com/v1/companies/${company}/postings/${id}`;

export interface SmartRecruitersPosting {
  id: string;
  name: string;
  refNumber?: string;
  company?: { name?: string; identifier?: string };
  location?: {
    city?: string;
    region?: string;
    country?: string; // ISO alpha-2, lowercase (e.g. "ee")
    remote?: boolean;
    fullLocation?: string;
  };
  function?: { label?: string };
  department?: { label?: string };
  experienceLevel?: { id?: string; label?: string };
  typeOfEmployment?: { id?: string; label?: string };
}

interface SmartRecruitersDetail {
  postingUrl?: string;
  applyUrl?: string;
  jobAd?: { sections?: Record<string, { text?: string } | undefined> };
}

/**
 * Shared base for posters on SmartRecruiters (`wise`, `boschgroup`). The public
 * postings API returns the whole board paged at 100/request but **without**
 * descriptions, so this sweeps every page once, prefilters in `keep()`, and
 * fetches the detail (description + public URL) only for the jobs it keeps —
 * a job we discard never costs a detail request.
 *
 * `location.country` is a lowercase ISO alpha-2, so Europe filtering is exact;
 * a posting with no country is kept and left to the LLM rather than dropped.
 */
export abstract class SmartRecruitersSource extends BaseSource {
  /** SmartRecruiters company identifier, overridable via `sourceOptions.company`. */
  protected abstract readonly defaultCompany: string;
  /** Fallback company name when a posting doesn't carry one. */
  protected abstract readonly companyName: string;

  /** Cheap prefilter over the list posting: true to keep this job. */
  protected abstract keep(job: SmartRecruitersPosting): boolean;

  async produce(): Promise<RawJob[]> {
    const company = this.option<string>('company', this.defaultCompany);
    // Headroom over the real page count so a growing board never truncates
    // silently — the sweep exits when a short page arrives, so this is free.
    const maxPages = this.option<number>('maxPages', 80);

    const postings: SmartRecruitersPosting[] = [];
    for (let page = 0; page < maxPages; page++) {
      const { content = [] } = await this.fetchJson<{ content?: SmartRecruitersPosting[] }>(
        listUrl(company, page * PAGE_SIZE),
      );
      postings.push(...content);
      if (content.length < PAGE_SIZE) break;
    }

    const kept = postings.filter((job) => this.keep(job));

    // The list carries no description, so a full body needs a detail request per
    // kept job. On huge boards (Bosch keeps ~80) that per-job cost dominates, so
    // `fetchDescriptions: false` skips it and judges on the list fields the title
    // already spells out (Bosch titles name the field, level and location).
    const withDescriptions = this.option<boolean>('fetchDescriptions', true);

    const jobs: RawJob[] = [];
    for (const job of kept) {
      const detail = withDescriptions ? await this.fetchDetail(company, job.id) : undefined;
      const body = detail ? htmlToText(this.descriptionText(detail)) : this.listSummary(job);
      jobs.push({
        title: job.name,
        url: detail?.postingUrl ?? detail?.applyUrl ?? `https://jobs.smartrecruiters.com/${company}/${job.id}`,
        location: job.location?.fullLocation ?? job.location?.city,
        description: body || undefined,
        company: job.company?.name ?? this.companyName,
      });
    }
    return jobs;
  }

  /** A description built from the list fields, for when detail fetch is off. */
  private listSummary(job: SmartRecruitersPosting): string {
    return [
      ['Function', job.function?.label],
      ['Department', job.department?.label],
      ['Level', job.experienceLevel?.label],
      ['Employment', job.typeOfEmployment?.label],
      ['Location', job.location?.fullLocation],
    ]
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  }

  /**
   * True when the posting's country is European, or unknown (left to the LLM).
   * Subclasses call this from `keep()`.
   */
  protected inEurope(job: SmartRecruitersPosting): boolean {
    const country = job.location?.country;
    if (!country) return true;
    return isEuropeAlpha2(country);
  }

  private async fetchDetail(company: string, id: string): Promise<SmartRecruitersDetail | undefined> {
    try {
      return await this.fetchJson<SmartRecruitersDetail>(detailUrl(company, id));
    } catch {
      // A single missing/failed detail shouldn't drop the job — judge on title.
      return undefined;
    }
  }

  private descriptionText(detail: SmartRecruitersDetail | undefined): string {
    const sections = detail?.jobAd?.sections;
    if (!sections) return '';
    return Object.values(sections)
      .map((s) => s?.text ?? '')
      .filter(Boolean)
      .join('\n\n');
  }
}
