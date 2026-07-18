import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career|placement)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research(er)?|ai|ml|machine learning|data|backend|frontend|platform|infrastructure|security|systems?|quant(itative)?|fpga|hardware|trading technolog|low[- ]latency)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account (executive|manager)|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations|compliance|trader\b)\b/i;

/**
 * Jane Street's Greenhouse board — one request for the whole board. A quant-trading firm with a large London office and real software/quant graduate and internship programmes, so the technical signal is broadened while pure trading-desk roles are excluded. location.name is a real place.
 */
export class JaneStreetSource extends GreenhouseSource {
  protected readonly defaultBoard = 'janestreet';
  protected readonly companyName = 'Jane Street';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
