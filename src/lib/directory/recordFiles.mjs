/** @fileoverview Deterministic JSON discovery for nested directory records. */
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative, sep } from 'node:path'

/**
 * Recursively list JSON record paths beneath a directory in deterministic order.
 *
 * @param {string|URL} directory - Directory path or file URL to search.
 * @returns {string[]} Sorted paths relative to the supplied directory, using forward slashes.
 */
export function jsonRecordFiles(directory) {
  const root = directory instanceof URL ? fileURLToPath(directory) : directory
  /**
   * Recursively collect JSON file paths relative to the original search root.
   * @param {string} folder - Directory to inspect.
   * @returns {string[]} Relative paths discovered under this directory.
   */
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
