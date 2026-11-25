/**
 * @fileoverview Generate small, tracked lookup files for Decap's native relation widgets.
 * Content collections remain authoritative; lookup IDs retain their existing filename slugs.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const sources = [
  { name: 'resources', label: 'title' },
  { name: 'authorities', label: 'local_authority' }
]

/**
 * Read and validate all sources before planning deterministic lookup output.
 * @param {string} [root] - Repository root, or an isolated test fixture.
 * @returns {Array<{file: string, content: string, count: number}>} Relative output paths and JSON.
 * @throws {Error} When a source cannot be read or has an invalid ID or display label.
 */
export function generateCmsLookups(root = repositoryRoot) {
  return sources.map(({ name, label }) => {
    const folder = path.join(root, 'src', 'content', name)
    const files = readdirSync(folder)
      .filter((file) => !file.startsWith('.') && file.endsWith('.json'))
      .sort()
    const items = files.map((file) => {
      const id = path.basename(file, '.json')
      const record = JSON.parse(readFileSync(path.join(folder, file), 'utf8'))
      if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(id)) {
        throw new Error(`Invalid CMS lookup ID: ${name}/${file}`)
      }
      if (typeof record?.[label] !== 'string' || !record[label].trim()) {
        throw new Error(`Missing CMS lookup label "${label}": ${name}/${file}`)
      }
      if (name === 'authorities') {
        if (!/^[ELMNSW][0-9]{8}$/.test(record.local_authority_code)) {
          throw new Error(`Invalid authority lookup code: ${name}/${file}`)
        }
        return {
          id,
          label: `${record[label]} (${record.local_authority_code})`,
          name: record[label],
          code: record.local_authority_code
        }
      }
      return { id, label: record[label] }
    })
    return {
      file: path.join('src', 'data', 'cms-lookups', `${name}.json`),
      content: `${JSON.stringify({ items }, null, 2)}\n`,
      count: items.length
    }
  })
}

/**
 * Write changed lookup files, or check that tracked output matches current content.
 * @param {{root?: string, check?: boolean}} [options] - Root and validation-only mode.
 * @returns {string[]} Relative paths changed, or an empty list when already synchronized.
 * @throws {Error} When validation fails or a file cannot be read or written.
 */
export function syncCmsLookups({ root = repositoryRoot, check = false } = {}) {
  const outputs = generateCmsLookups(root)
  const changed = outputs.filter(({ file, content }) => {
    try {
      return readFileSync(path.join(root, file), 'utf8') !== content
    } catch (error) {
      if (error.code === 'ENOENT') return true
      throw error
    }
  })
  if (check && changed.length) {
    throw new Error(
      `CMS lookups are stale: ${changed.map(({ file }) => file).join(', ')}. Run npm run cms:lookups.`
    )
  }
  for (const { file, content } of changed) {
    const target = path.join(root, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return changed.map(({ file }) => file)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--check')) {
    throw new Error('Usage: node scripts/cms-lookups.mjs [--check]')
  }
  const changed = syncCmsLookups({ check: args.includes('--check') })
  console.log(
    changed.length ? `Updated CMS lookups: ${changed.join(', ')}` : 'CMS lookups are up to date.'
  )
}
