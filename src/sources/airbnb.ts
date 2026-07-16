import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE = /\bintern(ship)?\b|working.?student|\bwerkstudent\b|\bstage\b|\btirocinio\b|\bnew grad(uate)?\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|scien(ce|tist)|ai|machine learning|data|infrastructure|security|platform)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|postdoc|senior|staff|principal|lead|manager|director|sales|marketing|recruit|account|legal|finance|hr)\b/i;

/**
 * Airbnb's Greenhouse board (~200 roles, one request). It skews senior and
 * posts few interns — often non-technical ones (e.g. "Sales Operations
 * Intern") — so we require an intern/student title plus a technical signal,
 * drop obvious senior/non-technical noise, and keep only Europe-or-unknown
 * locations for the LLM to judge.
 */
export class AirbnbSource extends GreenhouseSource {
  protected readonly defaultBoard = 'airbnb';
  protected readonly companyName = 'Airbnb';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(this.locationText(job));
  }
}
