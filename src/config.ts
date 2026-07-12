import 'dotenv/config';

export const config = {
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27018/?directConnection=true',
  mongoDb: process.env.MONGODB_DB ?? 'hugin_jobs',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekModel: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
  /** how many jobs to judge concurrently per batch */
  judgeConcurrency: Math.max(1, Number(process.env.JUDGE_CONCURRENCY ?? '5') || 5),
  /** per-request HTTP timeout in ms, so a stalled fetch can't hang a portal */
  httpTimeoutMs: Math.max(1000, Number(process.env.HTTP_TIMEOUT_MS ?? '30000') || 30000),
  /** consecutive fetch failures before a portal is auto-disabled */
  maxFetchFailures: Math.max(1, Number(process.env.MAX_FETCH_FAILURES ?? '3') || 3),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChatIds: (process.env.TELEGRAM_CHAT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
