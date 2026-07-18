import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career|praktik(um|ant)?|apprentice(ship)?|stage|stagiaire)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data (science|engineering|platform)|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account (executive|manager)|business development|marketing|communications|localization|localisation|legal|finance|recruit(er|ing|ment)|people|hr\b|operations|consult(ing|ant)|value engineering)\b/i;

/**
 * Celonis' Greenhouse board — one request for the whole board with descriptions
 * inline. Celonis is Munich-headquartered with a large European engineering
 * organisation; the board is noisy with non-technical interns (marketing,
 * business development, consulting), so the technical signal is load-bearing.
 */
export class CelonisSource extends GreenhouseSource {
  protected readonly defaultBoard = 'celonis';
  protected readonly companyName = 'Celonis';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
