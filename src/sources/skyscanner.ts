import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career|placement)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account executive|business development|marketing|editorial|content|social media|pr\b|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations)\b/i;

/**
 * Skyscanner's Greenhouse board — one request for the whole board with
 * descriptions inline. Skyscanner is a UK company (Edinburgh/Glasgow/London,
 * plus Barcelona) that hires software interns and graduates seasonally, so keep
 * technical student-level titles in Europe (`location.name` is a real place)
 * and let the LLM judge. The board is small and often senior-only, so 0 jobs is
 * the normal steady state.
 */
export class SkyscannerSource extends GreenhouseSource {
  protected readonly defaultBoard = 'skyscanner';
  protected readonly companyName = 'Skyscanner';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
