import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const readPage = (file) => {
  const source = readFileSync(new URL(`../src/content/pages/${file}.md`, import.meta.url), 'utf8');
  return parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(source)[1]);
};

test('landing page child order follows the original editorial sequence', () => {
  assert.deepEqual(readPage('reading').child_pages, [
    '/reading/reading-in-libraries',
    '/reading/reading-children-young-people-in-libraries',
    '/reading/e-lending-in-libraries',
  ]);
  assert.deepEqual(readPage('work-and-skills').child_pages, [
    '/work-and-skills/business-support',
    '/work-and-skills/makerspaces',
    '/work-and-skills/cafes',
    '/work-and-skills/study-work-spaces',
    '/work-and-skills/digital-skills',
  ]);
  assert.deepEqual(readPage('your-community').child_pages, [
    '/your-community/find-your-community',
    '/your-community/children-parents-carers-community',
  ]);
  assert.deepEqual(readPage('special-collections').child_pages, [
    '/special-collections/frances-wolseley-gardening-educator',
    '/special-collections/lacemaking-in-nottingham',
    '/special-collections/early-days-of-circus',
    '/special-collections/library-photo-collections',
    '/special-collections/curious-competitions',
  ]);
  assert.deepEqual(readPage('grants').child_pages, [
    '/grants/round-3',
    '/grants/round-1',
    '/grants/round-2',
  ]);
  assert.deepEqual(readPage('about').child_pages, ['/about/pressplay']);
});

test('source-backed reading and work pages have full-size lead images', () => {
  const reading = readPage('reading');
  const work = readPage('work-and-skills');
  assert.equal(reading.hero.image, '/uploads/archive/library-visitor-reading-beside-a-window.jpg');
  assert.match(reading.hero.alt, /red-haired woman/i);
  assert.equal(work.hero.image, '/uploads/archive/library-users-working-in-study-booths.jpg');
  assert.match(work.hero.alt, /working in study booths/i);
});