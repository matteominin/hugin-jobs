import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?|sre|site reliability)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account executive|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations)\b/i;

/**
 * GitLab's Greenhouse board — one request for the whole board with descriptions
 * inline. GitLab is all-remote, so `location.name` is often a "Remote,
 * <region>" string that `isEuropeLocationText` resolves (and unknown locations
 * go to the LLM). Keep technical student-level titles in Europe. Intern
 * postings are rare, so 0 jobs is the normal steady state.
 */
export class GitLabSource extends GreenhouseSource {
  protected readonly defaultBoard = 'gitlab';
  protected readonly companyName = 'GitLab';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
