/** @fileoverview Move library records into service folders without rewriting their contents. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { jsonRecordFiles } from '../../src/lib/directory/recordFiles.mjs'
import { libraryRecordFile } from '../../src/lib/cms/libraryCollections.mjs'
import { applyLibrarySlugCorrection } from '../../src/lib/directory/slugCorrections.mjs'

export function splitLibraries(root = process.cwd()) {
  const folder = join(root, 'src', 'content', 'libraries')
  const authorities = new Set(
    jsonRecordFiles(join(root, 'src', 'content', 'authorities')).map(
      (file) =>
        JSON.parse(readFileSync(join(root, 'src', 'content', 'authorities', file), 'utf8')).slug
    )
  )
  const targets = new Set()
  const ids = new Set()
  const routes = new Set()
  const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
  const plan = jsonRecordFiles(folder).map((file) => {
    const source = join(folder, file)
    const originalBytes = readFileSync(source)
    const original = JSON.parse(originalBytes)
    const record = applyLibrarySlugCorrection(original)
    const bytes =
      record === original
        ? originalBytes
        : Buffer.from(
            originalBytes
              .toString('utf8')
              .replace(/("slug"\s*:\s*)"(?:[^"\\]|\\.)*"/, `$1${JSON.stringify(record.slug)}`)
          )
    if (JSON.stringify(JSON.parse(bytes)) !== JSON.stringify(record)) {
      throw new Error(`Slug correction would change unrelated content: ${file}`)
    }
    if (record.authority && !authorities.has(record.authority)) {
      throw new Error(`Unknown authority in ${file}: ${record.authority}`)
    }
    const targetFile = libraryRecordFile(file, record)
    const target = join(folder, targetFile)
    const route = `/libraries/${record.authority || 'unassigned'}/${record.slug}/`
    if (targets.has(targetFile) || ids.has(record.id) || routes.has(route)) {
      throw new Error(`Duplicate library target, ID or public route: ${file}`)
    }
    if (file.includes('/') && file.split('/')[0] !== (record.authority || 'unassigned')) {
      throw new Error(`Library is in the wrong authority folder: ${file}`)
    }
    if (source !== target && existsSync(target)) throw new Error(`Target already exists: ${target}`)
    targets.add(targetFile)
    ids.add(record.id)
    routes.add(route)
    return {
      file,
      targetFile,
      source,
      target,
      bytes,
      corrected: record !== original,
      digest: createHash('sha256').update(bytes).digest('hex')
    }
  })
  const manifestPath = join(root, 'migration', 'directory', 'written-files.json')
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null
  const moved = plan.filter(({ source, target }) => source !== target)
  if (manifest) {
    for (const { file, targetFile } of moved) {
      const from = `src/content/libraries/${file}`
      const to = `src/content/libraries/${targetFile}`
      if (!(from in manifest)) continue
      if (to in manifest) throw new Error(`Duplicate migration manifest target: ${to}`)
      manifest[to] = manifest[from]
      delete manifest[from]
    }
  }
  for (const { source, target } of moved) {
    mkdirSync(dirname(target), { recursive: true })
    renameSync(source, target)
  }
  for (const { target, bytes, corrected } of plan) {
    if (corrected) writeFileSync(target, bytes)
  }
  for (const { target, digest } of plan) {
    if (hash(target) !== digest) throw new Error(`Library contents changed during move: ${target}`)
  }
  if (manifest && moved.length) {
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  const corrected = plan.filter(({ corrected }) => corrected).length
  return {
    records: plan.length,
    moved: moved.length,
    unchangedBytes: plan.length - corrected,
    ...(corrected ? { correctedSlugs: corrected } : {})
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(splitLibraries())
}
