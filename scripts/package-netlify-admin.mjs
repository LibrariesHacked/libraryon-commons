import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export function packageNetlifyAdmin({ root = process.cwd() } = {}) {
  const dist = path.join(root, 'dist')
  const output = path.join(root, '.deploy/netlify-admin')
  for (const required of ['admin/index.html', 'admin/config.yml', '_astro']) {
    if (!existsSync(path.join(dist, required))) {
      throw new Error(`Missing built CMS asset: dist/${required}`)
    }
  }

  mkdirSync(output, { recursive: true })
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
