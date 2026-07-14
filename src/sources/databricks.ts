import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|graduate.*(software|engineer|engineering|research|ai|machine learning)|new grad|new graduate|university graduate|early career.*(software|engineer|engineering|research|ai|machine learning)|software engineer.*(intern|graduate|student)|research.*intern)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer|engineering|research|ai|machine learning|ml\b|data science|backend|frontend|fullstack|full stack|platform|infrastructure|distributed systems?|database|security|forward deployed engineer|fde)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|manager|director|sales|account executive|solutions architect|pre-?sales|presales|business development|marketing|legal|finance|recruit(?:er|ing)|operations|gtm|go-to-market|partner|customer success|field engineering|technical program manager|specialist)\b/i;
const EXCLUDED_CATEGORY =
  /\b(sales|finance|legal|recruiting|operations|business development|marketing|customer success)\b/i;

/**
 * Databricks exposes its public jobs through Greenhouse. The board is large and
 * mostly full-time senior/sales roles, so keep only explicit student-level
 * technical titles in Europe before the LLM.
 */
export class DatabricksSource extends GreenhouseSource {
  protected readonly defaultBoard = 'databricks';
  protected readonly companyName = 'Databricks';

  protected keep(job: GreenhouseJob): boolean {
    const metadata = this.metadataText(job);

    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(`${job.title}\n${metadata}`)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    if (EXCLUDED_CATEGORY.test(metadata)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
