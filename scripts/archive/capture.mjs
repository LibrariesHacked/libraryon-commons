/**
 * @file Optional visual evidence capture, not a static-site builder.
 * Writes desktop/mobile DOM, screenshots and embedded HAR bodies per collection.
 * A separate context blocks live networking to smoke-test the first captured URL.
 * @example node capture.mjs --priority --mobile --collection browser-priority
 */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { origin, digest, allowed } from './collect.mjs';

const { values } = parseArgs({
  options: {
    output: { type: 'string', default: 'archive' },
    limit: { type: 'string', default: '8' },
    all: { type: 'boolean', default: false },
    editorial: { type: 'boolean', default: false },
    priority: { type: 'boolean', default: false },
    collection: { type: 'string', default: 'browser' },
    url: { type: 'string', multiple: true },
    mobile: { type: 'boolean', default: false }
  }
});
if (!/^[a-zA-Z0-9_-]+$/.test(values.collection)) throw new Error('Invalid collection name');
const output = path.resolve(values.output, values.collection);
await mkdir(output, { recursive: true });
const seeds = (await readFile(path.resolve(values.output, 'seeds.txt'), 'utf8')).trim().split('\n');
const representatives = [
  `${origin}/`,
  `${origin}/libraries`,
  `${origin}/events`,
  `${origin}/about`,
  `${origin}/books-and-more`,
  `${origin}/grants`,
  seeds.find((url) => /\/libraries\/[^/]+$/.test(url)),
  seeds.find((url) => /\/libraries\/[^/]+\/[^/]+$/.test(url))
].filter(Boolean);
let candidates = values.all ? seeds : representatives;
if (values.editorial || values.priority) {
  candidates = (await readFile(path.resolve(values.output, 'unique-seeds.txt'), 'utf8'))
    .trim()
    .split('\n');
  if (values.priority)
    candidates = candidates.filter((url) => /pressplay|special-collections|grants/.test(url));
}
if (values.url) candidates = values.url;
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1) throw new Error('Limit must be a positive integer');
const urls = [...new Set(candidates)]
  .filter((url) => allowed(url))
  .slice(0, values.all || values.editorial || values.priority ? undefined : limit);
const browser = await chromium.launch();
const report = [];
let captureFailed = false;
try {
  for (const viewport of values.mobile
    ? [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 }
      ]
    : [{ width: 1440, height: 1000 }]) {
    const label = viewport.width === 390 ? 'mobile' : 'desktop';
    const harPath = path.join(output, `${label}.har`);
    const context = await browser.newContext({
      viewport,
      serviceWorkers: 'block',
      recordHar: { path: harPath, mode: 'full', content: 'embed' }
    });
    await context.route(
      /google-analytics\.com|googletagmanager\.com|connect\.facebook\.net|doubleclick\.net/,
      (route) => route.abort()
    );
    const page = await context.newPage();
    const requests = new Set();
    page.on('request', (request) => requests.add(request.url()));
    for (const [index, url] of urls.entries()) {
      const failures = [];
      const onResponse = (response) => {
        if (response.status() >= 400)
          failures.push({ url: response.url(), status: response.status() });
      };
      page.on('response', onResponse);
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        const reject = page.getByRole('button', { name: 'I do not accept', exact: true });
        if (await reject.isVisible()) await reject.click();
        await page.evaluate(async () => {
          await document.fonts.ready;
          for (
            let position = 0;
            position < Math.min(document.body.scrollHeight, 30000);
            position += 700
          ) {
            scrollTo(0, position);
            await new Promise((resolve) => setTimeout(resolve, 75));
          }
          scrollTo(0, 0);
        });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        const name = `${digest(url).slice(0, 16)}-${label}`;
        await writeFile(path.join(output, `${name}.html`), await page.content());
        await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
        const metadata = await page.evaluate(() => ({
          title: document.title,
          textLength: document.body.innerText.length,
          images: [...document.images].map((image) => ({
            url: image.currentSrc,
            loaded: image.complete && image.naturalWidth > 0
          })),
          links: [...document.querySelectorAll('a[href]')].map((anchor) => anchor.href)
        }));
        report.push({
          url,
          viewport: label,
          status: response?.status(),
          file: name,
          capturedAt: new Date().toISOString(),
          ...metadata,
          failures
        });
        if (!response?.ok()) captureFailed = true;
        console.log(`Captured ${index + 1}/${urls.length} ${label}: ${url}`);
      } catch (error) {
        captureFailed = true;
        report.push({ url, viewport: label, error: error.message, failures });
      } finally {
        page.off('response', onResponse);
        await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
      }
    }
    await context.close();
    await writeFile(path.join(output, `${label}-requests.txt`), `${[...requests].join('\n')}\n`);
    // Later-registered HAR routing runs first; unmatched requests are aborted.
    const replay = await browser.newContext({ viewport, serviceWorkers: 'block' });
    let misses = 0;
    await replay.route('**/*', (route) => {
      misses++;
      return route.abort();
    });
    await replay.routeFromHAR(harPath, { notFound: 'fallback' });
    const offline = await replay.newPage();
    await offline.goto(urls[0], { waitUntil: 'domcontentloaded', timeout: 30000 });
    await offline.locator('h1').first().waitFor({ state: 'visible', timeout: 15000 });
    const protocol = await replay.newCDPSession(offline);
    const screenshot = await protocol.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    });
    await writeFile(
      path.join(output, `${label}-replay-check.png`),
      Buffer.from(screenshot.data, 'base64')
    );
    const verification = await offline.evaluate(() => ({
      title: document.title,
      textLength: document.body.innerText.length,
      stylesheets: document.styleSheets.length,
      fontStatus: document.fonts.status,
      loadedImages: [...document.images].filter((image) => image.complete && image.naturalWidth > 0)
        .length
    }));
    await writeFile(
      path.join(output, `${label}-replay-check.json`),
      JSON.stringify(
        { ...verification, unmatchedRequests: misses, liveNetworkAllowed: false },
        null,
        2
      )
    );
    if (!verification.textLength || !verification.stylesheets || !verification.loadedImages)
      captureFailed = true;
    await replay.close();
  }
} finally {
  await browser.close();
}
if (captureFailed) process.exitCode = 1;
