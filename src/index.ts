import { close, connect } from './db.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { startServer } from './server.js';

async function main(): Promise<void> {
  await connect();
  await startScheduler();
  const server = startServer();

  const shutdown = async (signal: string) => {
    console.log(`\n[main] ${signal} received, shutting down`);
    stopScheduler();
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
