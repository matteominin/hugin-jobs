import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career|placement|year in industry)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data|backend|frontend|platform|infrastructure|security|systems?|silicon|firmware|hardware|soc|compiler|architect)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account (executive|manager)|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations)\b/i;

/**
 * Graphcore's Greenhouse board — one request for the whole board with
 * descriptions inline. Graphcore is a UK AI-silicon company (Bristol,
 * Cambridge) that runs a real graduate/placement programme in engineering,
 * silicon and firmware, so the technical signal is broadened accordingly.
 */
export class GraphcoreSource extends GreenhouseSource {
  protected readonly defaultBoard = 'graphcore';
  protected readonly companyName = 'Graphcore';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
