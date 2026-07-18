import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career|placement|stage|stagiaire)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research(er)?|ai|ml|machine learning|data|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?|reliability|sre)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account (executive|manager)|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations)\b/i;

/**
 * Doctolib's Greenhouse board — one request for the whole board. Paris/Berlin-based health-tech with real software internships across Europe; keep technical student-level titles and let the LLM judge.
 */
export class DoctolibSource extends GreenhouseSource {
  protected readonly defaultBoard = 'doctolib';
  protected readonly companyName = 'Doctolib';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
