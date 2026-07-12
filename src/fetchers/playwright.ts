import type { RequestConfig } from '../types.js';
import type { Fetcher } from './index.js';

/**
 * Renders a page with a headless browser and returns its HTML. Playwright is an
 * optional dependency, loaded lazily so projects that don't need it pay nothing.
 * Install with: `npm i playwright && npx playwright install chromium`.
 */
export class PlaywrightFetcher implements Fetcher {
  async fetch(req: RequestConfig): Promise<string> {
    let chromium: any;
    try {
      // @ts-ignore optional peer dependency — may not be installed
      ({ chromium } = await import('playwright'));
    } catch {
      throw new Error(
        'PlaywrightFetcher requires "playwright". Install it with: ' +
          'npm i playwright && npx playwright install chromium',
      );
    }

    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ extraHTTPHeaders: req.headers });
      const page = await context.newPage();
      await page.goto(req.url, { waitUntil: 'networkidle' });
      if (req.waitForSelector) {
        await page.waitForSelector(req.waitForSelector);
      }
      return await page.content();
    } finally {
      await browser.close();
    }
  }
}
