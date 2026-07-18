# Hugin Jobs

A long-running service that periodically fetches each job poster's listings, and asks an LLM (DeepSeek via the Vercel AI SDK) whether each job fits a described position. Matches are stored in MongoDB and pushed to Telegram subscribers.

## How it works

1. A scheduler loads enabled **portal** documents from MongoDB and runs each on its own `intervalSeconds` loop.
2. Each cycle: **produce** the job list (via the portal's code **Source**) → **dedup** against seen jobs → **judge** each new job with the LLM against the global position → **notify** Telegram subscribers on matches.

A **Source** is a small class that produces a portal's `RawJob[]` — it fetches from the poster's API/site however it needs (prefiltering, paging, joining two APIs, scraping) and shapes the result. Every poster has one; see [Sources](#sources). A portal document just names the source and holds per-portal knobs (interval, prompt override, source options).

## Telegram commands

The bot also listens for commands (via `getUpdates` long-polling, so no public URL or webhook is
needed). Only chats listed in `TELEGRAM_CHAT_IDS` are answered; anything else is logged and
ignored. The listener is off in dry-run and `HUGIN_RUN_ONCE` modes.

| Command | Does |
| --- | --- |
| `/status`, `/ping` | uptime, job counts, and each enabled portal's last run / install / failure state |
| `/help` | lists the commands |

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
npm run dry-run:sources:cloudflare  # test only Cloudflare, no LLM calls
npm run dry-run:cloudflare          # test only Cloudflare with LLM judging
npm run dry-run:sources:netflix   # test only Netflix, no LLM calls
npm run dry-run:netflix           # test only Netflix with LLM judging
npm run dry-run:sources:asml      # test only ASML, no LLM calls
npm run dry-run:asml              # test only ASML with LLM judging
npm run dry-run:sources:adobe     # test only Adobe, no LLM calls
npm run dry-run:adobe             # test only Adobe with LLM judging
npm run dry-run:sources:airbnb    # test only Airbnb, no LLM calls
npm run dry-run:airbnb            # test only Airbnb with LLM judging
npm run dry-run:sources:discord   # test only Discord, no LLM calls
npm run dry-run:discord           # test only Discord with LLM judging
npm run dry-run:sources:notion    # test only Notion, no LLM calls
npm run dry-run:notion            # test only Notion with LLM judging
npm run dry-run:sources:dropbox   # test only Dropbox, no LLM calls
npm run dry-run:dropbox           # test only Dropbox with LLM judging
npm run dry-run:sources:github    # test only GitHub, no LLM calls
npm run dry-run:github            # test only GitHub with LLM judging
npm run dry-run:sources:atlassian # test only Atlassian, no LLM calls
npm run dry-run:atlassian         # test only Atlassian with LLM judging
npm run dry-run:sources:coinbase  # test only Coinbase, no LLM calls
npm run dry-run:coinbase          # test only Coinbase with LLM judging
npm run dry-run:sources:datadog   # test only Datadog, no LLM calls
npm run dry-run:datadog           # test only Datadog with LLM judging
npm run dry-run:sources:mongodb   # test only MongoDB, no LLM calls
npm run dry-run:mongodb           # test only MongoDB with LLM judging
npm run dry-run:sources:figma     # test only Figma, no LLM calls
npm run dry-run:figma             # test only Figma with LLM judging
npm run dry-run:sources:gitlab    # test only GitLab, no LLM calls
npm run dry-run:gitlab            # test only GitLab with LLM judging
npm run dry-run:sources:skyscanner # test only Skyscanner, no LLM calls
npm run dry-run:skyscanner        # test only Skyscanner with LLM judging
npm run dry-run:sources:pinterest # test only Pinterest, no LLM calls
npm run dry-run:pinterest         # test only Pinterest with LLM judging
npm run dry-run:sources:cohere    # test only Cohere, no LLM calls
npm run dry-run:cohere            # test only Cohere with LLM judging
npm run dry-run:sources:perplexity # test only Perplexity, no LLM calls
npm run dry-run:perplexity        # test only Perplexity with LLM judging
npm run dry-run:sources:deliveroo # test only Deliveroo, no LLM calls
npm run dry-run:deliveroo         # test only Deliveroo with LLM judging
npm run dry-run:sources:adyen     # test only Adyen, no LLM calls
npm run dry-run:adyen            # test only Adyen with LLM judging
npm run dry-run:sources:flowtraders # test only Flow Traders, no LLM calls
npm run dry-run:flowtraders      # test only Flow Traders with LLM judging
npm run dry-run:sources:jetbrains # test only JetBrains, no LLM calls
npm run dry-run:jetbrains        # test only JetBrains with LLM judging
npm run dry-run:sources:elastic   # test only Elastic, no LLM calls
npm run dry-run:elastic          # test only Elastic with LLM judging
npm run dry-run:sources:graphcore # test only Graphcore, no LLM calls
npm run dry-run:graphcore        # test only Graphcore with LLM judging
npm run dry-run:sources:twilio    # test only Twilio, no LLM calls
npm run dry-run:twilio           # test only Twilio with LLM judging
npm run dry-run:sources:celonis   # test only Celonis, no LLM calls
npm run dry-run:celonis          # test only Celonis with LLM judging
npm run dry-run:sources:miro      # test only Miro, no LLM calls
npm run dry-run:miro             # test only Miro with LLM judging
npm run dry-run:sources:linear    # test only Linear, no LLM calls
npm run dry-run:linear           # test only Linear with LLM judging
npm run dry-run:sources:confluent # test only Confluent, no LLM calls
npm run dry-run:confluent        # test only Confluent with LLM judging
```

Both commands run enabled portals once and exit. Dry-run still reads MongoDB settings, portals
and existing jobs so it can use the same config and report what would be new. It also adds
enabled seed portals in memory when they have not been inserted yet, so new sources can be
tested before running `npm run seed`.

Set `HUGIN_PORTAL=google,deepmind` with any dry-run command to limit by source key or portal
name substring.

## Data model

- `settings` — single doc with the `globalPrompt` and `positionDescription` to match against, plus the `activeHours` window (see [Active hours](#active-hours)).
- `portals` — one doc per job poster: `{ name, enabled, status?, intervalSeconds, source, sourceOptions?, company?, promptOverride? }`.
- `jobs` — jobs produced by a source, deduped per portal, with the LLM match verdict, enrichment, per-job LLM token usage (`usage.inputTokens` / `outputTokens` / `totalTokens`) and notification state. Jobs recorded by an `install` cycle carry `backfilled: true` and are never judged or notified.

## Active hours

Portals only run inside a daily window, configured in the `settings` document — there is no point
fetching, judging and pushing Telegram messages at 4am. The default is **06:00 to midnight, Rome
time**:

```js
{
  activeHours: {
    startHour: 6,           // inclusive
    endHour: 24,            // exclusive; 24 = midnight
    timezone: "Europe/Rome" // IANA name; the hours are local to this zone (DST-aware)
  }
}
```

Change it live — the scheduler re-reads the window before every cycle, so no restart is needed:

```js
db.settings.updateOne({}, { $set: { "activeHours.startHour": 8 } })
```

Outside the window a cycle is skipped entirely (no fetch, no LLM call, no notification) and the
portal sleeps until the window reopens; nothing is queued up to fire at 06:00. A window whose
`endHour` is *before* its `startHour` wraps midnight (`22`→`6` = overnight only), and
`startHour === endHour` means always on. Invalid hours or an unknown timezone are logged and fall
back to the defaults rather than stopping the service.

`npm run seed` writes `activeHours` **only when the field is missing**, so a window tuned in the
DB survives a re-seed. Dry-runs ignore the window entirely — they never write or notify.

## Portal document

Fetching lives entirely in code (a **Source**); the portal document only names the source and
holds the per-poster knobs:

```js
{
  name: "Acme (interns)",   // unique; used for upsert
  enabled: true,            // scheduler only runs enabled portals
  status: "install",        // optional: baseline the current jobs, then flip to "running"
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

`promptOverride` is **optional and usually unnecessary** — it exists for a rule the global
position description can't express, like "an OpenAI *Residency* counts as an internship". Don't
restate the global rules (internship, Europe, no PhD-only, technical) in it: the judge already
applies them, and a copy that drifts out of sync is worse than none.

Insert a portal by adding it to `src/seed.ts` and running `npm run seed` (upserts by `name`),
or directly with `mongosh`. New portals are picked up on the next scheduler start.

### `status`: install a portal without a notification blast

A brand-new portal's first fetch returns the poster's whole back-catalogue — judging it would
burn tokens on a hundred old listings and push every match to Telegram at once. `status`
prevents that:

- **`install`** — the next successful cycle only *records* the portal's current jobs as a
  baseline: they are stored with `backfilled: true`, and **no LLM call and no notification**
  happen. The portal then flips itself to `running`, so the cycle after it judges and notifies
  only jobs that appear *after* the install.
- **`running`** (the default when the field is absent) — the normal produce → judge → notify cycle.

`npm run seed` sets `status` **only when it inserts** a portal, so a new poster added to
`src/seed.ts` installs itself on first run, while re-seeding never knocks a live portal back
into `install`. To re-baseline an existing portal by hand (e.g. after widening its source and
not wanting the newly-visible old jobs announced):

```js
db.portals.updateOne({ name: "Acme (interns)" }, { $set: { status: "install" } })
```

The flip to `running` only happens after the jobs are actually stored, so a portal whose install
cycle fails to fetch stays in `install` and retries the baseline. Dry-runs ignore `status`
entirely — they never write or notify, so they judge as usual and let you test a new source
before it is seeded.

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

### Keep the request count down

A cycle should be as few requests as it can be — most boards are one. When a search API forces
a fan-out:

- **Prefer one structured sweep to a loop of free-text queries.** If the API filters by country
  or worker-type facets, page that once: `apple` takes all 28 European countries in a single
  `locations` filter, `nvidia` crosses the Europe facet with Workday's Intern/New-College-Grad
  subtype. A keyword loop layered on top mostly re-finds what the sweep already returned.
- **Drop phrasings the head term subsumes.** Qualcomm's Eightfold search matches on tokens, so
  "intern" already covers "software intern" and "internship".
- **Measure, don't guess.** Wrap `globalThis.fetch` to count requests and diff the job set with
  and without a query before keeping it. Google is the counter-example worth knowing: its
  free-text queries each pull genuinely different roles and its pagination is real, so its
  ~30 requests are load-bearing.
- **Check the page cap can't truncate.** A sweep capped at N pages that quietly stops at N is a
  silent miss, not an error — leave real headroom above the actual page count.
