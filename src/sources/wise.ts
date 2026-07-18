import { SmartRecruitersSource, type SmartRecruitersPosting } from './smartrecruiters.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|new grad(uate)?|graduate|university graduate|campus|early career|placement|apprentice(ship)?)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research(er)?|ai|ml|machine learning|data|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?|reliability|sre|analytics|android|ios|mobile)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account (executive|manager)|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations|compliance|risk|customer support)\b/i;

/**
 * Wise's SmartRecruiters board — swept once at 100/page (~5 requests for the
 * whole board), with a detail request per kept job for the description. Wise is
 * Tallinn/London-based with real engineering internships and graduate roles
 * across Europe; keep technical student-level titles and let the LLM judge.
 */
export class WiseSource extends SmartRecruitersSource {
  protected readonly defaultCompany = 'wise';
  protected readonly companyName = 'Wise';

  protected keep(job: SmartRecruitersPosting): boolean {
    if (!TARGET_TITLE.test(job.name)) return false;
    if (!TECHNICAL_SIGNAL.test(job.name)) return false;
    if (EXCLUDED_TITLE.test(job.name)) return false;
    return this.inEurope(job);
  }
}
