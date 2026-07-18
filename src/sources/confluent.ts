import { AshbySource, type AshbyJob } from './ashby.js';

const TARGET_TITLE =
  /\b(intern|internship|working student|werkstudent|praktikum|praktikant|new grad(uate)?|graduate|university graduate|campus|co-?op)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data (science|platform|engineering)|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?|distributed systems?|kafka)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|manager|director|head of|sales|account (executive|manager)|solutions? engineer|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations|design(er)?|customer success|support)\b/i;
const EXCLUDED_ORG =
  /\b(sales|marketing|communications|finance|legal|recruiting|people|operations|business development|customer success|support|design)\b/i;

/**
 * Confluent publishes its jobs on an Ashby board (descriptions inline), so the
 * whole portal is a single request. Confluent is remote-first with European
 * engineering (UK and remote-EU), so keep technical student-level titles in
 * Europe and let the LLM judge. 0 EU intern jobs is the normal steady state.
 */
export class ConfluentSource extends AshbySource {
  protected readonly defaultBoard = 'confluent';
  protected readonly companyName = 'Confluent';

  protected keep(job: AshbyJob): boolean {
    const org = [job.department, job.team].filter(Boolean).join(' ');

    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(`${job.title} ${org}`)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    if (EXCLUDED_ORG.test(org)) return false;
    return this.inEurope(job);
  }
}
