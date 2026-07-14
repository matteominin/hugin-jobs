# AGENTS.md — how to add a job portal

Guidance for coding agents working on this repo. **Read this end to end before writing code.**
It is written to be followed literally, in order. Every command here is copy-pasteable.

If you only remember three things:

1. **Never run the live scheduler, and never `npm run seed` without asking.** Both have real
   side effects (Mongo writes, LLM spend, Telegram messages to real people).
2. **A portal should make as few HTTP requests as possible.** Most are 1. If yours makes 30,
   you must prove every one of them earns its place (§5).
3. **Measure, don't guess.** Every number in this file came from running the harnesses in §5.
   Do the same before you believe anything — including this file.

---

## 1. What this service does

A scheduler loads enabled **portal** documents from MongoDB and runs each on its own interval:

```text
enabled portals (MongoDB)
  -> Source.produce()          <- the ONLY part you write
  -> dedup by portalId + url/title hash
  -> LLM judge (DeepSeek) for unjudged jobs      | skipped on a portal's
  -> Telegram notify when suitable               | install cycle (Step 8)
```

A portal with `status: "install"` does its first successful cycle as a **baseline**: the jobs
are stored (marked `backfilled: true`) but never judged or notified, and the portal then flips
itself to `running`. That is what keeps a new poster's back-catalogue from becoming a hundred
LLM calls and a Telegram blast. Dry-runs ignore `status`, so it never gets in your way.

| File | Role |
| --- | --- |
| `src/index.ts` | starts the service |
| `src/scheduler.ts` | loads enabled portals, runs each portal loop |
| `src/runner.ts` | produce -> dedup -> judge -> notify |
| `src/sources/` | one source per company (**your work goes here**) |
| `src/sources/index.ts` | registers source keys |
| `src/seed.ts` | global prompt/settings + portal documents |
| `src/llm/judge.ts` | builds the LLM prompt and structured result |
| `src/util/europe.ts` | Europe helpers — use these, don't reinvent |
| `src/util/html.ts` | `htmlToText()` — HTML/entity decode, collapse, cap at 4000 chars |

**A source only fetches and shapes jobs.** It must never write MongoDB, call the LLM, or send
Telegram. It returns `RawJob[]`:

```ts
interface RawJob { title: string; url: string; description?: string; company?: string; location?: string }
```

### What we are looking for

Defined once, globally, in `src/seed.ts` (`settingsSeed.positionDescription`) — **go read it
now**. In short: **internships** (intern / stage / tirocinio / working student) in **software
engineering or research**, in **Europe** (EU/EEA/UK/CH), where a **PhD is not mandatory** (a
Master's requirement is fine). Non-technical roles (sales, marketing, HR) are out.

Your source does **not** need to enforce all of that — see §3 Step 6. The LLM does the judging.

---

## 2. Safety rules (read before running anything)

- **Do not run `npm run dev` / `npm start`.** That is the live scheduler: it writes jobs, spends
  LLM tokens, and messages real Telegram subscribers.
- **Do not run `npm run seed` on your own initiative.** It upserts settings + *all* portals and
  will overwrite anything tuned directly in the DB. Ask the user first, every time.
- **The DB is a shared remote Atlas cluster, not a local throwaway.** Other people's data is in
  there.
- **Never paste Mongo URIs or Telegram tokens into chat, logs, commits, or PR text.** Startup
  logs print the Mongo URI *with credentials in it* — redact before quoting output.
- Dry-run is your sandbox. It reads settings/portals/jobs, and **does not** insert jobs, update
  `match`/`enrichment`/`usage`/`notified`/`lastRunAt`/failure counters, auto-disable portals, or
  send Telegram. It also injects enabled seed-only portals in memory, so you can test a new
  portal **before** it exists in the DB.

```bash
npm run dry-run:sources   # fetch + dedup only, NO LLM calls  <- use this for source work
npm run dry-run           # fetch + dedup + LLM judging, still no writes/Telegram
```

Target one portal with `HUGIN_PORTAL` (comma-separated source keys or portal-name substrings;
an exact source-key match wins, so `google` means the `google` source, not `Google DeepMind`):

```bash
HUGIN_PORTAL=snowflake npm run dry-run:sources
HUGIN_PORTAL=snowflake,palantir npm run dry-run:sources
```

---

## 3. The playbook

Follow these steps in order. Do not skip Step 11.

### Step 1 — Find the feed (don't scrape HTML if you don't have to)

Most companies use a job-board vendor with a public JSON API. **Probe before you assume.** Try
the company slug and its variants (`acme`, `acmeinc`, `acmecomputing`):

```bash
C=acme
curl -s -o /dev/null -w "greenhouse %{http_code}\n" "https://boards-api.greenhouse.io/v1/boards/$C/jobs"
curl -s -o /dev/null -w "ashby      %{http_code}\n" "https://api.ashbyhq.com/posting-api/job-board/$C"
curl -s -o /dev/null -w "lever      %{http_code}\n" "https://api.lever.co/v0/postings/$C?mode=json"
curl -s -o /dev/null -w "smartr     %{http_code}\n" "https://api.smartrecruiters.com/v1/companies/$C/postings"
curl -s -o /dev/null -w "recruitee  %{http_code}\n" "https://$C.recruitee.com/api/offers/"
curl -s -o /dev/null -w "workable   %{http_code}\n" "https://apply.workable.com/api/v1/widget/accounts/$C"
```

`200` is a hit — but **open it and check it is really that company's board**, not a name
collision. If nothing hits, open the careers page with `WebFetch`, then find the XHR the page
itself makes (Workday, Eightfold, Phenom, or bespoke). See the cheat-sheet in §4.

### Step 2 — Learn the payload before writing a class

Dump it and answer four questions:

```bash
curl -s "https://api.ashbyhq.com/posting-api/job-board/acme" > /tmp/acme.json
node -e '
const j = JSON.parse(require("fs").readFileSync("/tmp/acme.json")).jobs;
console.log("total:", j.length);
console.log("keys:", Object.keys(j[0]).join(", "));
console.log(JSON.stringify(j[0], null, 2).slice(0, 1500));
'
```

1. **How many jobs total?** (Do I need paging?)
2. **Are descriptions inline?** (If not, I need a detail request *per job* — expensive.)
3. **What is the location/country field, and is it a code or a name?** This decides which
   `util/europe.ts` helper you use.
4. **Is there a reliable level/employment-type field?** Usually **no** — verify before trusting
   it. Snowflake tags "Software Engineer Intern - Berlin (2026)" as `employmentType: "FullTime"`.
   That is exactly why we filter on the **title**, not on such fields.

### Step 3 — Pick the base class

| Situation | Extend | Copy this source |
| --- | --- | --- |
| Greenhouse board | `GreenhouseSource` (`greenhouse.ts`) | `stripe.ts` (simplest), `databricks.ts` |
| Ashby board | `AshbySource` (`ashby.ts`) | `snowflake.ts`, `openai.ts` |
| Anything else | `BaseSource` (`base.ts`) | `palantir.ts` (Lever), `nvidia.ts` (Workday) |

The vendor bases already do the fetch, the mapping to `RawJob`, and the Europe check — you
implement **only** `keep()`. Do not hand-roll a Greenhouse/Ashby fetch; extend the base.

`BaseSource` gives you `fetchText(url, opts)` / `fetchJson<T>(url, opts)` (browser UA + timeout
baked in, throws on non-2xx), `option<T>(key, fallback)` for `sourceOptions`, and `this.portal`.

### Step 4 — Write the source

Vendor board (the common case):

```ts
// src/sources/acme.ts
import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE = /\b(intern|internship|working student|new grad(uate)?)\b/i;
const TECHNICAL_SIGNAL = /\b(software|engineer(ing)?|research|ai|machine learning|data)\b/i;
const EXCLUDED_TITLE = /\b(phd|postdoc|senior|staff|principal|lead|manager|director|sales|marketing)\b/i;

export class AcmeSource extends GreenhouseSource {
  protected readonly defaultBoard = 'acme';
  protected readonly companyName = 'Acme';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(job.location?.name);
  }
}
```

Bespoke API: extend `BaseSource`, implement `produce()`, mirror `palantir.ts`. Rules:

- Put every tunable (`board`, `queries`, `maxPages`, `limit`) behind `option()` so it can be
  A/B-tested from `sourceOptions` **without a code change** (§5 depends on this).
- Dedupe by stable job ID/URL in a `Map` if a query can return the same job twice.
- `htmlToText()` any HTML before it reaches `description`.
- Prefer official JSON APIs or embedded structured data. No browser automation.

**Word-boundary trap:** `/intern/` matches "Int**ern**al Applications" and "Int**ern**ational
Tax". Always `\bintern\b`, and check your regex against the real titles.

### Step 5 — Europe filtering: use the helpers

From `src/util/europe.ts` — pick by what the feed gives you:

| Feed gives | Use |
| --- | --- |
| alpha-2 code (`"GB"`) | `isEuropeAlpha2(code)` |
| alpha-3 code (`"GBR"`) | `EUROPE_ALPHA3.includes(code)` |
| country **name** (`"United Kingdom"`) | `isEuropeCountryName(name)` |
| free text (`"Berlin, Germany"`) | `isEuropeLocationText(text)` |
| a country **filter** in the API | filter server-side (best — see §5) |

**Unknown location => keep it** (let the LLM decide). Dropping silently is how jobs go missing.
The helpers already behave this way; don't "fix" that.

### Step 6 — Prefilter philosophy: cheap and high-recall

The prefilter exists **only to cut LLM cost**, not to be correct. Aim high-recall:

- **Do** cut: obvious non-Europe, obvious non-technical (sales/marketing/HR/legal/design),
  clearly senior (senior/staff/principal/lead/manager/director, `III`), postdoc/PhD-only,
  apprenticeships, STEP, gReach.
- **Don't** try to resolve ambiguity (is this Master-accessible? is a Deployment Strategist
  technical?). Pass it to the LLM.
- Three regexes cover most boards: `TARGET_TITLE` (student-level?), `TECHNICAL_SIGNAL`
  (engineering?), `EXCLUDED_TITLE` (obvious junk).

### Step 7 — Register it

```ts
// src/sources/index.ts
import { AcmeSource } from './acme.js';
const registry: Record<string, (portal: Portal) => Source> = {
  // ...
  acme: (portal) => new AcmeSource(portal),
};
```

### Step 8 — Add the portal document

```ts
// src/seed.ts — portalsSeed
{
  // One comment saying WHERE the jobs come from and WHY the filter is shaped this way.
  name: 'Acme (EU student technical roles)',   // unique; upsert key
  enabled: true,
  intervalSeconds: 60 * 20,
  source: 'acme',                              // must match the registry key
  company: 'Acme',
}
```

**Do not add `status`.** `npm run seed` sets it `$setOnInsert`, so a portal that is new to the DB
starts in `install` and baselines itself on its first run, while re-seeding never knocks a live
portal back into `install`. Only set it explicitly in the seed doc to opt *out* of that
(`status: 'running'`), which you should be able to justify.

**`promptOverride` is optional and usually WRONG to add.** The global position description
already covers internship + Europe + no-PhD-only + technical. Add one **only** for a rule the
global prompt genuinely cannot express, and keep it to one or two sentences:

- Good: *"An OpenAI 'Residency' is an early-career track equivalent to an internship."*
  (a company-specific concept the global prompt cannot know)
- Good: *"Palantir 'Deployment Strategist' roles are only a fit when the listing describes
  genuine software work."* (resolves a company-specific ambiguity)
- **Bad:** restating "accept interns in Europe, reject PhD-only, reject sales…" — the judge
  already does that, and a stale copy is worse than none.

### Step 9 — Add dry-run scripts

```jsonc
// package.json
"dry-run:acme": "HUGIN_PORTAL=acme HUGIN_DRY_RUN=1 HUGIN_RUN_ONCE=1 tsx src/index.ts",
"dry-run:sources:acme": "HUGIN_PORTAL=acme HUGIN_DRY_RUN=1 HUGIN_DRY_RUN_SKIP_LLM=1 HUGIN_RUN_ONCE=1 tsx src/index.ts",
```

Add the same two lines to the README's "Safe testing" list.

### Step 10 — Verify

```bash
npx tsc --noEmit                    # must be clean
npm run dry-run:sources:acme        # must produce a sane list
```

Read the output. Are these titles ones **you** would apply to? If it produced 0, that may be
legitimate (OpenAI genuinely has no internships open) — prove it by checking the raw feed for
what you *expected* to match. **Never report "it works" without having seen the job list.**

### Step 11 — Count your requests

**Mandatory. Go to §5.**

### Step 12 — Commit, then ask about seeding

Small commits, one logical change each, one-line subject (see `.claude/CLAUDE.md`).

The portal is in `seed.ts` but **not in the DB** until someone runs `npm run seed`. That is the
user's call, not yours — ask (§2).

---

## 4. Vendor cheat-sheet

| Vendor | Endpoint | Notes |
| --- | --- | --- |
| **Greenhouse** | `boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true` | whole board + descriptions in **1 request**. No server-side filter — prefilter locally. `metadata` is free-form per board. |
| **Ashby** | `api.ashbyhq.com/posting-api/job-board/<slug>?includeCompensation=true` | whole board + descriptions in **1 request**. `address.postalAddress.addressCountry` is a country **name**. `employmentType` is **not** trustworthy. |
| **Lever** | `api.lever.co/v0/postings/<slug>?mode=json` | whole board + descriptions in **1 request**. Real alpha-2 `country`. `categories.commitment` unreliable alone (some "…, Internship" roles are tagged `Full-time`) — OR it with a title match. |
| **Workday** | `POST <host>/wday/cxs/<tenant>/<site>/jobs` body `{appliedFacets, limit, offset, searchText}` | **`limit` max is 20** — 100 returns 400. Facet IDs are opaque: discover them from a `limit:1` probe, then filter `locationHierarchy1` (Europe) and `workerSubType` (Intern / New College Graduate). Details: `GET <host>/wday/cxs/<tenant>/<site><externalPath>`. See `nvidia.ts`. |
| **Eightfold** | `GET <careers-host>/api/pcsx/search?domain=<domain>&query=<q>&start=<n>` | paging via `start`, incremented by returned count. Descriptions need `…/api/pcsx/position_details?domain=<d>&position_id=<id>` — **one request per job**. Token matching, so `intern` subsumes `software intern`. See `qualcomm.ts`. |
| **Apple** | `POST jobs.apple.com/api/v1/search`, `GET jobs.apple.com/api/v1/jobDetails/<jobNumber>` | first GET `jobs.apple.com/en-us/search` for routing cookies. `filters.locations` takes **all 28 `postLocation-<ALPHA3>` IDs at once**. Keep client-side Europe filtering anyway. |
| **Google** | `GET google.com/about/careers/applications/jobs/results/?q=<q>&page=<n>` | job tuples embedded in result HTML. Paging is `page=2,3…` (**`start=20` does not work**). `q=` is strict: `q=intern` returns 0 jobs. Structured `employment_type=INTERN` sees only ~12 jobs globally and misses Student Researcher/graduate roles — do **not** "optimise" to it. |

---

## 5. Request economy — the part everyone gets wrong

A cycle should be as few requests as it can be. Every portal re-runs on its interval forever, so
a wasteful source is wasteful 72×/day. Current reality (re-measure — boards change):

| Source | Requests | Why |
| --- | --- | --- |
| stripe, databricks, deepmind, snowflake, openai, palantir, uber, bolt, spotify | **1** | whole board in one call |
| nvidia | **3** | Workday caps pages at 20 results |
| qualcomm | **19** | 3 queries paged + 1 detail request per kept job |
| apple | **26** | 15 pages of 20 across Europe + 1 detail per kept job |
| google | **30** | 11 genuinely different queries × real paging |

### The rules

1. **One structured sweep beats a loop of free-text queries.** If the API can filter by country
   or worker-type, page that **once**. Apple takes all 28 European countries in a single
   `locations` filter; NVIDIA crosses the Europe facet with Workday's Intern/New-College-Grad
   subtype. A keyword loop on top of a complete sweep can only re-find what it already returned
   — Apple's 7 keyword searches contributed **exactly 0** jobs for 33 wasted requests.
2. **Drop phrasings the head term subsumes.** Token-matching engines make `software intern`,
   `research intern` and `internship` redundant with `intern`; `new graduate` redundant with
   `graduate`. Qualcomm went 8 queries -> 3 for the identical 10 jobs.
3. **A per-job detail request is a real cost.** 10 kept jobs = 10 requests. Tighten the
   prefilter before adding a detail call, and never fetch details for jobs you will discard.
4. **Check the page cap cannot truncate.** A sweep capped at N pages that quietly stops at N is
   a silent miss, not an error. Apple's Europe sweep is 299 records = 15 pages of 20, against an
   old cap of exactly 15 — one posting away from silently losing jobs. Leave real headroom; the
   loop exits when records run out, so headroom is free.
5. **Widening coverage can cost nothing.** Apple's sweep listed 9 countries and missed France,
   Italy, Spain and Switzerland — where Apple has offices. Going to all 28 was **fewer** total
   requests *and* more coverage.
6. **Sometimes the fan-out is real — prove it before cutting.** Google's 11 queries each pull
   genuinely different roles, its pagination works (page 2 returns 20 more), and `maxPages: 1`
   loses 6 jobs. Cutting it would be a silent regression. **This is why you measure.**
7. **Do not overfit to today's board.** "This query returns 0 jobs today" is *not* proof it is
   redundant — it may be the only one that would catch a role posted next week. Cut a query when
   it is redundant **by construction** (subsumed term, already-complete sweep) *and* confirm
   with data. Not the other way round.

### Harness A — count requests

Save to a scratch dir (never in the repo), then `npx tsx <file> [sourceKey]`:

```ts
import { getSource } from '/abs/path/to/hugin-jobs/src/sources/index.js';
import { portalsSeed } from '/abs/path/to/hugin-jobs/src/seed.js';

async function main() {
  const only = process.argv[2];
  for (const portal of portalsSeed) {
    if (only && portal.source !== only) continue;
    const urls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = ((i: any, init: any) => { urls.push(typeof i === 'string' ? i : i.url); return real(i, init); }) as typeof fetch;
    const t = Date.now();
    try {
      const jobs = await getSource(portal).produce();
      console.log(`${portal.source}: ${urls.length} requests, ${jobs.length} jobs, ${((Date.now() - t) / 1000).toFixed(1)}s`);
    } catch (e) {
      console.log(`${portal.source}: FAILED after ${urls.length} requests: ${(e as Error).message}`);
    } finally { globalThis.fetch = real; }
  }
}
main();
```

`amazon` and `microsoft` fail here with "db not connected" — they dedup against stored jobs.
Measure those with `HUGIN_PORTAL=amazon npm run dry-run:sources` instead.

### Harness B — A/B a query set (the one that proves redundancy)

Because every tunable is behind `option()`, you can test **without touching code**:

```ts
import { getSource } from '/abs/path/to/hugin-jobs/src/sources/index.js';
import type { Portal } from '/abs/path/to/hugin-jobs/src/types.js';

async function run(source: string, sourceOptions: Record<string, unknown>) {
  const portal = { name: 'probe', enabled: true, intervalSeconds: 1, source, sourceOptions } as Portal;
  let requests = 0;
  const real = globalThis.fetch;
  globalThis.fetch = ((i: any, x: any) => { requests++; return real(i, x); }) as typeof fetch;
  try {
    const jobs = await getSource(portal).produce();
    return { requests, urls: new Set(jobs.map((j) => j.url)) };
  } finally { globalThis.fetch = real; }
}

async function main() {
  const base = await run('acme', {});                      // current defaults
  const lean = await run('acme', { queries: ['intern'] }); // the proposal
  console.log(`base: ${base.requests} req, ${base.urls.size} jobs`);
  console.log(`lean: ${lean.requests} req, ${lean.urls.size} jobs`);
  console.log('LOST by going lean:', [...base.urls].filter((u) => !lean.urls.has(u)));
}
main();
```

**Ship the lean variant only if `LOST` is empty *and* you can explain structurally why it stays
empty tomorrow.** Otherwise keep the requests.

### Harness C — prove a refactor changed nothing

Before touching a filter or a shared helper, capture a baseline and diff it after:

```bash
npm run dry-run:sources 2>&1 | grep -E "produced|would judge" | sort > /tmp/before.txt
# ...make the change...
npm run dry-run:sources 2>&1 | grep -E "produced|would judge" | sort > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt && echo "IDENTICAL"
```

Beware: a source producing 0 jobs today proves nothing about your change. If the affected source
is empty, exercise the logic directly against the live board (old function vs new, over every
posting) instead of trusting an identical-but-empty diff.

---

## 6. Company-specific notes

- **Google** — tuples embedded in result HTML; dedupe by Google job ID. Queries are deliberately
  high-recall and each earns its place (rule 6 above). One DeepMind phrasing is enough; the
  variants return the same postings. Generic "Student Researcher" roles belong to Google, not
  DeepMind, unless the title says DeepMind.
- **DeepMind** — Greenhouse board `deepmind`. Only explicit student/intern/graduate technical
  roles; generic full-time research roles must not reach the LLM.
- **Qualcomm** — Eightfold. Europe = final country code in `standardizedLocations`
  (`"Cork, CO, IE"`). Descriptions need a per-job `position_details` call.
- **Apple** — see the cheat-sheet. Some guessed location IDs have historically returned
  misleading global results, so **keep the client-side Europe filter** even though the
  server-side filter looks exhaustive.
- **Databricks** — Greenhouse; large and noisy; job category lives in `metadata`. Zero EU
  student matches is a legitimate outcome when the only intern roles are US/PhD-only.
- **NVIDIA** — Workday; facet-only sweep. Trade-off: a role NVIDIA mis-tags in `workerSubType`
  will not be seen. That was a deliberate call (the free-text loop cost 13 requests for 0 extra
  jobs).
- **Snowflake** — Ashby; board skews senior/go-to-market and posts many non-technical interns
  (SDR, marketing, comms), so the technical-signal check is load-bearing.
- **OpenAI** — Ashby; ~60 European roles but internships/residencies are posted rarely, so
  **0 jobs is the normal steady state**, not a bug. Watch the `\bintern\b` boundary trap.
- **Palantir** — Lever; `commitment` unreliable alone. Deployment Strategist is left to the LLM
  via `promptOverride`.

---

## 7. Definition of done

```bash
npx tsc --noEmit                     # clean
npm run dry-run:sources:<key>        # sane job list, which you have READ
npm run dry-run:sources              # nothing else regressed
```

- [ ] `tsc` clean; source extends the right base; no Mongo/LLM/Telegram from a source.
- [ ] Registered in `src/sources/index.ts`; portal in `src/seed.ts`; dry-run scripts in
      `package.json` + README.
- [ ] `promptOverride` absent, or justified in one sentence that is not a restatement of the
      global prompt.
- [ ] **Request count measured (§5) and every request justified.** State the number.
- [ ] Page caps have headroom above the real page count.
- [ ] Job list read and sanity-checked; 0 jobs explained, not shrugged at.
- [ ] Committed in small logical commits. **Not seeded** — asked the user instead.
- [ ] Reported honestly: what you measured, what you assumed, what you did not check. If you did
      not run it, say so.
