import test from 'node:test';
import assert from 'node:assert/strict';
/** @file Validate CMS configuration and the committable content without raw captures. */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parse, stringify } from 'yaml';
import { digest } from '../scripts/archive/collect.mjs';
import { libraries, authorities } from '../src/lib/directory.mjs';

const config = parse(readFileSync(new URL('../public/admin/config.yml', import.meta.url), 'utf8'));
const settings = JSON.parse(readFileSync(new URL('../src/data/settings.json', import.meta.url)));

/** Read CMS entries by filename stem, using YAML for Markdown front matter. */
function contentRecords(folder, extension) {
  return new Map(
    readdirSync(folder)
      .filter((file) => file.endsWith(extension))
      .map((file) => {
        const body = readFileSync(path.join(folder, file), 'utf8');
        const match =
          extension === '.md' ? /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body) : null;
        if (extension === '.md') assert.ok(match, `${file} has YAML front matter`);
        return [
          file.slice(0, -extension.length),
          { data: match ? parse(match[1]) : JSON.parse(body), body }
        ];
      })
  );
}

/** Check upload references without requiring the future site's routing or a network. */
function assertUploadsExist(body, label) {
  for (const match of body.matchAll(/\/uploads\/[^\s"'<>\\)]+/g)) {
    const pathname = decodeURIComponent(new URL(match[0], 'https://local.invalid').pathname);
    assert.ok(existsSync(`public${pathname}`), `${label}: missing ${pathname}`);
  }
}

/** Ensure each editable CMS object/list exposes the corresponding settings keys. */
function assertSettingsFields(fields, values, label = 'settings', exact = true) {
  const fieldNames = fields.map((field) => field.name);
  if (exact) assert.deepEqual(fieldNames.sort(), Object.keys(values).sort(), `${label} fields`);
  else
    for (const key of Object.keys(values))
      assert.ok(fieldNames.includes(key), `${label}.${key} is editable in the CMS`);
  for (const field of fields) {
    const value = values[field.name];
    if (field.widget === 'object' && value)
      assertSettingsFields(field.fields, value, `${label}.${field.name}`);
    if (field.widget === 'list' && value?.length)
      for (const item of value)
        assertSettingsFields(field.fields, item, `${label}.${field.name}[]`, false);
  }
}

test('Decap uses the repository backend and tracked editable files, not archive data', () => {
  assert.equal(config.backend.repo, 'LibrariesHacked/libraryon-commons');
  assert.equal(config.backend.branch, 'main');
  assert.equal(config.local_backend, true);
  assert.equal(config.media_library, undefined);
  assert.ok(existsSync(config.media_folder));
  for (const collection of config.collections) {
    if (collection.folder) {
      assert.ok(existsSync(collection.folder));
      assert.ok(!collection.folder.startsWith('archive/'));
    }
    for (const file of collection.files || []) assert.ok(existsSync(file.file));
  }
  for (const name of ['libraries', 'authorities'])
    assert.ok(config.collections.some((collection) => collection.name === name));
  assert.ok(!config.collections.some((collection) => collection.name === 'mobile-libraries'));
  assert.equal(
    config.collections.find((collection) => collection.name === 'libraries').folder,
    'src/content/libraries'
  );
});

test('site settings have configured fields and preserve data after a YAML round trip', () => {
  const fields = config.collections.find((collection) => collection.name === 'settings').files[0]
    .fields;
  assertSettingsFields(fields, settings);
  assert.deepEqual(parse(stringify(settings)), settings);
});

test('menu hierarchy, single footer attribution, and CMS-only content origin are configured', () => {
  const [libraryLink, discover, about] = settings.navigation;
  assert.equal(libraryLink.label, 'Find a library');
  assert.equal(discover.label, 'Discover');
  assert.deepEqual(
    discover.children.map((item) => item.label),
    ['Reading', 'Work and skills', 'Your community', 'Special collections']
  );
  assert.equal(about.label, 'About');
  for (const item of [...discover.children, ...about.children]) assert.ok(item.url);
  assert.ok(settings.footer.attribution);
  assert.ok(settings.footer.links_heading);
  assert.ok(settings.footer.links.length);
  assert.equal(settings.ui.editorial.original_content_label, undefined);
  assert.equal(settings.ui.editorial.new_content_label, undefined);
  const pages = config.collections.find((collection) => collection.name === 'pages');
  const origin = pages.fields.find((field) => field.name === 'content_origin');
  assert.deepEqual(origin.options.map((option) => option.value), ['libraryon', 'commons']);
  const published = pages.fields.find((field) => field.name === 'published');
  assert.equal(published.widget, 'boolean');
  assert.equal(published.default, true);
  assert.ok(!settings.footer.links.some((link) => /accessibility statement|privacy notice/i.test(link.label)));
});

test('pages retain credits and galleries, and sessions associate slides with conferences', () => {
  const pages = config.collections.find((collection) => collection.name === 'pages');
  const gallery = pages.fields.find((field) => field.name === 'gallery');
  assert.ok(gallery.fields.some((field) => field.name === 'credit'));
  assert.ok(gallery.fields.some((field) => field.name === 'alt'));
  const pathField = pages.fields.find((field) => field.name === 'path');
  assert.match('/about/pressplay', new RegExp(pathField.pattern[0]));
  assert.ok(!new RegExp(pathField.pattern[0]).test('https://example.com'));
  const collections = new Set(config.collections.map((collection) => collection.name));
  for (const collection of config.collections) {
    for (const field of collection.fields || []) {
      if (field.widget === 'relation') assert.ok(collections.has(field.collection));
    }
  }
  const sessions = config.collections.find((collection) => collection.name === 'sessions');
  assert.deepEqual(sessions.fields.find((field) => field.name === 'conference').filters, [
    { field: 'kind', values: ['conference'] }
  ]);
  assert.equal(sessions.fields.find((field) => field.name === 'resources').multiple, true);
});

test('CMS records have unique public paths, valid relations and existing local files', () => {
  const pages = contentRecords('src/content/pages', '.md');
  const resources = contentRecords('src/content/resources', '.json');
  const sessions = contentRecords('src/content/sessions', '.json');
  const paths = new Set();
  const pattern = new RegExp(
    config.collections
      .find((collection) => collection.name === 'pages')
      .fields.find((field) => field.name === 'path').pattern[0]
  );
  assert.ok(pages.size > 0);
  for (const [id, record] of pages) {
    assert.ok(record.data.title, `${id}: missing title`);
    assert.match(record.data.path, pattern);
    if (record.data.published !== false) {
      assert.ok(!paths.has(record.data.path), `Duplicate public page path: ${record.data.path}`);
      paths.add(record.data.path);
    }
    for (const resource of record.data.resources || [])
      assert.ok(resources.has(resource), `${id}: missing ${resource}`);
    assertUploadsExist(record.body, id);
  }
  for (const [id, record] of resources) {
    assert.ok(record.data.title, `${id}: missing title`);
    assert.ok(record.data.url, `${id}: missing URL`);
    assertUploadsExist(record.body, id);
  }
  for (const [id, record] of sessions) {
    assert.equal(
      pages.get(record.data.conference)?.data.kind,
      'conference',
      `${id}: invalid conference`
    );
    for (const resource of record.data.resources || [])
      assert.ok(resources.has(resource), `${id}: missing ${resource}`);
  }
});

test('obsolete legal pages remain in the CMS but are unpublished', () => {
  const pages = contentRecords('src/content/pages', '.md');
  for (const id of [
    'legal--privacy-notice',
    'legal--ai-statement',
    'legal--accessibility-statement'
  ]) {
    assert.ok(pages.has(id), `${id} remains editable in the CMS`);
    assert.equal(pages.get(id).data.published, false, `${id} is archived from the public site`);
  }
});

test('the original library-map and events snapshots remain archived but unpublished', () => {
  const pages = contentRecords('src/content/pages', '.md');
  assert.ok(pages.has('libraries'));
  assert.equal(pages.get('libraries').data.path, '/libraries');
  assert.equal(pages.get('libraries').data.published, false);
  assert.ok(pages.has('events'));
  assert.equal(pages.get('events').data.path, '/events');
  assert.equal(pages.get('events').data.published, false);
});

test('imported article bodies remain unchanged while new community articles are separate', () => {
  const baseline = JSON.parse(readFileSync('migration/source-articles.json', 'utf8'));
  for (const article of baseline.articles) {
    const body = readFileSync(article.file, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    assert.equal(digest(body), article.body_sha256, `Original article changed: ${article.file}`);
  }
});

test('homepage controls point to existing content and preserve the main heading', () => {
  const homepage = JSON.parse(readFileSync('src/data/homepage.json', 'utf8'));
  const paths = new Set(
    [...contentRecords('src/content/pages', '.md').values()]
      .filter((record) => record.data.published !== false)
      .map((record) => record.data.path)
  );
  for (const path of [
    ...homepage.feature_pages,
    ...homepage.collection_pages,
    ...homepage.community_pages
  ])
    assert.ok(paths.has(path), `Missing homepage selection: ${path}`);
  assert.equal(homepage.title, 'Libraries are for everyone');
  if (homepage.image) assert.ok(existsSync(`public${homepage.image}`));
  assert.ok(Array.isArray(homepage.carousel) && homepage.carousel.length >= 3);
  for (const slide of homepage.carousel) {
    assert.ok(slide.image && existsSync(`public${slide.image}`), `Missing carousel image: ${slide.image}`);
    assert.ok(slide.alt && slide.alt.trim().length > 0, `Missing carousel alt text for ${slide.image}`);
    assert.ok(
      !slide.image.includes('d8d54cb7e50d820ae0c8f4b528263d433b20427a5c76a332990590d644007f69'),
      'Tracy testimonial photo must remain a testimonial image, not a hero carousel image'
    );
  }
  const fields = config.collections
    .find((collection) => collection.name === 'settings')
    .files.find((file) => file.name === 'homepage').fields;
  assert.deepEqual(fields.map((field) => field.name).sort(), Object.keys(homepage).sort());
});

test('all original directory listings are represented in the editable CMS source', () => {
  const source = JSON.parse(gunzipSync(readFileSync('preservation/data.json.gz')));
  const sourceLibraries = source['libraries.json'].data;
  const sourceAuthorities = source['authorities.json'].data;
  const ids = new Set(libraries.map((library) => String(library.source_id)));
  const authorityIds = new Set(authorities.map((authority) => String(authority.source_id)));
  for (const library of sourceLibraries)
    assert.ok(ids.has(String(library.id)), `Missing source library ${library.id}`);
  const sourceUprns = sourceLibraries.filter((library) => library.attributes?.uprn);
  assert.ok(sourceUprns.length > 0, 'Source archive contains populated UPRN values');
  for (const source of sourceUprns) {
    const editable = libraries.find((library) => String(library.source_id) === String(source.id));
    assert.equal(editable?.uprn, source.attributes.uprn, `UPRN lost for source library ${source.id}`);
  }
  for (const authority of sourceAuthorities)
    assert.ok(authorityIds.has(String(authority.id)), `Missing source authority ${authority.id}`);
  const authorityFields = config.collections.find(
    (collection) => collection.name === 'authorities'
  ).fields;
  const libraryFields = config.collections.find((collection) => collection.name === 'libraries').fields;
  const uprn = libraryFields.find((field) => field.name === 'uprn');
  assert.equal(uprn.widget, 'string');
  assert.equal(uprn.required, false);
  const countries = authorityFields.find((field) => field.name === 'country').options;
  for (const authority of authorities)
    assert.ok(countries.includes(authority.country), `Country not editable: ${authority.country}`);
});

test('imported archive media is checksummed, deduplicated and within ordinary-Git limits', () => {
  const checksums = new Set();
  for (const file of readdirSync('public/uploads/archive')) {
    const filename = path.join('public/uploads/archive', file);
    const checksum = digest(readFileSync(filename));
    assert.equal(file.split('.')[0], checksum, `Changed imported media: ${file}`);
    assert.ok(!checksums.has(checksum), `Duplicate imported media: ${file}`);
    assert.ok(statSync(filename).size < 100 * 1024 * 1024, `GitHub file limit: ${file}`);
    checksums.add(checksum);
  }
});

test('saving in the CMS stamps a date field that exists in each collection', () => {
  const admin = readFileSync('src/pages/admin/index.astro', 'utf8');
  assert.ok(admin.includes("name: 'preSave'"));
  for (const [name, fields] of Object.entries({
    pages: ['updated_on'],
    resources: ['updated_on'],
    sessions: ['updated_on'],
    contributors: ['updated_on'],
    authorities: ['updated_on', 'reviewed_on'],
    libraries: ['updated_on', 'reviewed_on']
  })) {
    const collection = config.collections.find((item) => item.name === name);
    assert.ok(
      admin.includes(`${name}: [${fields.map((field) => `'${field}'`).join(', ')}]`),
      `${name} is stamped`
    );
    for (const field of fields)
      assert.ok(collection.fields.some((item) => item.name === field), `${name} has ${field}`);
  }
});

test('library records carry their services and the original update date', () => {
  const withServices = libraries.filter((library) => library.services?.length);
  assert.ok(withServices.length > 3700);
  for (const library of libraries) {
    assert.match(library.updated_on, /^\d{4}-\d{2}-\d{2}$/, `${library.name} has an update date`);
    for (const item of library.services || []) assert.ok(item.service, `${library.name} service name`);
  }
  const tenby = libraries.find((library) => library.slug === 'tenby-library');
  assert.deepEqual(
    tenby.services.map((item) => item.service),
    ['Books', 'Printing', 'Free Wi-Fi']
  );
  assert.ok(authorities.every((authority) => /^\d{4}-\d{2}-\d{2}$/.test(authority.updated_on)));
});

test('original "Last updated" dates are metadata, not repeated body text', () => {
  const pages = contentRecords('src/content/pages', '.md');
  assert.equal(pages.get('work-and-skills').data.updated_on, '2026-01-30');
  for (const [id, record] of pages) {
    const body = record.body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    assert.ok(!/^Last updated:/m.test(body), `${id} repeats its updated date`);
  }
});

test('library text fields are plain strings and facility labels keep original wording', async () => {
  const { facilityLabel } = await import('../src/lib/directory-model.mjs');
  for (const library of libraries)
    for (const field of ['openingTimesNotes', 'notes', 'address'])
      assert.equal(typeof library[field], 'string', `${library.name} ${field}`);
  assert.equal(facilityLabel('step-free-access'), 'Step-free access');
  assert.equal(facilityLabel('hearing-loop-system'), 'Hearing loop system');
});
