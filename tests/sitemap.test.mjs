import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPageTree } from '../src/lib/sitemap.mjs';

test('page sitemap groups published routes by their actual path hierarchy', () => {
  const tree = buildPageTree([
    { data: { title: 'Special collections', path: '/special-collections/' }, body: '# Collections' },
    { data: { title: 'Curious competitions | LibraryOn', path: '/special-collections/curious-competitions' }, body: '# Curious competitions' },
    { data: { title: 'Library grants', path: '/grants' }, body: '# Library grants' },
  ]);

  assert.deepEqual(
    tree.map(({ label, href }) => ({ label, href })),
    [
      { label: 'Collections', href: '/special-collections/' },
      { label: 'Library grants', href: '/grants' },
    ],
  );
  assert.deepEqual(tree[0].children, [
    {
      label: 'Curious competitions',
      href: '/special-collections/curious-competitions',
      children: [],
    },
  ]);
});