import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career|apprentice(ship)?)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?|reliability|sre)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account (executive|manager)|solutions? engineer|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations|support)\b/i;

/**
 * Roblox's Greenhouse board — one request for the whole board with descriptions inline. Roblox has a growing European presence, so keep technical student-level titles in Europe and let the LLM judge. 0 EU intern jobs is a legitimate steady state.
 */
export class RobloxSource extends GreenhouseSource {
  protected readonly defaultBoard = 'roblox';
  protected readonly companyName = 'Roblox';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
