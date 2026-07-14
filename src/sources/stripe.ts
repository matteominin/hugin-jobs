import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const INTERN_TITLE = /\bintern(ship)?\b|working.?student|\bwerkstudent\b|\bthesis\b|\bpraktik/i;

/**
 * Stripe's Greenhouse board carries ~500 mostly-senior roles, so we prefilter to
 * intern-titled listings by title — cutting ~99% of jobs before the LLM — and let
 * the judge apply the Europe + software rules.
 */
export class StripeSource extends GreenhouseSource {
  protected readonly defaultBoard = 'stripe';
  protected readonly companyName = 'Stripe';

  protected keep(job: GreenhouseJob): boolean {
    return INTERN_TITLE.test(job.title);
  }
}
