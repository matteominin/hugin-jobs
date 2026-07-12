# Hugin Jobs

A long-running service that, per portal config, periodically fetches a job-listing page over HTTP, extracts individual jobs, and asks an LLM (DeepSeek via the Vercel AI SDK) whether each job fits a described position. Matches are stored in MongoDB and pushed to Telegram subscribers.

## How it works

1. A scheduler loads enabled **portal** configs from MongoDB and runs each on its own `intervalSeconds` loop.
2. Each cycle: **produce** the job list (via the portal's `Source` — config-driven or a code source) → **dedup** against seen jobs → **judge** each new job with the LLM against the global position → **notify** Telegram subscribers on matches.

A **Source** is whatever produces a portal's `RawJob[]`. Most portals use the default config source (fetch + extract, no code). Portals with bespoke needs (prefiltering, detail-fetch, joining two APIs) use a small code source — see [Code sources](#code-sources).

## Setup

```bash
npm install
cp .env.example .env   # fill in DEEPSEEK_API_KEY, model, telegram token/chat ids
npm run seed           # inserts global settings + a sample portal
npm run dev            # start the scheduler
```

MongoDB is expected on `mongodb://localhost:27018` (local docker instance).

## Data model

- `settings` — single doc with the `globalPrompt` and `positionDescription` to match against.
- `portals` — one doc per job portal (request, extraction strategy/config, optional prompt override).
- `jobs` — extracted jobs, deduped per portal, with the LLM match verdict, enrichment, per-job LLM token usage (`usage.inputTokens` / `outputTokens` / `totalTokens`) and notification state.

## Configuration

A portal config picks a **transport** (how to fetch) and a **strategy** (how to parse), independently.

**Transport** — a `Fetcher` injected into the `JobRunner` (composition):

- **http** — the built-in HTTP client (`HttpFetcher`). Default.
- **playwright** — headless-browser rendering for JS-heavy pages (`PlaywrightFetcher`).

**Strategy** — extraction from the fetched content:

- **css** — `cheerio` selectors: `{ listSelector, baseUrl?, fields: { title, url, description?, ... } }`
- **json** — dot-paths into a JSON response: `{ jobsPath, fields: { title, url, ... } }`

The LLM is used only to **judge** each job and extract enrichment (tags, location, company, seniority, work mode, tech stack, salary) — not for extraction.

### Playwright (optional)

Playwright is an optional peer dependency, loaded lazily — projects that don't need it install nothing. To use the `playwright` transport:

```bash
npm i playwright && npx playwright install chromium
```

Add a new transport by implementing the `Fetcher` interface (`src/fetchers/`) and registering it in `getFetcher()`.

## Adding a portal

**In almost all cases you add a portal via config only — no code.** A portal is just a
document in the `portals` collection; `transport` and `strategy` are fields on that record.

You only need to write code when you need a **new transport** (a way to *fetch* other than
plain HTTP or Playwright — e.g. an OAuth API, a database, a queue): implement the `Fetcher`
interface in `src/fetchers/` and register it in `getFetcher()`. Extraction is always config
(`css`/`json`), never code.

### Portal document

```js
{
  name: "Portal name",            // unique; used for upsert
  enabled: true,                  // scheduler only runs enabled portals
  intervalSeconds: 3600,          // how often to re-fetch this portal
  transport: "http",              // "http" | "playwright"
  strategy: "json",               // "css"  | "json"
  request: {
    url: "https://…",
    method: "GET",                // optional (default GET)
    headers: { … },               // optional
    body: "…",                    // optional
    waitForSelector: ".job"       // optional, playwright-only: wait before reading
  },
  extraction: { /* depends on strategy, see below */ },
  company: "Acme",                // optional: fallback company if the LLM can't extract one
  promptOverride: "…"             // optional: extra criteria appended to the global prompt
}
```

**`json` extraction** — dot-paths into the response (`location.name` reads nested fields;
`jobsPath: ""` means the jobs array is at the root):

```js
extraction: {
  jobsPath: "jobs",
  fields: {
    title: "title",
    url: "absolute_url",
    description: "content",       // entity-encoded HTML is auto-decoded & stripped
    company: "company_name",
    location: "location.name"
  }
}
```

**`css` extraction** — `cheerio` selectors. In `fields`, a `@attr` suffix reads an attribute
(e.g. `a@href`); otherwise text content is used. `baseUrl` resolves relative links:

```js
extraction: {
  listSelector: ".job-card",
  baseUrl: "https://acme.com",
  fields: {
    title: ".job-title",
    url: "a@href",
    location: ".job-location",
    description: ".job-desc"
  }
}
```

### Examples

**Any Greenhouse-hosted company** (just change the board token in the URL):

```js
db.portals.insertOne({
  name: "Personio (Greenhouse)", enabled: true, intervalSeconds: 3600,
  transport: "http", strategy: "json",
  request: { url: "https://boards-api.greenhouse.io/v1/boards/personio/jobs?content=true", method: "GET" },
  extraction: { jobsPath: "jobs", fields: {
    title: "title", url: "absolute_url", description: "content",
    company: "company_name", location: "location.name" } }
})
```

**A JS-rendered careers page** — same as a `css` portal but with `transport: "playwright"`
(and optionally `request.waitForSelector` to wait for the jobs to appear).

### How to insert a portal

- **Directly with `mongosh`** on the `hugin_jobs` DB (as in the example above), or
- add it to `src/seed.ts` and run `npm run seed` (upserts by `name`).

New portals are picked up on the next scheduler start (`npm run dev`).

## Code sources

Config covers the common case (one fetch, css/json parse). When a portal needs something
config can't express — prefiltering before the LLM, per-job detail fetches, joining two APIs —
write a small **Source** class instead. The `JobRunner` still handles dedup → judge → notify;
the source only has to return `RawJob[]`.

1. Implement the `Source` interface in `src/sources/` (`produce(): Promise<RawJob[]>`).
2. Register it in `getSource()` (`src/sources/index.ts`) under a key.
3. On the portal record, set `source: "<key>"` (and optional `sourceOptions`). The config
   fields (`request`/`transport`/`strategy`/`extraction`) are then ignored.

Example — the built-in **`celonis`** source (`src/sources/celonis.ts`): Celonis' DXP API has a
`seniority` field but no descriptions; its Greenhouse board has descriptions but no seniority.
The source fetches both **once**, prefilters the DXP list to interns, and joins Greenhouse by id
for the descriptions — two requests total, no per-job detail calls, and ~90% fewer jobs sent to
the LLM. Its portal record is just:

```js
{ name: "Celonis (interns)", enabled: true, intervalSeconds: 3600,
  source: "celonis", sourceOptions: { seniorities: ["Working Student & Intern"] } }
```
