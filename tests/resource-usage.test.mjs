import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceUsage } from '../src/lib/resource-usage.mjs';

test('resource usage links include published pages and sessions, not unpublished pages', () => {
  const resources = [{ id: 'report' }, { id: 'slides' }];
  const pages = [
    {
      id: 'grants',
      data: {
        title: 'UK library grants programme | LibraryOn',
        path: '/grants',
        resources: ['report', 'slides'],
      },
      body: '# LibraryOn grants programme',
    },
    {
      id: 'draft',
      data: { title: 'Draft', path: '/draft', published: false, resources: ['report'] },
      body: '# Draft',
    },
  ];
  const sessions = [
    {
      id: 'data-storytelling',
      data: { title: 'Data storytelling live', resources: ['slides'] },
    },
  ];

  const usage = resourceUsage(resources, pages, sessions);
  assert.deepEqual(usage.get('report'), [
    { label: 'LibraryOn grants programme', href: '/grants' },
  ]);
  assert.deepEqual(usage.get('slides'), [
    { label: 'LibraryOn grants programme', href: '/grants' },
    { label: 'Data storytelling live', href: '/sessions/data-storytelling/' },
  ]);
});