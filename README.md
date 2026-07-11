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

Each portal config supports three extraction strategies:

- **css** — `cheerio` selectors: `{ listSelector, baseUrl?, fields: { title, url, description?, ... } }`
- **json** — dot-paths into a JSON response: `{ jobsPath, fields: { title, url, ... } }`
- **llm** — hands page text to the LLM to return a job array.
