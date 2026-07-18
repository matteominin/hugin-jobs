import { createAdminApp } from './admin/server.js';
import { config } from './config.js';
import { close, connect } from './db.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { startTelegramCommands, stopTelegramCommands } from './telegram.js';

async function main(): Promise<void> {
  await connect();
  await startScheduler();
  if (config.runOnce) {
    await close();
    return;
  }

  // The scheduler process also serves the admin dashboard + API on the same
  // port, so one Render service covers both. (The standalone src/admin/index.ts
  // remains for running the dashboard on its own.)
  const server = createAdminApp().listen(config.port, () => {
    console.log(`[server] admin dashboard + API listening on :${config.port}`);
  });
  startTelegramCommands();

  const shutdown = async (signal: string) => {
    console.log(`\n[main] ${signal} received, shutting down`);
    stopScheduler();
    stopTelegramCommands();
    server.close();
    await close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[main] fatal:', err);
  process.exit(1);
});
