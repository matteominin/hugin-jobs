import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career|placement|stage|stagiaire)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research(er)?|ai|ml|machine learning|data|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?|reliability|sre)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account (executive|manager)|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations)\b/i;

/**
 * Wolt's Greenhouse board — one request for the whole board. Helsinki-based (Nordic) delivery-tech with software internships across Europe; keep technical student-level titles and let the LLM judge.
 */
export class WoltSource extends GreenhouseSource {
  protected readonly defaultBoard = 'wolt';
  protected readonly companyName = 'Wolt';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
