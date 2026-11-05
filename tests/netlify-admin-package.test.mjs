import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { packageNetlifyAdmin } from '../scripts/package-netlify-admin.mjs'

test('Netlify CMS package contains only the editor, runtime assets, and community uploads', (context) => {
  const root = mkdtempSync(path.join(tmpdir(), 'librarycommons-admin-package-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  for (const file of [
    'dist/admin/index.html',
    'dist/admin/config.yml',
    'dist/admin/review/index.html',
    'dist/admin/review-data/authorities/merthyr-tydfil.json',
    'dist/_astro/editor.js',
    'dist/uploads/community/library-guide.jpg',
    'dist/uploads/archive/original.pdf',
    'dist/reading/index.html'
  ]) {
    const target = path.join(root, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, file)
  }

  const output = packageNetlifyAdmin({ root })
  assert.ok(existsSync(path.join(output, 'admin/index.html')))
  assert.ok(existsSync(path.join(output, 'admin/config.yml')))
  assert.ok(existsSync(path.join(output, 'admin/review/index.html')))
  assert.ok(existsSync(path.join(output, 'admin/review-data/authorities/merthyr-tydfil.json')))
  assert.match(
    readFileSync(path.join(output, '_headers'), 'utf8'),
    /\/admin\/\*[\s\S]*X-Robots-Tag: noindex, nofollow/
  )
  assert.ok(existsSync(path.join(output, '_astro/editor.js')))
  assert.ok(existsSync(path.join(output, 'uploads/community/library-guide.jpg')))
  assert.ok(!existsSync(path.join(output, 'uploads/archive/original.pdf')))
  assert.ok(!existsSync(path.join(output, 'reading/index.html')))
  assert.match(readFileSync(path.join(output, 'index.html'), 'utf8'), /\/admin\//)
})
