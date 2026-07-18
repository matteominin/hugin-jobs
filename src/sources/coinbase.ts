import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?|blockchain|protocol|cryptography)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account executive|business development|marketing|communications|legal|compliance|finance|recruit(er|ing|ment)|people|hr\b|operations)\b/i;

/**
 * Coinbase's Greenhouse board — one request for the whole board with
 * descriptions inline. `location.name` carries a real place, so keep only
 * technical student-level titles in Europe. The board is large and mostly
 * senior/US, so 0 EU intern jobs is the normal steady state.
 */
export class CoinbaseSource extends GreenhouseSource {
  protected readonly defaultBoard = 'coinbase';
  protected readonly companyName = 'Coinbase';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
