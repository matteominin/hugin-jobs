import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data|backend|frontend|platform|infrastructure|security|systems?|quant(itative)?|technolog(y|ist))\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account (executive|manager)|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|compliance|trader|trading)\b/i;

/**
 * Flow Traders' Greenhouse board — one request for the whole board with
 * descriptions inline. Amsterdam-based tech-driven trading firm; the technical
 * signal keeps software/quant engineering roles while the excluded set drops
 * the pure trading desk positions. `location.name` is a real place.
 */
export class FlowTradersSource extends GreenhouseSource {
  protected readonly defaultBoard = 'flowtraders';
  protected readonly companyName = 'Flow Traders';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
