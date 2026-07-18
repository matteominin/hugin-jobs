import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career|apprentice(ship)?|stage|stagiaire)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?|reliability|sre|search)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account (executive|manager)|solutions? architect|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations)\b/i;

/**
 * Elastic's Greenhouse board — one request for the whole board with
 * descriptions inline. Elastic is a distributed-first company with a strong
 * European engineering presence, so keep technical student-level titles in
 * Europe (including remote-EU) and let the LLM judge.
 */
export class ElasticSource extends GreenhouseSource {
  protected readonly defaultBoard = 'elastic';
  protected readonly companyName = 'Elastic';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
