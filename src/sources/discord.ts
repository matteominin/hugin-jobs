import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE = /\bintern(ship)?\b|working.?student|\bwerkstudent\b|\bnew grad(uate)?\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|research|ai|machine learning|data|security|infrastructure|platform|backend|frontend|full.?stack|mobile|android|ios)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|postdoc|senior|staff|principal|lead|manager|director|sales|marketing|recruit|legal|counsel|finance|account(ing)?)\b/i;

/**
 * Discord's Greenhouse board (~50 roles, overwhelmingly senior and US-based;
 * zero intern roles as of 2026-07). Whole board in 1 request; we prefilter to
 * student-level technical titles and drop obvious non-Europe locations so a
 * future EU internship reaches the LLM without today's board costing anything.
 */
export class DiscordSource extends GreenhouseSource {
  protected readonly defaultBoard = 'discord';
  protected readonly companyName = 'Discord';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(this.locationText(job));
  }
}
