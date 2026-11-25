/** @fileoverview Native service collection boundaries and byte-preserving folder migration. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parse } from 'yaml'
import {
  expandLibraryCollections,
  libraryCollectionName,
  directoryCollectionKind,
  libraryRecordFile
} from '../src/lib/cms/libraryCollections.mjs'
import {
  filterCollectionsForPermissions,
  validateEntrySave
} from '../src/lib/cms/cmsAuthHelpers.mjs'
import { prepareLibraryAuthority } from '../src/lib/cms/directoryControls.mjs'
import { prepareDirectoryEdit } from '../src/lib/directory/schemaHelpers.mjs'
import { jsonRecordFiles } from '../src/lib/directory/recordFiles.mjs'
import { directoryReviewRows } from '../src/lib/cms/reviewHelpers.mjs'
import { splitLibraries } from '../scripts/directory/split-libraries.mjs'
import {
  applyLibrarySlugCorrection,
  librarySlugRedirects
} from '../src/lib/directory/slugCorrections.mjs'
import slugAudit from '../migration/directory/library-slug-changes.json' with { type: 'json' }
import authorities from '../src/data/cms-lookups/authorities.json' with { type: 'json' }

const sourceConfig = parse(readFileSync('public/admin/config.yml', 'utf8'))
const config = expandLibraryCollections(sourceConfig, authorities.items)
const general = { allowed: true, isGeneralEditor: true, role: 'general-editor', gssCodes: ['*'] }

test('all libraries use native service folders, preserving the shared form and stock backend', () => {
  assert.equal(config.backend.name, 'git-gateway')
  const collections = config.collections.filter(
    ({ name }) => directoryCollectionKind(name) === 'libraries'
  )
  assert.equal(collections.length, authorities.items.length + 1)
  assert.ok(!config.collections.some(({ name }) => name === 'libraries'))
  assert.equal(new Set(collections.map(({ folder }) => folder)).size, collections.length)
  assert.equal(
    sourceConfig.collections.find(({ name }) => name === 'libraries').fields[0].widget,
    'relation'
  )
  const names = new Set(collections.map(({ name }) => name))
  const files = jsonRecordFiles('src/content/libraries')
  assert.equal(files.length, 4241)
  for (const file of files) {
    const record = JSON.parse(readFileSync(join('src/content/libraries', file), 'utf8'))
    assert.equal(file, libraryRecordFile(file, record))
    assert.ok(names.has(libraryCollectionName(record.authority)), file)
    const collection = collections.find(
      ({ name }) => name === libraryCollectionName(record.authority)
    )
    assert.equal(collection.delete, false)
    assert.equal(collection.slug, '{{fields.slug}}')
    assert.equal(collection.fields[0].widget, 'hidden')
    assert.equal(collection.fields[0].default, record.authority)
    const prepared = prepareDirectoryEdit(
      prepareLibraryAuthority(record, authorities.items),
      'libraries'
    )
    assert.equal(validateEntrySave(prepared, collection.name, general), true)
  }
  assert.throws(() => libraryCollectionName('../escape'), /Invalid/)
  assert.throws(
    () => libraryRecordFile('bad.json', { authority: 'example', slug: '../escape' }),
    /Invalid library slug/
  )
  assert.throws(
    () => expandLibraryCollections(sourceConfig, [authorities.items[0], authorities.items[0]]),
    /Duplicate/
  )
})

test('service and multi-service accounts only receive assigned native folders and authority files', () => {
  const allowed = authorities.items.slice(0, 2)
  const user = {
    allowed: true,
    isGeneralEditor: false,
    role: 'service-editor',
    gssCodes: allowed.map(({ code }) => code)
  }
  const filtered = filterCollectionsForPermissions(config.collections, user, authorities.items)
  const folders = filtered.filter(({ folder }) => folder).map(({ folder }) => folder)
  assert.deepEqual(
    folders,
    allowed.map(({ id }) => `src/content/libraries/${id}`)
  )
  const services = filtered.find(({ name }) => name === 'authorities')
  assert.ok(!services.folder)
  assert.deepEqual(
    services.files.map(({ file }) => file),
    allowed.map(({ id }) => `src/content/authorities/${id}.json`)
  )
  assert.ok(!filtered.some(({ name }) => name === 'libraries--unassigned'))
  assert.deepEqual(
    filterCollectionsForPermissions(
      config.collections,
      { ...user, allowed: false },
      authorities.items
    ),
    []
  )
  assert.deepEqual(filterCollectionsForPermissions(config.collections, null, authorities.items), [])
  assert.equal(
    filterCollectionsForPermissions(config.collections, general, authorities.items).length,
    config.collections.length
  )
  const record = { authority: allowed[0].id, local_authority_code: allowed[0].code }
  assert.equal(validateEntrySave(record, libraryCollectionName(allowed[0].id), user), true)
  for (const permissions of [general, user]) {
    assert.throws(
      () => validateEntrySave(record, libraryCollectionName(allowed[1].id), permissions),
      /different service folder/
    )
  }
  assert.throws(
    () =>
      validateEntrySave(
        { authority: '', local_authority_code: allowed[0].code },
        'libraries--unassigned',
        user
      ),
    /unassigned/
  )
})

test('review links identify the correct native collection even with duplicate basenames', () => {
  const record = {
    slug: 'central',
    library_name: 'Central',
    validation_exceptions: [{ field: 'library_name', reason: 'Check' }]
  }
  const rows = directoryReviewRows(
    {
      libraries: [
        { file: 'one/central.json', record: { ...record, authority: 'one' } },
        { file: 'two/central.json', record: { ...record, authority: 'two' } }
      ]
    },
    {}
  )
  assert.equal(new Set(rows.map(({ key }) => key)).size, 2)
  assert.equal(rows[0].editPath, '/admin/#/collections/libraries--one/entries/central')
  assert.equal(rows[1].detailPath, '/admin/review-data/libraries--two/central.json')
  assert.equal(rows[0].publicPath, '/libraries/one/central/')
})

test('folder migration preflights conflicts, preserves bytes and replay hashes, and is repeatable', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'library-folders-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const libraries = join(root, 'src/content/libraries')
  mkdirSync(libraries, { recursive: true })
  mkdirSync(join(root, 'src/content/authorities'), { recursive: true })
  mkdirSync(join(root, 'migration/directory'), { recursive: true })
  writeFileSync(join(root, 'src/content/authorities/example.json'), '{"slug":"example"}')
  const bytes = Buffer.from(
    '{\r\n  "id":"one", "slug":"central", "authority":"example", "reviewed_on":"2020-01-01"\r\n}\r\n'
  )
  writeFileSync(join(libraries, 'example--central.json'), bytes)
  const manifestPath = join(root, 'migration/directory/written-files.json')
  writeFileSync(
    manifestPath,
    JSON.stringify({ 'src/content/libraries/example--central.json': 'original-replay-hash' })
  )
  assert.deepEqual(splitLibraries(root), { records: 1, moved: 1, unchangedBytes: 1 })
  assert.deepEqual(readFileSync(join(libraries, 'example/central.json')), bytes)
  assert.deepEqual(JSON.parse(readFileSync(manifestPath)), {
    'src/content/libraries/example/central.json': 'original-replay-hash'
  })
  assert.equal(splitLibraries(root).moved, 0)
  writeFileSync(join(libraries, 'example--central.json'), bytes)
  assert.throws(() => splitLibraries(root), /Duplicate|already exists/)
  assert.ok(existsSync(join(libraries, 'example--central.json')))
})

test('prefixed files already in service folders are renamed without rewriting or losing replay hashes', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'library-names-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const folder = join(root, 'src/content/libraries/example')
  mkdirSync(folder, { recursive: true })
  mkdirSync(join(root, 'src/content/authorities'), { recursive: true })
  mkdirSync(join(root, 'migration/directory'), { recursive: true })
  writeFileSync(join(root, 'src/content/authorities/example.json'), '{"slug":"example"}')
  const bytes = Buffer.from(
    '{"id":"one","authority":"example","slug":"central","updated_on":"2020-01-01"}\r\n'
  )
  writeFileSync(join(folder, 'example--central.json'), bytes)
  const manifestPath = join(root, 'migration/directory/written-files.json')
  writeFileSync(
    manifestPath,
    JSON.stringify({ 'src/content/libraries/example/example--central.json': 'preserved-hash' })
  )
  assert.equal(splitLibraries(root).moved, 1)
  assert.deepEqual(readFileSync(join(folder, 'central.json')), bytes)
  assert.ok(!existsSync(join(folder, 'example--central.json')))
  assert.deepEqual(JSON.parse(readFileSync(manifestPath)), {
    'src/content/libraries/example/central.json': 'preserved-hash'
  })
  assert.equal(splitLibraries(root).moved, 0)
})

test('approved slug changes are explicit, repeatable, preserve metadata and supply old-route redirects', () => {
  assert.equal(slugAudit.changes.length, 16)
  assert.equal(new Set(slugAudit.changes.map(({ id }) => id)).size, 16)
  for (const change of slugAudit.changes) {
    const file = `src/content/libraries/${change.authority}/${change.after}.json`
    const record = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(record.id, change.id)
    assert.equal(record.slug, change.after)
    const before = { ...record, slug: change.before }
    assert.deepEqual(applyLibrarySlugCorrection(before), record)
    assert.equal(applyLibrarySlugCorrection(record), record)
    assert.equal(
      librarySlugRedirects[`/libraries/${change.authority}/${change.before}/`],
      `/libraries/${change.authority}/${change.after}/`
    )
    assert.throws(
      () => applyLibrarySlugCorrection({ ...before, slug: 'unexpected-editor-change' }),
      /no longer matches/
    )
  }
})

test('slug correction migration rewrites only the slug and keeps original replay protection', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'library-slug-correction-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const change = slugAudit.changes[0]
  const folder = join(root, 'src/content/libraries', change.authority)
  mkdirSync(folder, { recursive: true })
  mkdirSync(join(root, 'src/content/authorities'), { recursive: true })
  mkdirSync(join(root, 'migration/directory'), { recursive: true })
  writeFileSync(
    join(root, 'src/content/authorities', `${change.authority}.json`),
    JSON.stringify({ slug: change.authority })
  )
  const before =
    JSON.stringify(
      {
        id: change.id,
        authority: change.authority,
        slug: change.before,
        source_url: 'https://example.org/original',
        reviewed_on: '2020-01-01'
      },
      null,
      2
    ) + '\r\n'
  const filename = `${change.authority}--${change.before}.json`
  writeFileSync(join(folder, filename), before)
  const manifestPath = join(root, 'migration/directory/written-files.json')
  writeFileSync(
    manifestPath,
    JSON.stringify({ [`src/content/libraries/${change.authority}/${filename}`]: 'original-hash' })
  )
  assert.deepEqual(splitLibraries(root), {
    records: 1,
    moved: 1,
    unchangedBytes: 0,
    correctedSlugs: 1
  })
  assert.equal(
    readFileSync(join(folder, `${change.after}.json`), 'utf8'),
    before.replace(`"slug": "${change.before}"`, `"slug": "${change.after}"`)
  )
  assert.deepEqual(JSON.parse(readFileSync(manifestPath)), {
    [`src/content/libraries/${change.authority}/${change.after}.json`]: 'original-hash'
  })
  assert.equal(splitLibraries(root).moved, 0)
})
