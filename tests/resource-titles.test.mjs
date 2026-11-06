/**
 * @fileoverview Automated tests for downloadable resource titles, slug stability, and uniqueness.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { descriptiveSlug } from '../scripts/migrate-filenames.mjs'

const root = new URL('../src/content/resources/', import.meta.url)

test('resource records have unique contextual titles', () => {
  const resources = readdirSync(root)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(new URL(file, root), 'utf8')))
  const titles = resources.map((resource) => resource.title)
  assert.equal(new Set(titles).size, titles.length)
})

test('grants recordings are named for their session in content and the resource catalog', () => {
  const page = readFileSync(new URL('../src/content/pages/grants.md', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /^\[Watch the recording\]/m)
  const links = [...page.matchAll(/^\[Watch recording: (.+)\]\((.+)\)$/gm)]
  assert.equal(links.length, 12)
  const resourceDir = new URL('../src/content/resources/', import.meta.url)
  const resources = readdirSync(resourceDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({
      file,
      data: JSON.parse(readFileSync(new URL(file, resourceDir), 'utf8'))
    }))
  for (const [, title, url] of links) {
    const resource = resources.find((record) => record.data.url === url)
    assert.ok(resource, `Missing recording resource for ${title}`)
    assert.equal(resource.data.title, `${title} — Recording`)
    assert.equal(resource.file, `${descriptiveSlug(resource.data.title)}.json`)
  }
})
