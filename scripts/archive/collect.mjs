/**
 * @file Rate-limited public-site collector with resumable, checksummed responses.
 * Raw captures are local-only; import/compaction create the ordinary-Git outputs.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { load, loadBuffer } from 'cheerio';

export const origin = 'https://libraryon.org';
export const assetHost = 'libraryon.lon1.digitaloceanspaces.com';

/**
 * Hash exact bytes, without normalising text or JSON.
 * @param {string|Buffer} value - Input bytes or UTF-8 string.
 * @returns {string} Hexadecimal SHA-256 checksum.
 */
export const digest = (value) => createHash('sha256').update(value).digest('hex');

/**
 * Map a full URL, including its query, to a filesystem-safe raw object path.
 * @param {string} url - Absolute source URL.
 * @returns {string} Path relative to the raw capture directory.
 */
export const objectPath = (url) => `objects/${digest(url)}`;

/**
 * Enforce the first-party HTTPS scope, with explicit opt-in for public CMS APIs.
 * @param {string} url - Absolute candidate URL.
 * @param {boolean} [api=false] - Allow public /cms/api/ GET endpoints, never admin.
 * @returns {boolean} Whether the collector may request this URL.
 * @throws {TypeError|URIError} If URL syntax or percent encoding is invalid.
 */
export function allowed(url, api = false) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
  if (parsed.hostname === assetHost) return true;
  if (parsed.hostname === 'lon1.digitaloceanspaces.com')
    return parsed.pathname.startsWith('/libraryon/');
  if (parsed.origin !== origin) return false;
  const pathname = decodeURIComponent(parsed.pathname);
  return !pathname.startsWith('/cms/') || (api && pathname.startsWith('/cms/api/'));
}

/**
 * Discover first-party assets in HTML, CSS and serialized application data.
 * Also retain original images behind thumbnails and known malformed media links.
 * @param {string} body - Decoded textual response body.
 * @param {string} url - Response URL used to resolve relative references.
 * @param {string} type - Response MIME type.
 * @returns {string[]} Unique in-scope URLs, without fragment identifiers.
 */
export function references(body, url, type) {
  const found = new Set();
  const add = (value) => {
    if (!value || value.startsWith('#')) return;
    try {
      if (decodeURIComponent(value).startsWith('#')) return;
      const target = new URL(value, url);
      target.hash = '';
      if (allowed(target.href)) {
        found.add(target.href);
        if (
          target.origin === origin &&
          target.pathname === '/_next/image' &&
          target.searchParams.has('url')
        )
          add(target.searchParams.get('url'));
        if (
          target.origin === origin &&
          target.pathname.startsWith('/lon1.digitaloceanspaces.com/libraryon/')
        )
          add(`https://${target.pathname.slice(1)}`);
      }
    } catch {}
  };
  if (type.includes('html')) {
    const document = load(body);
    document('[src], link[href], a[href], [poster]').each((index, element) => {
      const node = document(element);
      const attribute = node.attr('src') || node.attr('poster') || node.attr('href');
      if (element.name !== 'a' || /\.(pdf|docx?|xlsx?|pptx?|zip)(?:\?|$)/i.test(attribute))
        add(attribute);
    });
    document('[srcset]').each((index, element) => {
      for (const candidate of document(element).attr('srcset').split(','))
        add(candidate.trim().split(/\s+/)[0]);
    });
  }
  if (/css|html/.test(type)) {
    for (const match of body.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) add(match[1]);
  }
  if (/json|javascript|html/.test(type)) {
    const decoded = body.replaceAll('\\/', '/').replaceAll('\\u0026', '&');
    for (const match of decoded.matchAll(
      /https:\/\/(?:libraryon\.lon1\.digitaloceanspaces\.com\/|lon1\.digitaloceanspaces\.com\/libraryon\/)[^\s"'<>\\)]+/g
    ))
      add(match[0]);
  }
  return [...found];
}

/**
 * Require both the advertised record count and unique IDs for a complete export.
 * @param {Array<{id: number|string}>} records - All downloaded collection pages.
 * @param {{total: number}} pagination - API-provided collection total.
 * @returns {boolean} Whether the export matches the API's advertised coverage.
 */
export function paginationComplete(records, pagination) {
  return (
    records.length === pagination.total &&
    new Set(records.map((record) => record.id)).size === records.length
  );
}

/** Build a paginated API URL, explicitly populating nested library-event relations. */
export function collectionRequestURL(endpoint, pageNumber) {
  const url = new URL(`/cms/api/${endpoint}`, origin);
  if (endpoint === 'alerts') {
    url.search = new URLSearchParams({
      publicationState: 'live',
      'populate[relations][populate][page][fields][0]': 'slug',
      'populate[relations][populate][legal][fields][0]': 'slug',
      'populate[relations][populate][special_collection][fields][0]': 'slug'
    });
  } else if (!endpoint.includes('/')) {
    const query = new URLSearchParams({
      'pagination[page]': pageNumber,
      'pagination[pageSize]': 100,
      populate: '*',
      'sort[0]': 'id:asc'
    });
    if (endpoint === 'libraries') {
      query.set('populate[events][populate][tags]', '*');
      query.set('populate[events][populate][occurrences]', '*');
    }
    url.search = query;
  }
  return url;
}

/**
 * Normalise an editorial link without queuing generated directory/event details.
 * @param {string} value - Candidate absolute or relative link.
 * @param {string} [base=origin] - Source page for relative resolution.
 * @returns {string|null} In-scope page URL without query/fragment, or null.
 */
export function editorialURL(value, base = origin) {
  try {
    const url = new URL(value, base);
    if (url.origin !== origin || !allowed(url.href)) return null;
    if (/^\/(?:libraries\/|events\/|_next\/|cdn-cgi\/)/.test(url.pathname)) return null;
    if (/\.[a-z0-9]{2,5}$/i.test(url.pathname)) return null;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Extract migration-friendly content while leaving the raw response untouched.
 * @param {string} body - Captured HTML response.
 * @param {string} url - Requested page URL.
 * @returns {object} Canonical metadata, rich HTML, text, images, links and embeds.
 */
export function pageContent(body, url) {
  const document = load(body);
  const main = document('main').first().length
    ? document('main').first().clone()
    : document('body').clone();
  const resolve = (value) => {
    try {
      return new URL(value, url).href;
    } catch {
      return value;
    }
  };
  const links = main
    .find('a[href]')
    .map((index, element) => ({
      text: document(element).text().replace(/\s+/g, ' ').trim(),
      url: resolve(document(element).attr('href'))
    }))
    .get();
  const images = main
    .find('img')
    .map((index, element) => ({
      url: resolve(document(element).attr('src')),
      alt: document(element).attr('alt') || '',
      srcset: document(element).attr('srcset') || ''
    }))
    .get();
  const headings = main
    .find('h1,h2,h3,h4')
    .map((index, element) => ({
      level: Number(element.name.slice(1)),
      text: document(element).text().replace(/\s+/g, ' ').trim()
    }))
    .get();
  main.find('script').remove();
  main.find('[href], [src], [poster]').each((index, element) => {
    for (const attribute of ['href', 'src', 'poster']) {
      const value = document(element).attr(attribute);
      if (value) document(element).attr(attribute, resolve(value));
    }
  });
  return {
    source: url,
    title: document('head > title').first().text(),
    description: document('meta[name="description"]').attr('content') || '',
    canonical: document('link[rel="canonical"]').attr('href') || url,
    headings,
    html: main.html(),
    text: main.text().replace(/\s+/g, ' ').trim(),
    images,
    links,
    embeds: main
      .find('iframe[src],video[src],audio[src]')
      .map((index, element) => ({
        type: element.name,
        url: document(element).attr('src'),
        title: document(element).attr('title') || ''
      }))
      .get()
  };
}

/**
 * Resume a raw capture and report API completeness, assets and failed requests.
 * Existing successful bodies are checksum-verified; output reports are replaced.
 * @param {object} options - Parsed CLI flags, including api/assets/data-only/limit.
 * @param {string} [options.output='archive'] - Raw capture output directory.
 * @param {number} options.delay - Minimum delay between live requests in milliseconds.
 * @returns {Promise<void>} Sets process.exitCode when any requested slice fails.
 */
export async function collect(options) {
  const output = path.resolve(options.output || 'archive');
  await mkdir(path.join(output, 'objects'), { recursive: true });
  await mkdir(path.join(output, 'data'), { recursive: true });
  await mkdir(path.join(output, 'content'), { recursive: true });
  const entries = new Map();
  try {
    for (const line of (await readFile(path.join(output, 'manifest.jsonl'), 'utf8'))
      .trim()
      .split('\n')) {
      const entry = JSON.parse(line);
      if (entry.status >= 200 && entry.status < 400) entries.set(entry.url, entry);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const failures = [];
  const assets = new Set();
  let lastRequest = 0;
  /** Reuse a verified response or issue a bounded-retry GET without auto-redirects. */
  const get = async (url) => {
    if (!allowed(url, options.api)) throw new Error(`Out of scope: ${url}`);
    const previous = entries.get(url);
    if (previous) {
      const body = await readFile(path.join(output, previous.file));
      if (digest(body) !== previous.sha256) throw new Error(`Checksum mismatch: ${url}`);
      return {
        body,
        type: previous.contentType,
        status: previous.status,
        location: previous.headers.location
      };
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, lastRequest + options.delay - Date.now()))
      );
      lastRequest = Date.now();
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'LibraryOnPreservation/1.0 (public archival GET; CC-BY-4.0)' },
          redirect: 'manual',
          signal: AbortSignal.timeout(60000)
        });
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          const retryAfter = response.headers.get('retry-after');
          const seconds = Number(retryAfter);
          const wait =
            retryAfter && !Number.isNaN(seconds)
              ? seconds * 1000
              : Date.parse(retryAfter) - Date.now();
          await response.arrayBuffer();
          await new Promise((resolve) =>
            setTimeout(resolve, Math.max(2000 * (attempt + 1), wait || 0))
          );
          continue;
        }
        const body = Buffer.from(await response.arrayBuffer());
        const entry = {
          url,
          capturedAt: new Date().toISOString(),
          status: response.status,
          contentType: response.headers.get('content-type') || '',
          headers: Object.fromEntries(
            [...response.headers].filter(([name]) => name !== 'set-cookie')
          ),
          file: objectPath(url),
          bytes: body.length,
          sha256: digest(body)
        };
        await writeFile(path.join(output, entry.file), body);
        await appendFile(path.join(output, 'manifest.jsonl'), `${JSON.stringify(entry)}\n`);
        if (!response.ok && !(response.status >= 300 && response.status < 400)) {
          failures.push({ url, status: response.status });
          return { body, type: entry.contentType, status: response.status };
        }
        entries.set(url, entry);
        return {
          body,
          type: entry.contentType,
          status: response.status,
          location: response.headers.get('location')
        };
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
  };
  /** Follow only in-scope redirects and extend the asset queue from successful text. */
  const fetchObject = async (url, redirects = 0) => {
    try {
      const result = await get(url);
      if (result.status >= 300 && result.status < 400) {
        if (!result.location || redirects >= 10) throw new Error('Invalid or excessive redirects');
        const target = new URL(result.location, url).href;
        if (!allowed(target, options.api))
          throw new Error(`Redirect outside allowed scope: ${target}`);
        return await fetchObject(target, redirects + 1);
      }
      if (result.status === 200) {
        for (const asset of references(result.body.toString(), url, result.type)) assets.add(asset);
      }
      return result;
    } catch (error) {
      failures.push({ url, error: error.message });
      return null;
    }
  };
  const robots = await get(`${origin}/robots.txt`);
  if (robots.status !== 200 || !robots.body.toString().includes('Disallow: /cms/')) {
    throw new Error('Robots policy changed or unavailable; review it before collecting.');
  }
  const sitemap = await get(`${origin}/sitemap.xml`);
  if (sitemap.status !== 200) throw new Error('Cannot read sitemap');
  const xml = loadBuffer(sitemap.body, { xml: true });
  const pages = [
    ...new Set([
      `${origin}/`,
      ...xml('loc')
        .map((index, element) => xml(element).text().trim())
        .get()
    ])
  ];
  await writeFile(path.join(output, 'seeds.txt'), `${pages.join('\n')}\n`);
  const apiSummary = {};
  const content = new Map();
  if (options.api) {
    for (const endpoint of [
      'libraries',
      'authorities',
      'events',
      'event-tags',
      'alerts',
      'libraries/event-counts'
    ]) {
      const records = [];
      let pagination;
      let complete = false;
      for (let pageNumber = 1; ; pageNumber++) {
        const url = collectionRequestURL(endpoint, pageNumber);
        const response = await fetchObject(url.href);
        if (!response || response.status !== 200) break;
        const json = JSON.parse(response.body);
        if (!Array.isArray(json.data)) {
          await writeFile(
            path.join(output, 'data', `${endpoint.replaceAll('/', '-')}.json`),
            JSON.stringify(json, null, 2)
          );
          complete = true;
          break;
        }
        records.push(...json.data);
        const nextPagination = json.meta?.pagination;
        if (pagination && nextPagination?.total !== pagination.total) break;
        pagination = nextPagination;
        if (!pagination) {
          complete = true;
          break;
        }
        if (pageNumber >= pagination.pageCount) {
          complete = paginationComplete(records, pagination);
          break;
        }
      }
      if (records.length || pagination)
        await writeFile(
          path.join(output, 'data', `${endpoint}.json`),
          JSON.stringify({ data: records, pagination, complete }, null, 2)
        );
      apiSummary[endpoint] = { records: records.length, expected: pagination?.total, complete };
      console.log(endpoint, apiSummary[endpoint]);
    }
  }
  if (!options['data-only']) {
    const templates = [
      pages.find((url) => /\/libraries\/[^/]+$/.test(url)),
      pages.find((url) => /\/libraries\/[^/]+\/[^/]+$/.test(url))
    ].filter(Boolean);
    const selected = options['all-libraries']
      ? pages.filter((url) => allowed(url))
      : [...new Set([...pages.map((url) => editorialURL(url)).filter(Boolean), ...templates])];
    const limited = options.limit ? selected.slice(0, options.limit) : selected;
    const queued = new Set(limited);
    for (const [index, url] of limited.entries()) {
      const result = await fetchObject(url);
      if (result?.status === 200 && result.type.includes('html')) {
        const record = pageContent(result.body.toString(), url);
        content.set(record.canonical, {
          ...record,
          file: `content/${digest(record.canonical)}.json`
        });
        if (!options.limit) {
          for (const link of record.links) {
            const target = editorialURL(link.url);
            if (target && !queued.has(target)) {
              queued.add(target);
              limited.push(target);
            }
          }
        }
      }
      console.log(`Page ${index + 1}/${limited.length}: ${url}`);
    }
    for (const record of content.values())
      await writeFile(path.join(output, record.file), JSON.stringify(record, null, 2));
    await writeFile(
      path.join(output, 'content', 'pages.json'),
      JSON.stringify(
        [...content.values()].map(({ html, text, ...record }) => record),
        null,
        2
      )
    );
    await writeFile(path.join(output, 'unique-seeds.txt'), `${[...content.keys()].join('\n')}\n`);
  }
  if (options.assets) {
    for (const asset of assets) await fetchObject(asset);
  }
  if (!options['data-only']) {
    const resources = [...content.values()].flatMap((record) =>
      record.links.map((link) => ({
        page: record.canonical,
        ...link,
        archived: entries.get(link.url)?.status === 200,
        file: entries.get(link.url)?.file || null
      }))
    );
    await writeFile(path.join(output, 'content', 'links.json'), JSON.stringify(resources, null, 2));
    await writeFile(
      path.join(output, 'content', 'media.json'),
      JSON.stringify(
        [...assets].map((url) => ({
          url,
          file: entries.get(url)?.file || null,
          status: entries.get(url)?.status || null,
          contentType: entries.get(url)?.contentType || null,
          sha256: entries.get(url)?.sha256 || null
        })),
        null,
        2
      )
    );
    await writeFile(
      path.join(output, 'content', 'recovered-media.json'),
      JSON.stringify(
        [...assets]
          .filter((url) => url.startsWith(`${origin}/lon1.digitaloceanspaces.com/libraryon/`))
          .map((url) => {
            const recovered = `https://${new URL(url).pathname.slice(1)}`;
            return {
              original: url,
              recovered,
              file: entries.get(recovered)?.file || null,
              status: entries.get(recovered)?.status || null,
              rawSourceUnchanged: true
            };
          }),
        null,
        2
      )
    );
    const priority = [...content.values()].filter((record) =>
      /pressplay|special-collections|grants|case-stud/.test(record.canonical)
    );
    const priorityLinks = resources.filter((resource) =>
      priority.some((record) => record.canonical === resource.page)
    );
    await writeFile(
      path.join(output, 'content', 'priority-report.json'),
      JSON.stringify(
        {
          pages: priority.map((record) => ({
            url: record.canonical,
            title: record.title,
            file: record.file
          })),
          downloads: priorityLinks.filter((link) =>
            /\.(pdf|docx?|pptx?|xlsx?|zip)(?:[?#\s]|$)/i.test(link.url)
          ),
          externalReferences: priorityLinks.filter((link) => {
            try {
              return /^https?:/.test(link.url) && !allowed(link.url);
            } catch {
              return false;
            }
          }),
          note: 'External URLs are preserved as references, not downloaded copies of videos or hosted slide presentations.'
        },
        null,
        2
      )
    );
  }
  const report = {
    capturedAt: new Date().toISOString(),
    options,
    sitemapPages: pages.length,
    successfulObjects: entries.size,
    uniqueContentPages: content.size,
    discoveredAssets: assets.size,
    api: apiSummary,
    failures,
    limitations: [
      'Raw objects are not an offline website.',
      'Sitemap coverage is not proof of all public URLs.',
      'No private CMS content or source templates captured.',
      'Third-party maps, video, geocoding and licence exceptions require separate review.'
    ]
  };
  await writeFile(
    path.join(output, options['data-only'] ? 'data-report.json' : 'report.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  if (failures.length || Object.values(apiSummary).some((value) => !value.complete))
    process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      api: { type: 'boolean', default: false },
      assets: { type: 'boolean', default: false },
      editorial: { type: 'boolean', default: false },
      'all-libraries': { type: 'boolean', default: false },
      'data-only': { type: 'boolean', default: false },
      output: { type: 'string', default: 'archive' },
      limit: { type: 'string' },
      delay: { type: 'string', default: '300' }
    }
  });
  values.delay = Number(values.delay);
  values.limit = values.limit === undefined ? undefined : Number(values.limit);
  if (
    !Number.isFinite(values.delay) ||
    values.delay < 0 ||
    (values.limit !== undefined && (!Number.isInteger(values.limit) || values.limit < 1))
  )
    throw new Error('Invalid delay or limit');
  await collect(values);
}
