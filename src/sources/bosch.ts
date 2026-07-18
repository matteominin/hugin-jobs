import { SmartRecruitersSource, type SmartRecruitersPosting } from './smartrecruiters.js';

const TARGET_TITLE =
  /\b(intern(ship)?|working student|werkstudent|praktik(um|ant(in)?)|new grad(uate)?|graduate|university graduate|campus|early career|placement|apprentice(ship)?|absolvent(in)?|thesis|abschlussarbeit|master(and|arbeit))\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|entwickl|research(er)?|ai|ki\b|ml|machine learning|data|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?|embedded|robot|reliability|sre|informatik)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account (executive|manager)|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations|compliance|purchasing|logistics|controlling|vertrieb|einkauf)\b/i;

/**
 * Bosch's SmartRecruiters board (`boschgroup`) is very large (~4.7k postings),
 * and the API has no usable server-side title filter (its `q` is a noisy
 * full-text OR), so the whole board is swept once at 100/page (~48 requests) —
 * every page is genuinely distinct jobs, not redundant re-queries. A detail
 * request is made only per kept job. German student roles ("Praktikum",
 * "Werkstudent", "Absolvent", "Abschlussarbeit") are matched alongside English;
 * the portal runs on a long interval to keep the daily sweep count sane.
 */
export class BoschSource extends SmartRecruitersSource {
  protected readonly defaultCompany = 'boschgroup';
  protected readonly companyName = 'Bosch';

  protected keep(job: SmartRecruitersPosting): boolean {
    if (!TARGET_TITLE.test(job.name)) return false;
    if (!TECHNICAL_SIGNAL.test(job.name)) return false;
    if (EXCLUDED_TITLE.test(job.name)) return false;
    return this.inEurope(job);
  }
}
