import 'dotenv/config';

export const config = {
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27018/?directConnection=true',
  mongoDb: process.env.MONGODB_DB ?? 'hugin_jobs',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekModel: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChatIds: (process.env.TELEGRAM_CHAT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
