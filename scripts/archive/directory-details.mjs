/**
 * @file Add each library's services list and source update date to the editable directory records.
 * The collector's `populate=*` request omits the services component, so it is fetched explicitly.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const origin = 'https://libraryon.org';
const pageSize = 100;

/** Download every library's services, keyed by source ID. */
async function fetchServices(delay = 300) {
  const services = {};
  for (let page = 1, pages = 1; page <= pages; page++) {
    const url = new URL('/cms/api/libraries', origin);
    url.search = new URLSearchParams({
      'pagination[page]': page,
      'pagination[pageSize]': pageSize,
      'fields[0]': 'slug',
      'populate[services]': '*',
      'sort[0]': 'id:asc'
    });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Library services request failed: ${response.status}`);
    const body = await response.json();
    pages = body.meta.pagination.pageCount;
    for (const record of body.data)
      services[record.id] = (record.attributes.services || []).map(({ service, url: link }) => ({
        service,
        url: link || ''
      }));
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return services;
}

/** Return a record with new fields placed before its review and import dates. */
function withFields(record, fields) {
  const result = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'reviewed_on') Object.assign(result, fields);
    if (!(key in fields)) result[key] = value;
  }
  return Object.keys(fields).every((key) => key in result) ? result : { ...record, ...fields };
}

const day = (timestamp) => (timestamp ? String(timestamp).slice(0, 10) : '');

/** Flatten the source's rich-text blocks into plain paragraphs and bullet lines. */
export function blocksToText(value) {
  if (!Array.isArray(value)) return value;
  const inline = (node) => node.text ?? (node.children || []).map(inline).join('');
  const block = (node) =>
    node.type === 'list'
      ? (node.children || []).map((item) => `- ${inline(item)}`).join('\n')
      : inline(node);
  return value
    .map(block)
    .filter((text) => text.trim())
    .join('\n\n');
}

/**
 * Merge services and source update dates into src/content records.
 * @param {string} [root] - Repository root.
 * @returns {Promise<{libraries: number, withServices: number, authorities: number}>} Update counts.
 */
export async function enrichDirectory(root = process.cwd()) {
  const dataFolder = path.join(root, 'archive/data');
  const read = async (name) => JSON.parse(await readFile(path.join(dataFolder, name), 'utf8'));
  const servicesFile = path.join(dataFolder, 'library-services.json');
  let services;
  try {
    services = JSON.parse(await readFile(servicesFile, 'utf8'));
  } catch {
    services = await fetchServices();
    await mkdir(dataFolder, { recursive: true });
    await writeFile(servicesFile, `${JSON.stringify(services)}\n`);
  }
  const updated = new Map(
    (await read('libraries.json')).data.map((record) => [
      String(record.id),
      record.attributes.updatedAt
    ])
  );
  const counts = { libraries: 0, withServices: 0, authorities: 0 };
  for (const [folder, kind] of [
    ['libraries', 'libraries'],
    ['authorities', 'authorities']
  ]) {
    for (const file of await readdir(path.join(root, 'src/content', folder))) {
      const target = path.join(root, 'src/content', folder, file);
      const record = JSON.parse(await readFile(target, 'utf8'));
      const fields = {};
      if (kind === 'libraries') {
        record.openingTimesNotes = blocksToText(record.openingTimesNotes);
        const list = (services[record.source_id] || []).filter((item) => item.service);
        if (list.length) fields.services = list;
        const date = day(updated.get(String(record.source_id)));
        if (date) fields.updated_on = date;
        counts.libraries++;
        if (list.length) counts.withServices++;
      } else {
        const date = day(record.updatedAt);
        if (date) fields.updated_on = date;
        counts.authorities++;
      }
      await writeFile(target, `${JSON.stringify(withFields(record, fields), null, 2)}\n`);
    }
  }
  return counts;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(await enrichDirectory(), null, 2));
