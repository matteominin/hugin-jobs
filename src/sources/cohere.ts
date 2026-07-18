import { AshbySource, type AshbyJob } from './ashby.js';

const TARGET_TITLE =
  /\b(intern|internship|working student|werkstudent|praktikum|praktikant|new grad(uate)?|university graduate|campus|co-?op)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data (science|platform|engineering)|backend|frontend|fullstack|full stack|platform|infrastructure|distributed systems?|model|security)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|manager|director|head of|sales|account executive|solution(s)? engineer|pre-?sales|presales|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations|gtm|go-to-market|partner|customer success|support)\b/i;
const EXCLUDED_ORG =
  /\b(sales|marketing|communications|finance|legal|recruiting|people|operations|business development|customer success|support)\b/i;

/**
 * Cohere publishes its jobs on an Ashby board (~140 roles, descriptions
 * inline), so the whole portal is a single request. Cohere's engineering hub
 * outside North America is London; most intern/co-op postings today are Canada,
 * so keep only technical student-level titles in Europe — 0 EU jobs is the
 * normal steady state, and the filter is here for when Cohere opens a European
 * intern class.
 */
export class CohereSource extends AshbySource {
  protected readonly defaultBoard = 'cohere';
  protected readonly companyName = 'Cohere';

  protected keep(job: AshbyJob): boolean {
    const org = [job.department, job.team].filter(Boolean).join(' ');

    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(`${job.title} ${org}`)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    if (EXCLUDED_ORG.test(org)) return false;
    return this.inEurope(job);
  }
}
