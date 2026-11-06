/**
 * @fileoverview Packaging script for isolated Netlify Decap CMS administration deployments.
 */

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Package built CMS routes, review evidence, runtime assets and community uploads only.
 * Public editorial pages and preserved archive uploads remain on the main site's host.
 * @param {{root?: string}} [options] - Repository root or temporary packaging fixture.
 * @returns {string} Netlify deployment directory with a root redirect and noindex headers.
 * @throws {Error} When required built CMS assets are absent.
 */
export function packageNetlifyAdmin({ root = process.cwd() } = {}) {
  const dist = path.join(root, 'dist')
  const output = path.join(root, '.deploy/netlify-admin')
  for (const required of ['admin/index.html', 'admin/config.yml', '_astro']) {
    if (!existsSync(path.join(dist, required))) {
      throw new Error(`Missing built CMS asset: dist/${required}`)
    }
  }

  mkdirSync(output, { recursive: true })
  writeFileSync(path.join(output, '_headers'), '/admin/*\n  X-Robots-Tag: noindex, nofollow\n')
  cpSync(path.join(dist, 'admin'), path.join(output, 'admin'), { recursive: true })
  cpSync(path.join(dist, '_astro'), path.join(output, '_astro'), { recursive: true })
  const communityUploads = path.join(dist, 'uploads/community')
  if (existsSync(communityUploads)) {
    cpSync(communityUploads, path.join(output, 'uploads/community'), { recursive: true })
  }

  writeFileSync(
    path.join(output, 'index.html'),
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/admin/"><title>LibraryCommons editor</title><p><a href="/admin/">Open the LibraryCommons editor</a></p></html>\n'
  )
  return output
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(packageNetlifyAdmin())
}
