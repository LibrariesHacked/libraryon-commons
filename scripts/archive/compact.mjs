/**
 * @file Package source evidence without duplicate media or browser artifacts.
 * The small deterministic gzip bundles are ordinary Git files, never Git LFS.
 */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { digest, origin } from './collect.mjs';

/**
 * Select original first-party code, styles and fonts, excluding photos/API data.
 * @param {{url: string, status: number, contentType: string}} entry - Manifest entry.
 * @returns {boolean} Whether the object belongs in the template evidence bundle.
 */
export const isTemplateAsset = (entry) => {
  const url = new URL(entry.url);
  return (
    entry.status === 200 &&
    url.origin === origin &&
    (/css|javascript|^font\//.test(entry.contentType) ||
      /\.(woff2?|ttf|otf)(?:\?|$)/i.test(entry.url))
  );
};

/**
 * Preserve original source records and checksummed template bytes in three bundles.
 * No source files are modified, and already-imported media is not duplicated.
 * @param {object} [options] - Local filesystem input/output locations.
 * @param {string} [options.root=process.cwd()] - Repository root.
 * @param {string} [options.source='archive'] - Raw captures relative to root.
 * @param {string} [options.output='preservation'] - Bundle directory relative to root.
 * @returns {Promise<object>} Bundle inventory, checksums and coverage limitations.
 * @throws {Error} For missing/partial datasets, corrupt templates or oversized output.
 */
export async function compactArchive({
  root = process.cwd(),
  source = 'archive',
  output = 'preservation'
} = {}) {
  const sourceRoot = path.resolve(root, source);
  const outputRoot = path.resolve(root, output);
  if (outputRoot === sourceRoot || outputRoot.startsWith(`${sourceRoot}${path.sep}`))
    throw new Error('Output must be outside the raw archive');
  const readJSON = async (file) => JSON.parse(await readFile(path.join(sourceRoot, file), 'utf8'));
  const inventory = await readJSON('content/pages.json');
  const content = [];
  for (const row of inventory) content.push(await readJSON(row.file));
  const data = {};
  for (const name of (await readdir(path.join(sourceRoot, 'data'))).sort()) {
    if (name.endsWith('.json')) data[name] = await readJSON(`data/${name}`);
  }
  if (!content.length || !data['libraries.json'] || !data['authorities.json'])
    throw new Error('Missing essential content or directory datasets');
  for (const [name, dataset] of Object.entries(data)) {
    if (dataset.complete === false) throw new Error(`Incomplete source dataset: ${name}`);
  }
  const entries = new Map(
    (await readFile(path.join(sourceRoot, 'manifest.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => {
        const entry = JSON.parse(line);
        return [entry.url, entry];
      })
  );
  const templateURLs = new Set(
    content
      .filter((record) => new URL(record.canonical).pathname.startsWith('/libraries/'))
      .map((record) => record.canonical)
  );
  if (!templateURLs.size) throw new Error('No representative library/authority template records');
  const templates = [];
  for (const entry of entries.values()) {
    if (entry.status !== 200 || (!templateURLs.has(entry.url) && !isTemplateAsset(entry))) continue;
    const body = await readFile(path.join(sourceRoot, entry.file));
    if (digest(body) !== entry.sha256) throw new Error(`Checksum mismatch: ${entry.url}`);
    templates.push({
      url: entry.url,
      capturedAt: entry.capturedAt,
      contentType: entry.contentType,
      sha256: entry.sha256,
      encoding: 'base64',
      body: body.toString('base64')
    });
  }
  for (const url of templateURLs) {
    if (!templates.some((record) => record.url === url))
      throw new Error(`Missing raw template HTML: ${url}`);
  }
  const bundles = {
    'content.json.gz': content,
    'data.json.gz': data,
    'templates.json.gz': templates
  };
  const encoded = Object.entries(bundles).map(([file, value]) => ({
    file,
    body: gzipSync(Buffer.from(JSON.stringify(value)), { level: 9 })
  }));
  for (const bundle of encoded) {
    if (bundle.body.length >= 45 * 1024 * 1024)
      throw new Error(`${bundle.file} exceeds the conservative ordinary-Git file-size budget`);
  }
  const manifest = {
    format: 1,
    description:
      'Compact LibraryOn preservation evidence. Editable content and deduplicated media are kept separately in src/ and public/uploads/. No HARs, screenshots or duplicate API response objects.',
    contentPages: content.length,
    datasets: Object.keys(data),
    templateURLs: [...templateURLs],
    templateObjects: templates.length,
    bundles: encoded.map(({ file, body }) => ({ file, bytes: body.length, sha256: digest(body) })),
    mediaLocation: 'public/uploads/archive',
    mediaProvenance: 'migration/import-report.json',
    limitations: [
      'Template evidence is original rendered HTML and compiled assets, not original CMS/React source.',
      'Templates retain source URLs; these bundles are not an offline mirror.',
      'Third-party presentations/videos remain references unless separately downloaded.',
      'Unlinked CMS content and unreferenced uploads may be absent.'
    ]
  };
  await mkdir(outputRoot, { recursive: true });
  for (const { file, body } of encoded) await writeFile(path.join(outputRoot, file), body);
  await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      source: { type: 'string', default: 'archive' },
      output: { type: 'string', default: 'preservation' }
    }
  });
  const manifest = await compactArchive(values);
  console.log(JSON.stringify(manifest, null, 2));
}
