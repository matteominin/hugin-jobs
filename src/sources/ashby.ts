import type { RawJob } from '../types.js';
import { isEuropeCountryName } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const boardUrl = (board: string): string =>
  `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`;

interface AshbyAddress {
  postalAddress?: {
    addressCountry?: string;
    addressRegion?: string;
    addressLocality?: string;
  };
}

export interface AshbyJob {
  title: string;
  jobUrl: string;
  location?: string;
  secondaryLocations?: { location?: string; address?: AshbyAddress }[];
  address?: AshbyAddress;
  department?: string;
  team?: string;
  employmentType?: string;
  isListed?: boolean;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensation?: unknown;
}

/**
 * Shared base for posters on an Ashby job board (`snowflake`, `openai`). The
 * public posting API returns the whole board with descriptions inline, so a
 * portal is one request; subclasses only decide which jobs to keep.
 *
 * Note `employmentType` is not trustworthy for prefiltering — Snowflake tags
 * "Software Engineer Intern - Berlin (2026)" as `FullTime` — so subclasses match
 * on the title instead.
 */
export abstract class AshbySource extends BaseSource {
  /** Ashby board slug, overridable per portal via `sourceOptions.board`. */
  protected abstract readonly defaultBoard: string;
  /** Fallback company when the listing doesn't carry one. */
  protected abstract readonly companyName: string;

  /** Cheap prefilter: true to send this job to the LLM judge. */
  protected abstract keep(job: AshbyJob): boolean;

  async produce(): Promise<RawJob[]> {
    const board = this.option<string>('board', this.defaultBoard);
    const { jobs = [] } = await this.fetchJson<{ jobs?: AshbyJob[] }>(boardUrl(board));

    return jobs
      .filter((job) => job.isListed !== false)
      .filter((job) => this.keep(job))
      .map(
        (job) =>
          ({
            title: job.title,
            url: job.jobUrl,
            location: this.locations(job).join(' / ') || undefined,
            description: htmlToText(job.descriptionHtml ?? job.descriptionPlain),
            company: this.companyName,
          }) satisfies RawJob,
      );
  }

  /** Primary plus secondary location labels, e.g. ["CH-Zurich-Observe"]. */
  protected locations(job: AshbyJob): string[] {
    return [job.location, ...(job.secondaryLocations ?? []).map((s) => s.location)].filter(
      (l): l is string => Boolean(l),
    );
  }

  /**
   * True when any listed location is in Europe. Ashby gives a spelled-out
   * country per location, so this is exact — but a job with no country at all
   * is kept and left to the LLM rather than dropped silently.
   */
  protected inEurope(job: AshbyJob): boolean {
    const countries = [job.address, ...(job.secondaryLocations ?? []).map((s) => s.address)]
      .map((a) => a?.postalAddress?.addressCountry)
      .filter((c): c is string => Boolean(c));
    if (countries.length === 0) return true;
    return countries.some(isEuropeCountryName);
  }
}
