import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Express } from 'express';
import { config } from '../config.js';
import { api } from './routes.js';

/** Absolute path to the built React app (admin-ui/dist), repo-root relative. */
const uiDir = fileURLToPath(new URL('../../admin-ui/dist', import.meta.url));

/**
 * Build the admin Express app: (optional) CORS for a cross-origin frontend, the
 * JSON API under /api (JWT-authenticated, stateless), and the built React SPA as
 * static files with a catch-all fallback to index.html. The DB must already be
 * connected (the routes use it).
 *
 * Auth is bearer-token based, so no session store or cookies are involved — the
 * frontend can be served from here (same origin) or hosted elsewhere (e.g.
 * Firebase) and pointed at this API via ADMIN_CORS_ORIGIN.
 */
export function createAdminApp(): Express {
  const app = express();

  if (config.adminCorsOrigins.length > 0) {
    app.use(
      cors({
        origin: config.adminCorsOrigins,
        methods: ['GET', 'POST', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      }),
    );
  }

  app.use(express.json());
  app.use('/api', api);

  // Serve the built SPA when it exists; fall back to index.html for client routes.
  if (existsSync(uiDir)) {
    app.use(express.static(uiDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(fileURLToPath(new URL('../../admin-ui/dist/index.html', import.meta.url)));
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .type('text/plain')
        .send('Admin API running. Build the UI with `npm run admin:ui:build`.');
    });
  }

  return app;
}
