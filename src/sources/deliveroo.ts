import { AshbySource, type AshbyJob } from './ashby.js';

const TARGET_TITLE =
  /\b(intern|internship|working student|werkstudent|praktikum|praktikant|new grad(uate)?|university graduate|campus|placement|early career)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data (science|platform|engineering|analyst)|backend|frontend|fullstack|full stack|platform|infrastructure|distributed systems?|security|systems?)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|manager|director|head of|sales|account executive|business development|marketing|communications|legal|finance|strategy|recruit(er|ing|ment)|people|hr\b|operations|commercial|rider)\b/i;
const EXCLUDED_ORG =
  /\b(sales|marketing|communications|finance|legal|recruiting|people|operations|business development|customer|commercial|strategy)\b/i;

/**
 * Deliveroo publishes its jobs on an Ashby board (~190 roles, descriptions
 * inline), so the whole portal is a single request. Deliveroo is headquartered
 * in London and posts non-technical early-career roles too (Finance & Strategy
 * interns), so require a technical signal and keep only student-level technical
 * titles in Europe before the LLM.
 */
export class DeliverooSource extends AshbySource {
  protected readonly defaultBoard = 'deliveroo';
  protected readonly companyName = 'Deliveroo';

  protected keep(job: AshbyJob): boolean {
    const org = [job.department, job.team].filter(Boolean).join(' ');

    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(`${job.title} ${org}`)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    if (EXCLUDED_ORG.test(org)) return false;
    return this.inEurope(job);
  }
}
