import type { RawJob } from '../types.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const DEFAULT_BOARD = 'stripe';
const boardUrl = (board: string): string =>
  `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
const INTERN_TITLE = /\bintern(ship)?\b|working.?student|\bwerkstudent\b|\bthesis\b|\bpraktik/i;

interface GreenhouseJob {
  title: string;
  absolute_url: string;
  content?: string;
  company_name?: string;
  location?: { name?: string };
}

/**
 * Stripe hosts its jobs on a Greenhouse board that returns full descriptions
 * inline, so the whole portal is a single request. Greenhouse can't filter
 * server-side, and the board carries ~500 mostly-senior roles, so we prefilter to
 * intern-titled listings by title — cutting ~99% of jobs before the LLM — and let
 * the judge apply the Europe + software rules.
 */
export class StripeSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const board = this.option<string>('board', DEFAULT_BOARD);
    const { jobs = [] } = await this.fetchJson<{ jobs?: GreenhouseJob[] }>(boardUrl(board));

    return jobs
      .filter((j) => INTERN_TITLE.test(j.title))
      .map(
        (j) =>
          ({
            title: j.title,
            url: j.absolute_url,
            location: j.location?.name,
            description: htmlToText(j.content),
            company: j.company_name ?? 'Stripe',
          }) satisfies RawJob,
      );
  }
}
