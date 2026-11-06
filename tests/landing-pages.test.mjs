/**
 * @fileoverview Automated tests for landing page structures, child page links, and section navigation.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

const readPage = (file) => {
  const source = readFileSync(new URL(`../src/content/pages/${file}.md`, import.meta.url), 'utf8')
  return parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(source)[1])
}
const settings = JSON.parse(
  readFileSync(new URL('../src/data/settings.json', import.meta.url), 'utf8')
)

test('landing page child order follows the original editorial sequence', () => {
  assert.deepEqual(readPage('reading').child_pages, [
    '/reading/reading-in-libraries',
    '/reading/reading-children-young-people-in-libraries',
    '/reading/e-lending-in-libraries'
  ])
  assert.deepEqual(readPage('work-and-skills').child_pages, [
    '/work-and-skills/business-support',
    '/work-and-skills/makerspaces',
    '/work-and-skills/cafes',
    '/work-and-skills/study-work-spaces',
    '/work-and-skills/digital-skills'
  ])
  assert.deepEqual(readPage('your-community').child_pages, [
    '/your-community/find-your-community',
    '/your-community/children-parents-carers-community'
  ])
  assert.deepEqual(readPage('special-collections').child_pages, [
    '/special-collections/frances-wolseley-gardening-educator',
    '/special-collections/lacemaking-in-nottingham',
    '/special-collections/early-days-of-circus',
    '/special-collections/library-photo-collections',
    '/special-collections/curious-competitions'
  ])
  assert.deepEqual(readPage('grants').child_pages, [
    '/archive/grants/round-3',
    '/archive/grants/round-1',
    '/archive/grants/round-2'
  ])
  assert.deepEqual(readPage('archive').child_pages, [
    '/archive/about-libraryon',
    '/archive/grants',
    '/archive/pressplay'
  ])
  assert.equal(readPage('about').child_pages, undefined)
  assert.equal(readPage('about--pressplay').path, '/archive/pressplay')
  for (const [file, path] of [
    ['grants', '/archive/grants'],
    ['grants--round-1', '/archive/grants/round-1'],
    ['grants--round-2', '/archive/grants/round-2'],
    ['grants--round-3', '/archive/grants/round-3']
  ]) {
    assert.equal(readPage(file).path, path)
  }
  assert.equal(readPage('about').path, '/archive/about-libraryon')
  const redirects = new Map(settings.redirects.map(({ from, to }) => [from, to]))
  for (const [from, to] of [
    ['/about', '/archive/about-libraryon/'],
    ['/about/', '/archive/about-libraryon/'],
    ['/about/pressplay', '/archive/pressplay/'],
    ['/about/pressplay/', '/archive/pressplay/'],
    ['/grants', '/archive/grants/'],
    ['/grants/', '/archive/grants/'],
    ['/grants/round-1', '/archive/grants/round-1/'],
    ['/grants/round-1/', '/archive/grants/round-1/'],
    ['/grants/round-2', '/archive/grants/round-2/'],
    ['/grants/round-2/', '/archive/grants/round-2/'],
    ['/grants/round-3', '/archive/grants/round-3/'],
    ['/grants/round-3/', '/archive/grants/round-3/']
  ]) {
    assert.equal(redirects.get(from), to)
  }
})

test('source-backed reading and work pages have full-size lead images', () => {
  const reading = readPage('reading')
  const work = readPage('work-and-skills')
  assert.equal(reading.hero.image, '/uploads/archive/library-visitor-reading-beside-a-window.jpg')
  assert.match(reading.hero.alt, /red-haired woman/i)
  assert.equal(work.hero.image, '/uploads/archive/library-users-working-in-study-booths.jpg')
  assert.match(work.hero.alt, /working in study booths/i)
})
