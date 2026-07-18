import { config } from '../config.js';
import { close, connect } from '../db.js';
import { createAdminApp } from './server.js';

/**
 * Standalone entry for the admin dashboard. It connects to Mongo and serves the
 * API + UI, but never starts the scheduler, the Telegram listener, or any job
 * cycle — the only writes it performs are the ones an admin triggers explicitly
 * (toggling a portal). Portal "tests" are fetch-only and write nothing.
 */
async function main(): Promise<void> {
  await connect();
  const app = createAdminApp();
  const server = app.listen(config.adminPort, () => {
    console.log(`[admin] dashboard listening on :${config.adminPort}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[admin] ${signal} received, shutting down`);
    server.close();
    await close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[admin] fatal:', err);
  process.exit(1);
});
