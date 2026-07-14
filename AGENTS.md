# AGENTS.md

Guidance for coding agents working on this repo.

## Project Shape

Hugin Jobs is a TypeScript/Node service that polls company career sources, stores deduped jobs in MongoDB, asks DeepSeek whether unjudged jobs match the target role, and sends suitable matches to Telegram.

Core flow:

```text
enabled portals from MongoDB
-> Source.produce()
-> dedup by portalId + url/title hash
-> LLM judge for unjudged jobs
-> Telegram notify when suitable
```

Important files:

- `src/index.ts` starts the service.
- `src/scheduler.ts` loads enabled portals and runs each portal loop.
- `src/runner.ts` performs produce, dedup, judge, notify.
- `src/sources/` contains one source per company.
- `src/sources/index.ts` registers source keys.
- `src/seed.ts` seeds settings and portal documents.
- `src/llm/judge.ts` builds the LLM prompt and structured result.
- `src/telegram.ts` sends Telegram messages.

## Safety First

Do not run the live scheduler casually. A normal run can write MongoDB records, spend LLM tokens, and send Telegram messages.

Use dry-run commands first:

```bash
npm run dry-run:sources
npm run dry-run
npm run dry-run:sources:google
npm run dry-run:google
npm run dry-run:sources:qualcomm
npm run dry-run:qualcomm
npm run dry-run:sources:apple
npm run dry-run:apple
```

Dry-run behavior:

- reads MongoDB settings, portals and existing jobs
- includes enabled seed-only portals in memory
- does not insert jobs
- does not update `match`, `enrichment`, `usage`, `notified`, `lastRunAt`, or failure counters
- does not auto-disable portals
- does not send Telegram

`npm run dry-run:sources` also skips LLM calls. Prefer it for scraper work.

To test one portal:

```bash
HUGIN_PORTAL=google npm run dry-run:sources
HUGIN_PORTAL=google npm run dry-run
HUGIN_PORTAL=qualcomm npm run dry-run:sources
HUGIN_PORTAL=qualcomm npm run dry-run
HUGIN_PORTAL=apple npm run dry-run:sources
HUGIN_PORTAL=apple npm run dry-run
```

`HUGIN_PORTAL` accepts comma-separated source keys or portal-name substrings. Exact source-key matches take precedence, so `google` means the `google` source, not `Google DeepMind`.

## Running And Activation

Common commands:

```bash
npm install
npm run build
npm run seed
npm run dev
```

Run `npm run seed` only when you intentionally want to upsert settings and portals into the configured MongoDB. The scheduler loads enabled portals only at startup, so restart the service after seeding or changing enabled portal documents.

Never paste full MongoDB URIs or Telegram tokens into chat/log summaries. Startup logs may include the Mongo URI; redact credentials when reporting output.

## Adding Or Editing Sources

Each source should extend `BaseSource` and return `RawJob[]` only. Sources should not write MongoDB, call the LLM, or send Telegram.

For a new source:

1. Add `src/sources/<company>.ts`.
2. Register it in `src/sources/index.ts`.
3. Add a portal to `src/seed.ts`.
4. Add a portal-specific `promptOverride` when the company needs special matching rules.
5. Run `npm run build`.
6. Run source-only dry-run before any live run.

Source filtering philosophy:

- Prefer high recall for technical, Europe-relevant, student/graduate/intern-ish roles.
- Filter obvious junk before the LLM: non-Europe locations, sales/marketing/HR/legal/design, apprenticeships, STEP, gReach, postdoc, principal/manager/director, senior/staff, and clear senior level markers like `III`.
- Let the LLM decide ambiguous cases, especially research/SWE roles where the title alone does not prove internship eligibility.
- Keep descriptions short enough for the LLM; use `htmlToText()` for HTML and entity decoding.
- Use official APIs or embedded structured data where possible. Avoid browser automation unless there is no practical HTTP source.
- Deduplicate source output by stable job ID or URL when a query can return the same job multiple times.

Google-specific notes:

- Google Careers embeds job tuples in result HTML.
- Pagination uses `page=2`, `page=3`, etc.; `start=20` does not work.
- Google source intentionally queries multiple high-recall terms and dedupes by Google job ID.
- Current Google filtering happens before the LLM; LLM judging happens only in the runner.

DeepMind-specific notes:

- DeepMind has a Greenhouse board at `https://boards-api.greenhouse.io/v1/boards/deepmind/jobs?content=true`.
- The standalone DeepMind source should only keep explicit student/intern/graduate technical roles.
- Generic Google Student Researcher roles should stay under Google unless the title explicitly says DeepMind.

Qualcomm-specific notes:

- Qualcomm careers uses Eightfold PCS at `https://careers.qualcomm.com/api/pcsx/search?domain=qualcomm.com`.
- Pagination uses the `start` query param in increments of returned positions.
- Full descriptions are at `https://careers.qualcomm.com/api/pcsx/position_details?domain=qualcomm.com&position_id=<id>`.
- Filter Europe using the final country code in `standardizedLocations`, e.g. `Cork, CO, IE`.

Apple-specific notes:

- Apple Jobs uses `POST https://jobs.apple.com/api/v1/search` and `GET https://jobs.apple.com/api/v1/jobDetails/<jobNumber>`.
- First hit `https://jobs.apple.com/en-us/search` to collect the lightweight `jobs`/routing cookies before API calls.
- Search location filters use IDs such as `postLocation-IRL`, `postLocation-GBR`, and `postLocation-DEU`; some guessed country IDs return misleading global results, so keep client-side Europe filtering.
- The HTML search route also embeds `window.__staticRouterHydrationData`; it is a fallback clue, but the source should prefer the JSON endpoints.

## LLM And Prompt

Seeded prompt/settings live in `src/seed.ts`, then are stored in MongoDB. Editing `src/seed.ts` does not affect a running bot until `npm run seed` is run and the scheduler is restarted.

The global target is Europe-based internship/student/working-student technical roles in software engineering, software development, research engineering, or research. A mandatory PhD-only role should be rejected.

## Verification Checklist

Before handing off scraper changes:

```bash
npm run build
npm run dry-run:sources:<portal>
```

If LLM behavior needs verification:

```bash
npm run dry-run:<portal>
```

If no portal-specific script exists:

```bash
HUGIN_PORTAL=<source-key> npm run dry-run:sources
HUGIN_PORTAL=<source-key> npm run dry-run
```

Confirm from logs:

- expected portal count is selected
- source produces plausible candidates
- dry-run says writes and `lastRunAt` updates are skipped
- Telegram is not called in dry-run
