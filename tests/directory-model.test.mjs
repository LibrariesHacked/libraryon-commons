import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectory } from '../src/lib/directory-model.mjs';

test('individual library records determine authority membership and stable public paths', () => {
  const result = createDirectory(
    [{ name: 'Example', slug: 'example', country: 'England' }],
    [{ name: 'Central Library', slug: 'central', id: 'one', authority: 'example' }]
  );
  assert.equal(result.libraries.length, 1);
  assert.deepEqual(result.authorities[0].library_ids, ['one']);
  assert.equal(result.libraryPath(result.libraries[0]), '/libraries/example/central/');
});

test('unknown authorities and duplicate routes fail instead of losing records', () => {
  assert.throws(
    () => createDirectory([], [{ authority: 'missing', name: 'Library', slug: 'library' }]),
    /Unknown authority/
  );
  assert.throws(
    () =>
      createDirectory(
        [],
        [
          { name: 'One', slug: 'same' },
          { name: 'Two', slug: 'same' }
        ]
      ),
    /Duplicate library/
  );
});

test('legacy source slugs keep their public routes', () => {
  const result = createDirectory([], [{ name: 'Legacy', slug: 'Legacy-Library-' }]);
  assert.equal(result.libraryPath(result.libraries[0]), '/libraries/unassigned/Legacy-Library-/');
});

test('library pages reproduce operating model, map links and nearby libraries', async () => {
  const { operatingModelLabel, mapLinks, nearbyLibraries, collectValues } = await import(
    '../src/lib/directory-model.mjs'
  );
  assert.equal(operatingModelLabel('Local Authority Run'), 'Local authority staffed');
  assert.equal(operatingModelLabel('Independent Community'), 'Community-run');
  const here = { id: 'a', address: '1 High Street', latitude: 51.5, longitude: -0.1 };
  const links = mapLinks(here);
  assert.ok(links.google.includes('query=library%201%20High%20Street'));
  assert.ok(links.apple.includes('ll=51.5,-0.1'));
  assert.equal(mapLinks({}), null);
  const near = nearbyLibraries(
    here,
    [
      here,
      { id: 'far', latitude: 53.5, longitude: -2.2 },
      { id: 'near', latitude: 51.51, longitude: -0.1 },
      { id: 'closed', latitude: 51.5, longitude: -0.1001, permanentlyClosed: true },
      { id: 'nowhere' }
    ],
    2
  );
  assert.deepEqual(near.map((item) => item.library.id), ['near', 'far']);
  assert.ok(near[0].miles > 0.6 && near[0].miles < 0.8);
  assert.deepEqual(collectValues([{ a: ['x', 'y'] }, { a: ['y', 'z'] }, {}], (item) => item.a), ['x', 'y', 'z']);
});
