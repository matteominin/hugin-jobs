import type { RawJob } from '../types.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const DEFAULT_BOARD = 'deepmind';
const boardUrl = (board: string): string =>
  `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;

const TARGET_TITLE =
  /\b(intern(ship)?|student researcher|working student|graduate|new grad|software engineer(?:ing)?\W{0,20}intern|research engineer(?:ing)?\W{0,20}intern|research intern(ship)?)\b/i;
const EXCLUDED_TITLE =
  /\b(apprentice|apprenticeship|step|greach|post-?doctoral|postdoc|phd|senior|staff|principal|lead|manager|director|designer|design|product|strategy|sales|marketing|legal|finance|people operations|hr|human resources)\b/i;
const EUROPE_LOCATION =
  /\b(united kingdom|uk|england|london|cambridge|france|paris|germany|berlin|munich|netherlands|amsterdam|ireland|dublin|switzerland|zurich|zürich|italy|milan|spain|madrid|barcelona|poland|warsaw|sweden|stockholm|denmark|copenhagen|norway|oslo|finland|helsinki|austria|vienna|belgium|brussels|portugal|lisbon|czech|prague|romania|bucharest|hungary|budapest)\b/i;
const NON_EUROPE_LOCATION =
  /\b(us|usa|united states|canada|china|india|singapore|japan|australia|california|washington|new york|mountain view|san francisco|seattle|kirkland|los angeles)\b/i;

interface GreenhouseJob {
  title: string;
  absolute_url: string;
  content?: string;
  company_name?: string;
  location?: { name?: string };
}

/**
 * Google DeepMind uses a Greenhouse board. Keep only explicit student/intern or
 * graduate technical openings, and avoid sending generic full-time research roles
 * to the LLM.
 */
export class DeepMindSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const board = this.option<string>('board', DEFAULT_BOARD);
    const { jobs = [] } = await this.fetchJson<{ jobs?: GreenhouseJob[] }>(boardUrl(board));

    return jobs
      .filter((j) => this.keep(j))
      .map(
        (j) =>
          ({
            title: j.title,
            url: j.absolute_url,
            location: j.location?.name,
            description: htmlToText(j.content),
            company: j.company_name ?? 'Google DeepMind',
          }) satisfies RawJob,
      );
  }

  private keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return this.inEurope(job.location?.name);
  }

  private inEurope(location: string | undefined): boolean {
    if (!location) return true;
    if (EUROPE_LOCATION.test(location)) return true;
    return !NON_EUROPE_LOCATION.test(location);
  }
}
