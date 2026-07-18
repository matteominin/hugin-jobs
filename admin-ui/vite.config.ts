import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// During `admin:ui:dev` the API is served by the Express admin server on :4000;
// proxy /api there so session cookies stay same-origin. `build` emits to dist/,
// which the Express server serves in production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
