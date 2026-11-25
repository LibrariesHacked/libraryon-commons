/**
 * @fileoverview Verify deterministic native CMS lookups, stored IDs, freshness and deployment wiring.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'
import { generateCmsLookups, syncCmsLookups } from '../scripts/cms-lookups.mjs'
import { validateEntrySave } from '../src/lib/cms/cmsAuthHelpers.mjs'
import { updateDirectoryCms } from '../scripts/directory-schemas.mjs'
import { pathToFileURL } from 'node:url'

const config = parse(readFileSync('public/admin/config.yml', 'utf8'))

/**
 * Create an isolated repository fixture, always removing its files after the test.
 * @param {import('node:test').TestContext} t - Test cleanup registration.
 * @returns {string} Temporary repository root.
 */
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cms-lookups-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const name of ['resources', 'authorities']) {
    mkdirSync(path.join(root, 'src', 'content', name), { recursive: true })
  }
  return root
}

/**
 * Write one JSON source record to a fixture.
 * @param {string} root - Fixture root.
 * @param {string} collection - Source collection name.
 * @param {string} id - Filename slug.
 * @param {object | null} data - Record fields, or invalid input for a validation test.
 * @returns {void}
 */
function record(root, collection, id, data) {
  writeFileSync(path.join(root, 'src', 'content', collection, `${id}.json`), JSON.stringify(data))
}

test('tracked lookups contain every original ID and label with small payloads', () => {
  assert.deepEqual(syncCmsLookups({ check: true }), [])
  for (const output of generateCmsLookups()) {
    const name = path.basename(output.file, '.json')
    const labelField = name === 'resources' ? 'title' : 'local_authority'
    const files = readdirSync(path.join('src', 'content', name))
      .filter((file) => !file.startsWith('.') && file.endsWith('.json'))
      .sort()
    const { items } = JSON.parse(output.content)
    assert.equal(items.length, files.length)
    assert.ok(items.length > 200)
    assert.ok(Buffer.byteLength(output.content) < 50_000, `${name} stays below 50 KB`)
    assert.equal(new Set(items.map(({ id }) => id)).size, items.length)
    assert.deepEqual(
      items,
      files.map((file) => {
        const record = JSON.parse(readFileSync(path.join('src', 'content', name, file), 'utf8'))
        return name === 'authorities'
          ? {
              id: path.basename(file, '.json'),
              label: `${record[labelField]} (${record.local_authority_code})`,
              name: record[labelField],
              code: record.local_authority_code
            }
          : { id: path.basename(file, '.json'), label: record[labelField] }
      })
    )
  }
})

test('generation is deterministic, repeatable and updates additions, renames and deletions', (t) => {
  const root = fixture(t)
  record(root, 'resources', 'z-last', { title: 'Original title', body: 'Not copied' })
  record(root, 'resources', 'a-first', { title: 'First & "quoted"' })
  record(root, 'authorities', 'service', {
    local_authority: 'A service',
    local_authority_code: 'E08000001',
    slug: 'service'
  })
  writeFileSync(path.join(root, 'src', 'content', 'resources', '.gitkeep'), '')
  assert.equal(syncCmsLookups({ root }).length, 2)
  assert.deepEqual(syncCmsLookups({ root }), [])
  const before = generateCmsLookups(root)
  assert.deepEqual(
    JSON.parse(before[0].content).items.map(({ id }) => id),
    ['a-first', 'z-last']
  )
  record(root, 'resources', 'z-last', { title: 'Renamed title' })
  record(root, 'resources', 'new-resource', { title: 'New resource' })
  rmSync(path.join(root, 'src', 'content', 'resources', 'a-first.json'))
  assert.throws(() => syncCmsLookups({ root, check: true }), /CMS lookups are stale/)
  assert.equal(readFileSync(path.join(root, before[0].file), 'utf8'), before[0].content)
  assert.equal(syncCmsLookups({ root }).length, 1)
  assert.deepEqual(JSON.parse(generateCmsLookups(root)[0].content).items, [
    { id: 'new-resource', label: 'New resource' },
    { id: 'z-last', label: 'Renamed title' }
  ])
  assert.deepEqual(syncCmsLookups({ root, check: true }), [])
})

test('invalid sources fail before any lookup is written', (t) => {
  const root = fixture(t)
  record(root, 'resources', 'valid', { title: 'Valid' })
  record(root, 'authorities', 'invalid', { local_authority: ' ' })
  assert.throws(() => syncCmsLookups({ root }), /Missing CMS lookup label/)
  assert.throws(
    () => readFileSync(path.join(root, 'src', 'data', 'cms-lookups', 'resources.json')),
    {
      code: 'ENOENT'
    }
  )
  record(root, 'authorities', 'invalid', null)
  assert.throws(() => syncCmsLookups({ root }), /Missing CMS lookup label/)
  record(root, 'authorities', 'invalid', {
    local_authority: 'Fixed',
    local_authority_code: 'E08000001'
  })
  record(root, 'resources', 'bad_id', { title: 'Invalid slug' })
  assert.throws(() => syncCmsLookups({ root }), /Invalid CMS lookup ID/)
})

test('only the intended relations use native single-file lookup lists', () => {
  for (const [collectionName, fieldName, target, file] of [
    ['pages', 'resources', 'resource_lookups', 'resources'],
    ['sessions', 'resources', 'resource_lookups', 'resources'],
    ['libraries', 'authority', 'authority_lookups', 'authorities']
  ]) {
    const field = config.collections
      .find(({ name }) => name === collectionName)
      .fields.find(({ name }) => name === fieldName)
    assert.equal(field.widget, 'relation')
    assert.equal(field.collection, target)
    assert.equal(field.file, file)
    assert.equal(field.value_field, 'items.*.id')
    assert.deepEqual(field.search_fields, ['items.*.label'])
    assert.deepEqual(field.display_fields, ['items.*.label'])
    const lookup = config.collections.find(({ name }) => name === target)
    assert.equal(lookup.hide, true)
    assert.equal(lookup.delete, false)
    assert.equal(lookup.files.length, 1)
    assert.equal(lookup.files[0].name, file)
    assert.equal(lookup.files[0].file, `src/data/cms-lookups/${file}.json`)
    assert.equal(lookup.files[0].fields[0].name, 'items')
  }
  const pages = config.collections.find(({ name }) => name === 'pages')
  for (const name of ['faqs', 'contributors', 'child_pages']) {
    assert.equal(pages.fields.find((field) => field.name === name).file, undefined)
  }
  assert.equal(
    config.collections
      .find(({ name }) => name === 'sessions')
      .fields.find(({ name }) => name === 'conference').collection,
    'pages'
  )
})

test('generated lookup saves are rejected even for general editors', () => {
  for (const collection of ['resource_lookups', 'authority_lookups']) {
    for (const isGeneralEditor of [true, false]) {
      assert.throws(
        () => validateEntrySave({}, collection, { allowed: true, isGeneralEditor }),
        /CMS lookups are generated automatically/
      )
    }
  }
})

test('directory schema regeneration preserves the native authority lookup', (t) => {
  const root = fixture(t)
  mkdirSync(path.join(root, 'public', 'admin'), { recursive: true })
  mkdirSync(path.join(root, 'src', 'data', 'schemas'), { recursive: true })
  writeFileSync(
    path.join(root, 'public', 'admin', 'config.yml'),
    readFileSync('public/admin/config.yml')
  )
  for (const name of ['libraries', 'library-services']) {
    writeFileSync(
      path.join(root, 'src', 'data', 'schemas', `${name}.json`),
      readFileSync(path.join('src', 'data', 'schemas', `${name}.json`))
    )
  }
  updateDirectoryCms(pathToFileURL(`${root}${path.sep}`))
  const regenerated = parse(readFileSync(path.join(root, 'public', 'admin', 'config.yml'), 'utf8'))
  const authorityField = (configuration) =>
    configuration.collections
      .find(({ name }) => name === 'libraries')
      .fields.find(({ name }) => name === 'authority')
  assert.deepEqual(authorityField(regenerated), authorityField(config))
})

test('CI regenerates before tests and deployment persists only the generated files', () => {
  for (const workflow of ['validate', 'deploy-hosting']) {
    const source = readFileSync(path.join('.github', 'workflows', `${workflow}.yml`), 'utf8')
    assert.ok(source.indexOf('npm run cms:lookups') < source.indexOf('npm test'))
    const parsed = parse(source)
    assert.equal(parsed.permissions.contents, 'read')
    if (workflow === 'deploy-hosting') {
      assert.equal(parsed.jobs.build.permissions.contents, 'write')
      assert.ok(source.indexOf('npm test') < source.indexOf('git add src/data/cms-lookups/'))
      assert.match(source, /git push origin HEAD:main/)
      assert.doesNotMatch(source, /--force|\[skip ci\]/)
      assert.match(
        source,
        /git add src\/data\/cms-lookups\/resources.json src\/data\/cms-lookups\/authorities.json/
      )
    }
  }
})
