/**
 * @file Convert captured source records into Decap content and local media.
 * The raw archive is read-only; import-state checksums protect subsequent edits.
 */
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { load } from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import sanitizeHtml from 'sanitize-html';
import { stringify } from 'yaml';
import { digest, origin } from './collect.mjs';

const extensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4'
};
const squash = (value) => value.replace(/\s+/g, ' ').trim();

/**
 * Derive a stable CMS filename from a source path, independent of its title.
 * @param {string} url - Absolute source page URL.
 * @returns {string} Filename stem, with path separators replaced by double hyphens.
 */
export const pageID = (url) =>
  new URL(url).pathname.replace(/^\/+|\/+$/g, '').replaceAll('/', '--') || 'home';

/**
 * Prefer source title metadata, then its actual H1, then the literal URL path.
 * @param {{title?: string, headings?: Array<{level: number, text: string}>, canonical: string}} record - Source page.
 * @returns {string} Nonempty display title without inventing editorial text.
 */
export function contentTitle(record) {
  const title =
    record.title?.trim() ||
    record.headings?.find((heading) => heading.level === 1)?.text.trim() ||
    new URL(record.canonical).pathname;
  return title.replace(/:([^\s])/g, ': $1');
}

const monthNumbers = Object.fromEntries(
  [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december'
  ].map((name, index) => [name, index + 1])
);

/**
 * Move a leading "Last updated: 3 June 2026" line from Markdown into an ISO date.
 * @param {string} markdown - Converted page body.
 * @returns {{body: string, updated_on?: string}} Body without the line, plus its date when parseable.
 */
export function extractUpdatedDate(markdown) {
  const line = /^Last updated:[ \t]*(.+?)[ \t]*\n+/im.exec(markdown);
  const parts = line && /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(line[1].replace(/[*_]/g, ''));
  const month = parts && monthNumbers[parts[2].toLowerCase()];
  if (!month) return { body: markdown };
  const date = `${parts[3]}-${String(month).padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  return { body: markdown.replace(line[0], ''), updated_on: date };
}

/**
 * Resolve a link against its source page, retaining unparseable input for review.
 * @param {string} value - Relative or absolute URL.
 * @param {string} base - Source page URL.
 * @returns {string} Resolved URL or the original value.
 */
export function absoluteURL(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return value;
  }
}

/**
 * Classify a resource without fetching it or inferring its reuse licence.
 * @param {string} url - Resource source URL.
 * @param {string} [label=''] - Visible link label.
 * @returns {'recording'|'slides'|'document'|'link'} Decap resource type.
 */
export function resourceKind(url, label = '') {
  if (/youtu\.?be|youtube\.com|vimeo\.com/.test(url)) return 'recording';
  if (/canva\.com|prezi\.com/.test(url) || /slides/i.test(label)) return 'slides';
  if (/\.(pdf|docx?|pptx?|xlsx?|zip)(?:[?#]|$)/i.test(url)) return 'document';
  return 'link';
}

/**
 * Group conference links by a preceding title paragraph or descriptive card.
 * Paragraph-based source layouts must not merge all sessions within a theme.
 * @param {string} html - Captured conference content.
 * @param {string} base - Source URL for resolving links.
 * @returns {Array<object>} Sessions with titles, themes and original resource links.
 */
export function extractSessions(html, base) {
  const document = load(html);
  const sessions = new Map();
  let theme = '';
  document('h2, a[href]').each((index, element) => {
    const node = document(element);
    if (element.name === 'h2') {
      theme = squash(node.text());
      return;
    }
    if (!/view slides|view recording/i.test(node.text())) return;
    const titleParagraph = node
      .closest('p')
      .prevAll('p')
      .filter((paragraphIndex, paragraph) => {
        const copy = document(paragraph).clone();
        copy.find('a').remove();
        return squash(copy.find('strong').text()).length > 0;
      })
      .first();
    let card = titleParagraph.length ? titleParagraph : node.parent();
    if (!titleParagraph.length) {
      while (card.length && card[0].name !== 'body') {
        const copy = card.clone();
        copy.find('a').remove();
        if (squash(copy.text()).length >= 20) break;
        card = card.parent();
      }
    }
    if (!card.length || card[0].name === 'body') return;
    const key = card[0];
    if (!sessions.has(key)) {
      const copy = card.clone();
      copy.find('a,svg,button').remove();
      const title =
        squash(copy.find('h3,h4,strong').first().text()) ||
        squash(copy.find('p').first().text()) ||
        squash(copy.text()).slice(0, 160);
      sessions.set(key, {
        title,
        theme,
        description: squash(copy.text()),
        speakers: [],
        links: []
      });
    }
    sessions
      .get(key)
      .links.push({ url: absoluteURL(node.attr('href'), base), label: squash(node.text()) });
  });
  return [...sessions.values()];
}

/**
 * Remove application UI/scripts and convert meaningful rich content to Markdown.
 * Embeds become links; image captions, tables and disclosure content are retained.
 * @param {string} html - Captured page HTML.
 * @param {string} base - Original page URL.
 * @param {(url: string, purpose: string) => string} [resolve] - Local asset/link mapper.
 * @returns {string} Sanitised Markdown with one trailing newline.
 */
export function cleanContent(html, base, resolve = (value) => value) {
  const document = load(html);
  document('svg use[href$="#Eye"]').each((index, element) => {
    document(element).closest('div').remove();
  });
  document('label').each((index, element) => {
    const node = document(element);
    if (node.find('input,select,textarea').length) node.remove();
  });
  document('script,style,svg,nav,footer,form,noscript').remove();
  document('[class*="Timeline__TimelineList"] > li').each((index, element) => {
    const spans = document(element).children('span');
    if (spans.length >= 2) {
      const first = spans.first();
      first.replaceWith(document('<strong></strong>').text(squash(first.text())));
      spans.eq(1).before(' — ');
    }
  });
  document('[class*="Links__StyledTypography"]').each((index, element) => {
    const node = document(element);
    const link = node.children('a').first();
    const span = node.children('span').first();
    if (link.length && span.length && squash(span.text())) link.after(' — ');
  });
  document('button').each((index, element) => {
    const node = document(element);
    const title = squash(node.find('[class*="Recommendation__RecTitle"]').first().text());
    const description = squash(node.find('[class*="Recommendation__RecDescription"]').first().text());
    if (title && description) {
      const meta = node
        .find('[class*="Recommendation__StyledTypography"]')
        .map((i, el) => squash(document(el).text()))
        .get()
        .filter(Boolean)
        .join(', ');
      const replacement = document('<div></div>');
      replacement.append(document('<h3></h3>').text(meta ? `${title} (${meta})` : title));
      replacement.append(document('<p></p>').text(description));
      node.replaceWith(replacement.contents());
      return;
    }
    const heading = node.find('h2,h3,h4').first();
    if (heading.length) {
      node.replaceWith(heading);
      return;
    }
    if (
      /^(previous|next|view|view all|show more|list view|map view|close|menu)$/i.test(squash(node.text())) ||
      (node.attr('aria-controls') && node.attr('aria-expanded') !== undefined)
    )
      node.remove();
  });
  for (const element of document('div').toArray().reverse()) {
    const node = document(element);
    const buttonLabels = node
      .find('button')
      .map((index, button) => squash(document(button).attr('aria-label') || document(button).text()).toLowerCase())
      .get();
    if (
      buttonLabels.some((label) => label.startsWith('previous')) &&
      buttonLabels.some((label) => label.startsWith('next')) &&
      /\b\d+\/\d+\b/.test(squash(node.text()))
    )
      node.remove();
  }
  document('body *').each((index, element) => {
    const node = document(element);
    if (node.children().length || !/^(?:\d+\/\d+|12345)$/.test(squash(node.text()))) return;
    node.remove();
  });
  document('img').each((index, element) => {
    const node = document(element);
    node.attr('src', resolve(absoluteURL(node.attr('src'), base), 'image'));
  });
  document('a[href]').each((index, element) => {
    const node = document(element);
    const value = node.attr('href');
    node.attr('href', value.startsWith('#') ? value : resolve(absoluteURL(value, base), 'link'));
  });
  document('a[href]').each((index, element) => {
    const node = document(element);
    const heading = node.find('h3,h4').first();
    const image = node.find('img').first();
    if (heading.length) {
      const link = document('<a></a>').attr('href', node.attr('href')).text(squash(heading.text()));
      heading.replaceWith(document(`<${heading[0].name}></${heading[0].name}>`).append(link));
      node.replaceWith(node.contents());
    } else if (image.length && !squash(node.text())) {
      if (!squash(image.attr('alt') || '') && node.attr('aria-label'))
        image.attr('alt', squash(node.attr('aria-label')));
      const link = document('<a></a>').attr('href', node.attr('href')).append(image.clone());
      node.replaceWith(document('<p></p>').append(link));
    } else if (!squash(node.text()) && !node.find('img').length) {
      const label = squash(node.attr('aria-label') || '');
      if (label) node.text(label);
      else node.remove();
    } else if (node.find('div').length && !node.find('img').length) {
      const label = squash(node.text()) || squash(node.attr('aria-label') || '');
      if (label) node.replaceWith(document('<a></a>').attr('href', node.attr('href')).text(label));
      else node.remove();
    }
  });
  // The page template supplies the only H1; later source H1s are section headings.
  document('h1')
    .slice(1)
    .each((index, element) => {
      element.name = 'h2';
    });
  document('p').each((index, element) => {
    const node = document(element);
    if (/^(view|show more|list view|map view|\d+\/\d+|12345)$/i.test(squash(node.text()))) node.remove();
    else if (!squash(node.text()) && !node.find('img,a').length) node.remove();
  });
  document('iframe,video,audio').each((index, element) => {
    const node = document(element);
    const source = node.attr('src') || node.find('source').first().attr('src');
    if (source) {
      const link = document('<a></a>')
        .attr('href', resolve(absoluteURL(source, base), 'link'))
        .text(node.attr('title') || `View ${element.name}`);
      node.replaceWith(link);
    }
  });
  const safe = sanitizeHtml(document('body').html() || '', {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'figure',
      'figcaption',
      'details',
      'summary'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'id'],
      img: ['src', 'alt', 'title'],
      '*': ['id'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan']
    },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowProtocolRelative: false
  });
  const converter = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-'
  });
  converter.use(gfm);
  converter.keep(['details', 'summary']);
  return converter
    .turndown(safe)
    .replace(/^(#{1,6} .+?) {2,}\n(?=\S)/gm, '$1 ')
    .replace(/^>[ \t]*\n(?=> )/gm, '\n')
    .replace(/[ \t]+\n[ \t]+\n/g, '\n\n')
    .replace(/\*\*\*\*/g, '')
    .replace(/^•[ \t]+(.+)\n\n(?=•)/gm, '- $1\n')
    .replace(/^•[ \t]+/gm, '- ')
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
    .trim() + '\n';
}

/**
 * Write a generated file only when new or unchanged since the last import.
 * Identical content is left on disk; author edits and unknown files are protected.
 * @param {string} root - Repository root.
 * @param {string} relative - Repository-relative output path.
 * @param {string|Buffer} body - New generated content.
 * @param {Record<string, string>} previous - Last successful import checksums.
 * @param {Record<string, string>} next - Checksums to retain for the next import.
 * @param {string[]} conflicts - Receives protected paths requiring manual review.
 * @param {{force?: boolean}} [options] - Force updates to already-managed files only.
 * @returns {Promise<boolean>} Whether this file is managed successfully.
 */
export async function writeManaged(root, relative, body, previous, next, conflicts, { force = false } = {}) {
  const filename = path.resolve(root, relative);
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const checksum = digest(content);
  try {
    const existing = await readFile(filename);
    const existingChecksum = digest(existing);
    if (existingChecksum === checksum) {
      next[relative] = checksum;
      return true;
    }
    if (existingChecksum !== previous[relative] && !(force && previous[relative])) {
      conflicts.push(relative);
      return false;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content);
  next[relative] = checksum;
  return true;
}

/**
 * Remove obsolete generated sessions, never unknown files or subsequent edits.
 * @param {string} root - Repository root.
 * @param {Record<string, string>} previous - Last successful import checksums.
 * @param {Record<string, string>} next - Next import state, updated on removal.
 * @param {Set<string>} active - Session paths produced by the current import.
 * @param {string[]} conflicts - Receives obsolete paths that were edited.
 * @returns {Promise<void>}
 */
export async function pruneSessions(root, previous, next, active, conflicts) {
  for (const [relative, checksum] of Object.entries(previous)) {
    if (!relative.startsWith('src/content/sessions/') || active.has(relative)) continue;
    try {
      const filename = path.resolve(root, relative);
      if (digest(await readFile(filename)) !== checksum) {
        conflicts.push(relative);
        continue;
      }
      await unlink(filename);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    delete next[relative];
  }
}

/**
 * Import pages, resources, conference sessions and deduplicated media.
 * Settings are never changed. Conflicts are reported rather than overwritten.
 * @param {object} [options] - Local filesystem input locations.
 * @param {string} [options.root=process.cwd()] - Repository/output root.
 * @param {string} [options.archive='archive'] - Raw capture directory relative to root.
 * @param {boolean} [options.refreshMarkdown=false] - Refresh tracked imported Markdown, even if locally edited.
 * @returns {Promise<object>} Import provenance, unresolved URLs and conflicts.
 */
export async function importArchive({
  root = process.cwd(),
  archive = 'archive',
  refreshMarkdown = false
} = {}) {
  const archiveRoot = path.resolve(root, archive);
  const json = async (name) => JSON.parse(await readFile(path.join(archiveRoot, name), 'utf8'));
  const inventory = await json('content/pages.json');
  const manifest = new Map(
    (await readFile(path.join(archiveRoot, 'manifest.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => {
        const entry = JSON.parse(line);
        return [entry.url, entry];
      })
  );
  const recoveries = new Map(
    (await json('content/recovered-media.json')).map((item) => [item.original, item.recovered])
  );
  let previous = {};
  try {
    previous = JSON.parse(
      await readFile(path.join(root, 'migration/import-state.json'), 'utf8')
    ).files;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const next = Object.fromEntries(
    Object.entries(previous).filter(
      ([file]) => !file.startsWith('src/data/directory/') && file !== 'src/data/page-templates.json'
    )
  );
  const conflicts = [];
  const unresolved = new Set();
  const copies = new Map();
  const assets = new Map();
  const resources = new Map();
  const importedPages = [];
  const importedSessions = [];
  const save = (relative, body) =>
    writeManaged(root, relative, body, previous, next, conflicts, {
      force:
        refreshMarkdown && relative.startsWith('src/content/pages/') && Boolean(previous[relative])
    });
  const saveJSON = (relative, data) => save(relative, `${JSON.stringify(data, null, 2)}\n`);

  /** Follow saved redirects/recoveries and unwrap thumbnails without network access. */
  const resolveEntry = (value) => {
    let url = value;
    for (let count = 0; count < 10; count++) {
      url = recoveries.get(url) || url;
      const parsed = new URL(url);
      parsed.hash = '';
      if (
        parsed.origin === origin &&
        parsed.pathname === '/_next/image' &&
        parsed.searchParams.has('url')
      ) {
        url = absoluteURL(parsed.searchParams.get('url'), origin);
        continue;
      }
      url = parsed.href;
      const entry = manifest.get(url);
      if (entry?.status >= 300 && entry.status < 400 && entry.headers.location) {
        url = absoluteURL(entry.headers.location, url);
        continue;
      }
      return { url, entry };
    }
    return { url, entry: null };
  };
  /** Queue one content-addressed media copy or retain a reviewable source reference. */
  const localise = (value, purpose = 'link') => {
    if (!/^https?:/.test(value)) return value;
    const original = new URL(value);
    const { url, entry } = resolveEntry(value);
    const mime = entry?.contentType.split(';')[0];
    const extension =
      extensions[mime] ||
      /\.(pdf|docx?|pptx?|xlsx?|zip|jpe?g|png|gif|webp|svg|avif)$/i
        .exec(new URL(url).pathname)?.[1]
        ?.toLowerCase();
    if (entry?.status === 200 && extension) {
      const relative = `public/uploads/archive/${entry.sha256}.${extension}`;
      const publicPath = `/${relative.slice('public/'.length)}`;
      assets.set(value, {
        source: value,
        resolved: url,
        file: relative,
        url: publicPath,
        sha256: entry.sha256
      });
      copies.set(relative, entry);
      return publicPath + original.hash;
    }
    if (
      purpose === 'image' ||
      (original.origin === origin && /\.(pdf|docx?|pptx?|xlsx?|zip)(?:[?#]|$)/i.test(value))
    )
      unresolved.add(value);
    if (original.origin === origin && purpose !== 'image') {
      const target = new URL(url);
      return target.pathname + target.search + original.hash;
    }
    return value;
  };
  /** Share resource IDs across pages and sessions using their original source URL. */
  const resource = (url, label, pageTitle) => {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    const local = localise(url);
    if (parsed.origin === origin && !local.startsWith('/uploads/')) return null;
    const key = `resource-${digest(url).slice(0, 20)}`;
    if (!resources.has(key)) {
      resources.set(key, {
        title: /^(view |watch |slides|recording|download)/i.test(label)
          ? `${pageTitle}: ${label}`
          : label || pageTitle,
        kind: resourceKind(url, label),
        url: local,
        description: '',
        source_url: url,
        credit: '',
        licence: ''
      });
    }
    return key;
  };

  for (const row of inventory) {
    const record = await json(row.file);
    const url = record.canonical;
    const pathname = new URL(url).pathname;
    const title = contentTitle(record);
    const { body: markdown, updated_on } = extractUpdatedDate(cleanContent(record.html, url, localise));
    if (pathname.startsWith('/libraries/')) {
      continue;
    }
    const id = pageID(url);
    const related = new Set();
    const document = load(record.html);
    document('nav,footer').remove();
    for (const element of document('a[href]').toArray()) {
      const node = document(element);
      const target = absoluteURL(node.attr('href'), url);
      if (!/^https?:/.test(target)) continue;
      const reference = resource(target, squash(node.text()), title);
      if (reference) related.add(reference);
    }
    const metadata = {
      title,
      path: pathname,
      kind: pathname.includes('pressplay')
        ? 'conference'
        : pathname.startsWith('/special-collections/')
          ? 'collection'
          : pathname.startsWith('/legal/')
            ? 'legal'
            : 'page',
      published: !pathname.startsWith('/legal/') && pathname !== '/libraries' && pathname !== '/events',
      description: record.description || '',
      ...(updated_on && { updated_on }),
      source_url: url,
      attribution:
        'Originally published by LibraryOn / The British Library. CC BY 4.0 except where otherwise noted; retain individual credits and rights notices.',
      resources: [...related]
    };
    await save(`src/content/pages/${id}.md`, `---\n${stringify(metadata)}---\n\n${markdown}`);
    importedPages.push({ id, path: pathname, source: url });
    if (metadata.kind === 'conference') {
      for (const [index, session] of extractSessions(record.html, url).entries()) {
        const refs = session.links
          .map((link) => resource(link.url, link.label, session.title))
          .filter(Boolean);
        const sessionID = `${id}--${digest(session.title + session.links.map((link) => link.url).join()).slice(0, 16)}`;
        await saveJSON(`src/content/sessions/${sessionID}.json`, {
          title: session.title,
          conference: id,
          theme: session.theme,
          order: index,
          description: session.description,
          speakers: session.speakers,
          resources: refs
        });
        importedSessions.push({ id: sessionID, title: session.title, resources: refs });
      }
    }
  }
  for (const [id, record] of resources) await saveJSON(`src/content/resources/${id}.json`, record);
  for (const [relative, entry] of copies) {
    const body = await readFile(path.join(archiveRoot, entry.file));
    if (digest(body) !== entry.sha256) throw new Error(`Archive checksum mismatch: ${entry.url}`);
    await save(relative, body);
  }
  const activeSessions = new Set(
    importedSessions.map((session) => `src/content/sessions/${session.id}.json`)
  );
  await pruneSessions(root, previous, next, activeSessions, conflicts);
  await mkdir(path.join(root, 'migration'), { recursive: true });
  const report = {
    pages: importedPages,
    sessions: importedSessions,
    resources: resources.size,
    assets: [...assets.values()],
    unresolved: [...unresolved],
    conflicts,
    notes: [
      'External videos/presentations remain links.',
      'Library listings are maintained separately in the CMS; original API responses remain in preservation/data.json.gz.',
      'No existing settings or navigation were changed.'
    ]
  };
  await writeFile(
    path.join(root, 'migration/import-report.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  await writeFile(
    path.join(root, 'migration/import-state.json'),
    `${JSON.stringify({ files: next }, null, 2)}\n`
  );
  if (refreshMarkdown) {
    const fingerprintPath = path.join(root, 'migration/source-articles.json');
    const fingerprints = JSON.parse(await readFile(fingerprintPath, 'utf8'));
    for (const article of fingerprints.articles) {
      const source = await readFile(path.join(root, article.file), 'utf8');
      const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
      article.body_sha256 = digest(body);
    }
    await writeFile(fingerprintPath, `${JSON.stringify(fingerprints, null, 2)}\n`);
  }
  console.log(
    JSON.stringify(
      {
        pages: importedPages.length,
        sessions: importedSessions.length,
        resources: resources.size,
        assets: copies.size,
        unresolved: [...unresolved],
        conflicts
      },
      null,
      2
    )
  );
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      archive: { type: 'string', default: 'archive' },
      'refresh-markdown': { type: 'boolean', default: false }
    }
  });
  const result = await importArchive({
    archive: values.archive,
    refreshMarkdown: values['refresh-markdown']
  });
  if (result.conflicts.length) process.exitCode = 1;
}
