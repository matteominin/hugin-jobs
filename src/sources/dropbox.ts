import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE = /\bintern(ship)?\b|working.?student|\bnew grad(uate)?\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|research|scientist|ai|machine learning|data|developer|infrastructure|security|platform)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|postdoc|senior|staff|principal|lead|manager|director|head|sales|marketing|account|recruit)\b/i;

/**
 * Dropbox's Greenhouse board (`dropbox`, listings on jobs.dropbox.com) — one
 * request for the whole board with descriptions inline. Dropbox is Virtual
 * First: locations are "Remote - <country>" strings, which
 * `isEuropeLocationText` resolves, so we keep intern-titled technical roles in
 * Europe. The board is small (~40 roles) and skews senior/sales; intern
 * postings are seasonal, so 0 jobs is the normal steady state.
 */
export class DropboxSource extends GreenhouseSource {
  protected readonly defaultBoard = 'dropbox';
  protected readonly companyName = 'Dropbox';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(this.locationText(job));
  }
}
