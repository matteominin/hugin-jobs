import { config } from './config.js';
import { close, connect } from './db.js';
import { startScheduler, stopScheduler } from './scheduler.js';

async function main(): Promise<void> {
  await connect();
  await startScheduler();
  if (config.runOnce) {
    await close();
    return;
  }

  const shutdown = async (signal: string) => {
    console.log(`\n[main] ${signal} received, shutting down`);
    stopScheduler();
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
