/**
 * @fileoverview Automated tests for nested sitemap tree building and route hierarchy grouping.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPageTree } from '../src/lib/helpers/sitemapHelpers.mjs'

test('page sitemap groups published routes by their actual path hierarchy', () => {
  const tree = buildPageTree([
    { data: { title: 'Archive', path: '/archive' }, body: '# Archive' },
    {
      data: { title: 'Special collections', path: '/special-collections/' },
      body: '# Collections'
    },
    {
      data: {
        title: 'Curious competitions | LibraryOn',
        path: '/special-collections/curious-competitions'
      },
      body: '# Curious competitions'
    },
    {
      data: { title: 'About LibraryOn', path: '/archive/about-libraryon' },
      body: '# About LibraryOn'
    },
    { data: { title: 'Library grants', path: '/archive/grants' }, body: '# Library grants' },
    {
      data: { title: 'Grant round one', path: '/archive/grants/round-1' },
      body: '# Grant round one'
    },
    {
      data: { title: 'Press Play Conference', path: '/archive/pressplay' },
      body: '# Press Play Conference'
    }
  ])

  assert.deepEqual(
    tree.map(({ label, href }) => ({ label, href })),
    [
      { label: 'Archive', href: '/archive' },
      { label: 'Collections', href: '/special-collections/' }
    ]
  )
  assert.deepEqual(tree[0].children, [
    {
      label: 'About LibraryOn',
      href: '/archive/about-libraryon',
      children: []
    },
    {
      label: 'Library grants',
      href: '/archive/grants',
      children: [
        {
          label: 'Grant round one',
          href: '/archive/grants/round-1',
          children: []
        }
      ]
    },
    {
      label: 'Press Play Conference',
      href: '/archive/pressplay',
      children: []
    }
  ])
  assert.deepEqual(tree[1].children, [
    {
      label: 'Curious competitions',
      href: '/special-collections/curious-competitions',
      children: []
    }
  ])
})
