import 'dotenv/config';

function envFlag(name: string): boolean {
  return /^(1|true|yes|on)$/i.test(process.env[name] ?? '');
}

function envList(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  port: Math.max(1, Number(process.env.PORT ?? '3000') || 3000),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27018/?directConnection=true',
  mongoDb: process.env.MONGODB_DB ?? 'hugin_jobs',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekModel: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
  /** how many jobs to judge concurrently per batch */
  judgeConcurrency: Math.max(1, Number(process.env.JUDGE_CONCURRENCY ?? '5') || 5),
  /**
   * how many portals may run at once. 1 = a strict serial queue, which is what a
   * small server wants: a portal cycle holds a whole board's JSON in memory and
   * fans out LLM calls, so overlapping them is what actually spikes the box.
   */
  portalConcurrency: Math.max(1, Number(process.env.PORTAL_CONCURRENCY ?? '1') || 1),
  /**
   * spread the first run of each portal over this many ms, so a restart doesn't
   * queue every portal at t=0 and then run them back-to-back.
   */
  portalStaggerMs: Math.max(0, Number(process.env.PORTAL_STAGGER_MS ?? '15000') || 0),
  /** per-request HTTP timeout in ms, so a stalled fetch can't hang a portal */
  httpTimeoutMs: Math.max(1000, Number(process.env.HTTP_TIMEOUT_MS ?? '30000') || 30000),
  /** consecutive fetch failures before a portal is auto-disabled */
  maxFetchFailures: Math.max(1, Number(process.env.MAX_FETCH_FAILURES ?? '3') || 3),
  /** run one scheduler cycle and exit */
  runOnce: envFlag('HUGIN_RUN_ONCE'),
  /** fetch/judge without writing MongoDB jobs/portal state or sending Telegram */
  dryRun: envFlag('HUGIN_DRY_RUN'),
  /** in dry-run mode, fetch sources and dedup only; do not call the LLM */
  dryRunSkipLlm: envFlag('HUGIN_DRY_RUN_SKIP_LLM'),
  /** optional comma-separated portal source/name filter, useful for dry-runs */
  portalFilter: envList('HUGIN_PORTAL'),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChatIds: (process.env.TELEGRAM_CHAT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
