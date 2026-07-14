import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|student researcher|working student|graduate|new grad|software engineer(?:ing)?\W{0,20}intern|research engineer(?:ing)?\W{0,20}intern|research intern(ship)?)\b/i;
const EXCLUDED_TITLE =
  /\b(apprentice|apprenticeship|step|greach|post-?doctoral|postdoc|phd|senior|staff|principal|lead|manager|director|designer|design|product|strategy|sales|marketing|legal|finance|people operations|hr|human resources)\b/i;

/**
 * Google DeepMind uses a Greenhouse board. Keep only explicit student/intern or
 * graduate technical openings, and avoid sending generic full-time research roles
 * to the LLM.
 */
export class DeepMindSource extends GreenhouseSource {
  protected readonly defaultBoard = 'deepmind';
  protected readonly companyName = 'Google DeepMind';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
