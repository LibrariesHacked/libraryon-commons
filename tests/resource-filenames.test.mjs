/**
 * @fileoverview Automated tests for descriptive resource and media filename migration rules.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { digest } from '../scripts/archive/collect.mjs'
import { descriptiveSlug, migrateFilenames } from '../scripts/migrate-filenames.mjs'

const writeJSON = (root, file, value) =>
  writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`)

test('selected resource titles rename files and preserve references and import history', (context) => {
  const root = mkdtempSync(path.join(tmpdir(), 'libraryon-resource-filenames-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  for (const folder of [
    'src/content/pages',
    'src/content/resources',
    'src/content/sessions',
    'src/data',
    'public/admin',
    'public/uploads',
    'migration'
  ]) {
    mkdirSync(path.join(root, folder), { recursive: true })
  }

  const oldId = 'application-portal-2'
  const newId = 'grants-round-one-application-portal'
  const pageFile = 'src/content/pages/grants.md'
  const sessionFile = 'src/content/sessions/grants-round-one.json'
  const resourceFile = `src/content/resources/${oldId}.json`
  const resource = {
    title: 'Grants round one — Application portal',
    kind: 'link',
    url: 'https://example.org/application-portal-2'
  }
  const page = `---\ntitle: Grants\npath: /grants\nresources:\n  - ${oldId}\n---\n\n# Grants\n`
  const session = { title: 'Grants round one', resources: [oldId] }
  writeJSON(root, resourceFile, resource)
  writeFileSync(path.join(root, pageFile), page)
  writeJSON(root, sessionFile, session)
  writeJSON(root, 'src/data/homepage.json', {})
  writeJSON(root, 'src/data/settings.json', { redirects: [] })
  writeJSON(root, 'migration/import-report.json', {
    assets: [],
    sessions: [{ resources: [oldId] }]
  })
  writeJSON(root, 'migration/import-state.json', {
    files: {
      [resourceFile]: digest(readFileSync(path.join(root, resourceFile))),
      [pageFile]: digest(page),
      [sessionFile]: digest(readFileSync(path.join(root, sessionFile)))
    }
  })
  writeJSON(root, 'migration/filenames.json', {
    version: 1,
    renames: [
      {
        from: 'src/content/resources/resource-opaque.json',
        to: resourceFile
      }
    ]
  })

  const preview = migrateFilenames({ root, resourceIds: [oldId] })
  assert.equal(preview.applied, false)
  assert.deepEqual(preview.renames, [
    { from: resourceFile, to: `src/content/resources/${newId}.json` }
  ])
  assert.ok(existsSync(path.join(root, resourceFile)))

  const result = migrateFilenames({ root, resourceIds: [oldId], apply: true })
  assert.equal(result.applied, true)
  assert.ok(!existsSync(path.join(root, resourceFile)))
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(root, `src/content/resources/${newId}.json`), 'utf8')),
    resource
  )
  assert.match(readFileSync(path.join(root, pageFile), 'utf8'), new RegExp(newId))
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, sessionFile), 'utf8')).resources, [
    newId
  ])
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(root, 'migration/import-report.json'), 'utf8')).sessions[0]
      .resources,
    [newId]
  )
  const state = JSON.parse(
    readFileSync(path.join(root, 'migration/import-state.json'), 'utf8')
  ).files
  assert.ok(state[`src/content/resources/${newId}.json`])
  assert.ok(!state[resourceFile])
  const filenameMap = JSON.parse(
    readFileSync(path.join(root, 'migration/filenames.json'), 'utf8')
  ).renames
  assert.equal(filenameMap[0].to, `src/content/resources/${newId}.json`)
  assert.equal(filenameMap[1].to, `src/content/resources/${newId}.json`)
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(root, 'src/data/settings.json'), 'utf8')).redirects,
    [{ from: `/resources/${oldId}/`, to: `/resources/${newId}/` }]
  )
})

test('renamed resource filenames match their titles and old detail routes redirect', () => {
  const settings = JSON.parse(
    readFileSync(new URL('../src/data/settings.json', import.meta.url), 'utf8')
  )
  const mappings = JSON.parse(
    readFileSync(new URL('../migration/filenames.json', import.meta.url), 'utf8')
  ).renames
  const redirects = settings.redirects.filter(
    (item) => item.from.startsWith('/resources/') && item.to.startsWith('/resources/')
  )
  assert.equal(redirects.length, 28)

  const resources = new URL('../src/content/resources/', import.meta.url)
  for (const redirect of redirects) {
    const oldId = redirect.from.split('/').filter(Boolean).at(-1)
    const newId = redirect.to.split('/').filter(Boolean).at(-1)
    const file = `${newId}.json`
    const resource = JSON.parse(readFileSync(new URL(file, resources), 'utf8'))
    assert.equal(file, `${descriptiveSlug(resource.title)}.json`)
    assert.ok(
      mappings.some(
        (entry) =>
          entry.from === `src/content/resources/${oldId}.json` &&
          entry.to === `src/content/resources/${file}`
      ),
      `Missing filename history for ${oldId}`
    )
  }
})
