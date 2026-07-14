# Hugin Jobs

A long-running service that periodically fetches each job poster's listings, and asks an LLM (DeepSeek via the Vercel AI SDK) whether each job fits a described position. Matches are stored in MongoDB and pushed to Telegram subscribers.

## How it works

1. A scheduler loads enabled **portal** documents from MongoDB and runs each on its own `intervalSeconds` loop.
2. Each cycle: **produce** the job list (via the portal's code **Source**) → **dedup** against seen jobs → **judge** each new job with the LLM against the global position → **notify** Telegram subscribers on matches.

A **Source** is a small class that produces a portal's `RawJob[]` — it fetches from the poster's API/site however it needs (prefiltering, paging, joining two APIs, scraping) and shapes the result. Every poster has one; see [Sources](#sources). A portal document just names the source and holds per-portal knobs (interval, prompt override, source options).

## Setup

```bash
npm install
cp .env.example .env   # fill in DEEPSEEK_API_KEY, model, telegram token/chat ids
npm run seed           # inserts global settings + a sample portal
npm run dev            # start the scheduler
```

MongoDB is expected on `mongodb://localhost:27018` (local docker instance).

## Safe testing

Use dry-run mode to test sources and matching without changing stored jobs, portal state or
sending Telegram messages:

```bash
npm run dry-run:sources  # fetch + dedup only; no LLM calls
npm run dry-run          # fetch + dedup + LLM judging; still no writes or Telegram
npm run dry-run:sources:google  # test only the Google source, no LLM calls
npm run dry-run:google          # test only Google with LLM judging
npm run dry-run:sources:qualcomm  # test only Qualcomm, no LLM calls
npm run dry-run:qualcomm          # test only Qualcomm with LLM judging
npm run dry-run:sources:apple     # test only Apple, no LLM calls
npm run dry-run:apple             # test only Apple with LLM judging
npm run dry-run:sources:databricks  # test only Databricks, no LLM calls
npm run dry-run:databricks          # test only Databricks with LLM judging
npm run dry-run:sources:nvidia    # test only NVIDIA, no LLM calls
npm run dry-run:nvidia            # test only NVIDIA with LLM judging
npm run dry-run:sources:snowflake # test only Snowflake, no LLM calls
npm run dry-run:snowflake         # test only Snowflake with LLM judging
npm run dry-run:sources:openai    # test only OpenAI, no LLM calls
npm run dry-run:openai            # test only OpenAI with LLM judging
npm run dry-run:sources:palantir  # test only Palantir, no LLM calls
npm run dry-run:palantir          # test only Palantir with LLM judging
```

Both commands run enabled portals once and exit. Dry-run still reads MongoDB settings, portals
and existing jobs so it can use the same config and report what would be new. It also adds
enabled seed portals in memory when they have not been inserted yet, so new sources can be
tested before running `npm run seed`.

Set `HUGIN_PORTAL=google,deepmind` with any dry-run command to limit by source key or portal
name substring.

## Data model

- `settings` — single doc with the `globalPrompt` and `positionDescription` to match against.
- `portals` — one doc per job poster: `{ name, enabled, intervalSeconds, source, sourceOptions?, company?, promptOverride? }`.
- `jobs` — jobs produced by a source, deduped per portal, with the LLM match verdict, enrichment, per-job LLM token usage (`usage.inputTokens` / `outputTokens` / `totalTokens`) and notification state.

## Portal document

Fetching lives entirely in code (a **Source**); the portal document only names the source and
holds the per-poster knobs:

```js
{
  name: "Acme (interns)",   // unique; used for upsert
  enabled: true,            // scheduler only runs enabled portals
  intervalSeconds: 1200,    // how often to re-fetch this poster
  source: "acme",           // key of the code source in getSource() (src/sources/index.ts)
  sourceOptions: { … },     // optional: free-form options passed to the source
  company: "Acme",          // optional: fallback company if the LLM can't extract one
  promptOverride: "…"       // optional: extra matching criteria for THIS poster,
}                           //           appended to the global position description
```

`intervalSeconds` and `promptOverride` are the two per-portal levers: run a fast-moving poster
more often, and add poster-specific criteria (e.g. "only the Dublin office") without touching
the global prompt.

Insert a portal by adding it to `src/seed.ts` and running `npm run seed` (upserts by `name`),
or directly with `mongosh`. New portals are picked up on the next scheduler start.

## Sources

A source is a small class that fetches a poster's jobs and returns `RawJob[]`. The `JobRunner`
handles dedup → judge → notify; the source only has to produce the list. To add a poster:

1. Write a `BaseSource` subclass in `src/sources/` and implement `produce()`.
2. Register it in `getSource()` (`src/sources/index.ts`) under a key.
3. Add a portal document with `source: "<key>"`.

`BaseSource` (`src/sources/base.ts`) provides the boilerplate — `fetchText`/`fetchJson` (browser
UA + timeout baked in), `option(key, fallback)` for typed `sourceOptions` access, and
`this.portal`. A typical source is a few lines:

```ts
export class AcmeSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const board = this.option<string>('board', 'acme');
    const { jobs = [] } = await this.fetchJson<{ jobs?: AcmeJob[] }>(
      `https://acme.example/api/jobs?board=${board}`,
    );
    return jobs
      .filter((j) => /\bintern(ship)?\b/i.test(j.title)) // cheap prefilter cuts LLM load
      .map((j) => ({
        title: j.title,
        url: j.url,
        location: j.location,
        description: htmlToText(j.content),
        company: 'Acme',
      }));
  }
}
```

**If the poster uses a job-board vendor, extend the vendor base instead of `BaseSource`** — it
already does the fetch, the mapping and the Europe check, so the source is just a `keep()`:

- `GreenhouseSource` (`greenhouse.ts`) — used by `stripe`, `databricks`, `deepmind`.
- `AshbySource` (`ashby.ts`) — used by `snowflake`, `openai`.

```ts
export class AcmeSource extends GreenhouseSource {
  protected readonly defaultBoard = 'acme';
  protected readonly companyName = 'Acme';

  protected keep(job: GreenhouseJob): boolean {
    return /\bintern(ship)?\b/i.test(job.title) && isEuropeLocationText(job.location?.name);
  }
}
```

The convention across the built-in sources (`amazon`, `spotify`, `uber`, `bolt`, `stripe`,
`microsoft`): fetch as few requests as possible, **prefilter cheaply** (title regex, country
code or name — see `src/util/europe.ts`) to cut most jobs before the LLM, and let the LLM judge apply
the software/research + Europe + education rules on what's left. The LLM is used only to
**judge** and extract enrichment (tags, location, company, seniority, work mode, tech stack,
salary) — never to fetch or parse listings.
