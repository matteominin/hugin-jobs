# Hugin Jobs

A long-running service that, per portal config, periodically fetches a job-listing page over HTTP, extracts individual jobs, and asks an LLM (DeepSeek via the Vercel AI SDK) whether each job fits a described position. Matches are stored in MongoDB and pushed to Telegram subscribers.

## How it works

1. A scheduler loads enabled **portal** configs from MongoDB and runs each on its own `intervalSeconds` loop.
2. Each cycle: **fetch** the portal URL → **extract** jobs (`css` / `json` / `llm` strategy) → **dedup** against seen jobs → **judge** each new job with the LLM against the global position → **notify** Telegram subscribers on matches.

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
- `jobs` — extracted jobs, deduped per portal, with the LLM match verdict and notification state.

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
