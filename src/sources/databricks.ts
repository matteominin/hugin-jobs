import type { RawJob } from '../types.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const DEFAULT_BOARD = 'databricks';
const boardUrl = (board: string): string =>
  `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;

const TARGET_TITLE =
  /\b(intern(ship)?|working student|graduate.*(software|engineer|engineering|research|ai|machine learning)|new grad|new graduate|university graduate|early career.*(software|engineer|engineering|research|ai|machine learning)|software engineer.*(intern|graduate|student)|research.*intern)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer|engineering|research|ai|machine learning|ml\b|data science|backend|frontend|fullstack|full stack|platform|infrastructure|distributed systems?|database|security|forward deployed engineer|fde)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|manager|director|sales|account executive|solutions architect|pre-?sales|presales|business development|marketing|legal|finance|recruit(?:er|ing)|operations|gtm|go-to-market|partner|customer success|field engineering|technical program manager|specialist)\b/i;
const EXCLUDED_CATEGORY =
  /\b(sales|finance|legal|recruiting|operations|business development|marketing|customer success)\b/i;
const EUROPE_LOCATION =
  /\b(united kingdom|uk|england|london|cambridge|france|paris|germany|berlin|munich|netherlands|amsterdam|ireland|dublin|switzerland|zurich|zürich|italy|milan|spain|madrid|barcelona|poland|warsaw|sweden|stockholm|denmark|copenhagen|norway|oslo|finland|helsinki|austria|vienna|belgium|brussels|portugal|lisbon|czech|prague|romania|bucharest|hungary|budapest|remote - france|remote - netherlands|remote - united kingdom)\b/i;
const NON_EUROPE_LOCATION =
  /\b(united states|usa|canada|india|singapore|japan|australia|brazil|mexico|korea|china|san francisco|california|mountain view|new york|seattle|bellevue|washington|texas|austin)\b/i;

interface GreenhouseMetadata {
  name?: string;
  value?: string | string[];
}

interface GreenhouseJob {
  title: string;
  absolute_url: string;
  content?: string;
  company_name?: string;
  location?: { name?: string };
  metadata?: GreenhouseMetadata[];
}

/**
 * Databricks exposes its public jobs through Greenhouse. The board is large and
 * mostly full-time senior/sales roles, so keep only explicit student-level
 * technical titles in Europe before the LLM.
 */
export class DatabricksSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const board = this.option<string>('board', DEFAULT_BOARD);
    const { jobs = [] } = await this.fetchJson<{ jobs?: GreenhouseJob[] }>(boardUrl(board));

    return jobs
      .filter((job) => this.keep(job))
      .map(
        (job) =>
          ({
            title: job.title,
            url: job.absolute_url,
            location: job.location?.name,
            description: htmlToText([job.content, this.metadataText(job)].filter(Boolean).join('\n\n')),
            company: job.company_name ?? 'Databricks',
          }) satisfies RawJob,
      );
  }

  private keep(job: GreenhouseJob): boolean {
    const metadata = this.metadataText(job);
    const text = `${job.title}\n${metadata}`;

    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(text)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    if (EXCLUDED_CATEGORY.test(metadata)) return false;
    return this.inEurope(job.location?.name);
  }

  private inEurope(location: string | undefined): boolean {
    if (!location) return true;
    if (EUROPE_LOCATION.test(location)) return true;
    return !NON_EUROPE_LOCATION.test(location);
  }

  private metadataText(job: GreenhouseJob): string {
    return (job.metadata ?? [])
      .map((item) => {
        const value = Array.isArray(item.value) ? item.value.join(', ') : item.value;
        return [item.name, value].filter(Boolean).join(': ');
      })
      .filter(Boolean)
      .join('\n');
  }
}
