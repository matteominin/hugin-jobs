import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career|placement|stage|stagiaire)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research(er)?|ai|ml|machine learning|data|backend|frontend|platform|infrastructure|security|systems?|quant(itative)?|fpga|hardware|trading technolog|low[- ]latency)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account (executive|manager)|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations|compliance|trader\b)\b/i;

/**
 * Da Vinci Derivatives' Greenhouse board — whole board with inline descriptions in one request. Da Vinci is an Amsterdam-based tech-driven trading firm with software, quant and data intern/graduate roles in Europe, so the technical signal is broadened while pure trading-desk roles are excluded. location.name is a real place.
 */
export class DaVinciSource extends GreenhouseSource {
  protected readonly defaultBoard = 'davinciderivatives';
  protected readonly companyName = 'Da Vinci Derivatives';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
