/** @fileoverview Deterministic JSON discovery for nested directory records. */
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative, sep } from 'node:path'

export function jsonRecordFiles(directory) {
  const root = directory instanceof URL ? fileURLToPath(directory) : directory
  const walk = (folder) =>
    readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
      const path = join(folder, entry.name)
      if (entry.isDirectory()) return walk(path)
      return entry.isFile() && entry.name.endsWith('.json')
        ? [relative(root, path).split(sep).join('/')]
        : []
    })
  return walk(root).sort()
}
