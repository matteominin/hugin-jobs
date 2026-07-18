import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import MongoStore from 'connect-mongo';
import express, { type Express } from 'express';
import session from 'express-session';
import passport from 'passport';
import { config } from '../config.js';
import { api } from './routes.js';
import { configurePassport } from './auth.js';

/** Absolute path to the built React app (admin-ui/dist), repo-root relative. */
const uiDir = fileURLToPath(new URL('../../admin-ui/dist', import.meta.url));

/**
 * Build the admin Express app: session + Passport, the JSON API under /api, and
 * the built React SPA as static files with a catch-all fallback to index.html.
 * The DB must already be connected (the session store and routes both use it).
 */
export function createAdminApp(): Express {
  configurePassport();
  const app = express();

  // Render (and most PaaS) terminate TLS at a proxy and forward plain HTTP, so
  // the app must trust the proxy for req.secure / a Secure cookie to work.
  if (config.secureCookies) app.set('trust proxy', 1);

  app.use(express.json());
  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: config.mongoUri, dbName: config.mongoDb }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.secureCookies,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

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
