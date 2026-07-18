import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career|trainee)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?|qa|compiler|language)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account (executive|manager)|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations|ambassador)\b/i;

/**
 * JetBrains' Greenhouse board — one request for the whole board with
 * descriptions inline. JetBrains has large engineering hubs across Europe
 * (Prague, Munich, Amsterdam, and remote-EU), so keep technical student-level
 * titles in Europe and let the LLM judge. Campus Ambassador roles are excluded
 * as non-engineering.
 */
export class JetBrainsSource extends GreenhouseSource {
  protected readonly defaultBoard = 'jetbrains';
  protected readonly companyName = 'JetBrains';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
