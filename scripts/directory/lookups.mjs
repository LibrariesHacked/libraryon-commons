/**
 * @fileoverview ONS Postcode Directory (ONSPD) and National Statistics UPRN Lookup (NSUL) cache and verification.
 */

import { existsSync, readFileSync, createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { load } from 'cheerio'
import { parse } from 'csv-parse'
import proj4 from 'proj4'
import { baseline, readInputs, planMatches, auditRoot, writeJson, root } from './migrate.mjs'
import { normalizePostcode } from '../../src/lib/directory/dataHelpers.mjs'

const cacheFile = new URL('lookups.json', auditRoot)
const userAgent =
  'LibraryOn-Commons-Data-Verification/1.0 (public library directory; https://github.com/LibrariesHacked/libraryon-commons)'
/** @param {string} url - Absolute service URL. @returns {string} Host without an optional www prefix. */
const normalizedHostname = (url) => new URL(url).hostname.replace(/^www\./, '')
const britishGrid =
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.060,0.1502,0.2470,0.8421,-20.4894 +units=m +no_defs'

/**
 * Retain postcode lifecycle and usable coordinates from one ONSPD source row.
 * @param {Record<string, string>} row - CSV row from the archived ONSPD release.
 * @returns {object} Lookup evidence; terminated postcodes never become current.
 */
export function parseOnsPostcode(row) {
  const postcode = normalizePostcode(row.pcds)
  const latitude = row.lat === '' || row.lat === undefined ? null : Number(row.lat)
  const longitude = row.long === '' || row.long === undefined ? null : Number(row.long)
  const validPoint =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 49 &&
    latitude <= 62 &&
    longitude >= -9 &&
    longitude <= 3
  return {
    status: row.doterm?.trim() ? 'terminated' : 'found',
    postcode,
    latitude: validPoint ? latitude : null,
    longitude: validPoint ? longitude : null,
    introduced: row.dointr || null,
    terminated: row.doterm?.trim() || null,
    gridQuality: row.gridind,
    countryCode: row.ctry26cd,
    authorityCode: row.lad26cd
  }
}

/**
 * Preserve an exact NSUL identifier and project valid British Grid coordinates.
 * The Helmert transform corroborates matching; it is not survey-grade positioning.
 * @param {Record<string, string>} row - NSUL CSV row with UPRN, postcode and grid point.
 * @returns {object} Source associations and approximate WGS84 coordinates.
 */
export function parseNsul(row) {
  const easting = row.GRIDGB1E === '' || row.GRIDGB1E === undefined ? null : Number(row.GRIDGB1E)
  const northing = row.GRIDGB1N === '' || row.GRIDGB1N === undefined ? null : Number(row.GRIDGB1N)
  const validPoint =
    Number.isFinite(easting) &&
    Number.isFinite(northing) &&
    easting > 0 &&
    easting <= 700000 &&
    northing > 0 &&
    northing <= 1300000
  const [longitude, latitude] = validPoint
    ? proj4(britishGrid, 'EPSG:4326', [easting, northing])
    : [null, null]
  return {
    status: validPoint ? 'found' : 'unresolved',
    uprn: String(row.UPRN),
    postcode: normalizePostcode(row.PCDS),
    latitude,
    longitude,
    easting: validPoint ? easting : null,
    northing: validPoint ? northing : null,
    countryCode: row.CTRY26CD,
    authorityCode: row.LAD26CD
  }
}

/** @param {URL} file - Source archive. @returns {Promise<string>} Streaming SHA-256 identity. */
async function archiveIdentity(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

/**
 * Parse ZIP members incrementally without extracting the national datasets.
 * @param {URL} file - ZIP archive to stream using the system unzip executable.
 * @param {string[]} entries - Selected CSV member paths.
 * @param {(row: object, entry: string, rowNumber: number) => void} accept - Row visitor.
 * @returns {Promise<void>} Resolves after every member and child process succeeds.
 */
async function scanArchive(file, entries, accept) {
  for (const entry of entries) {
    console.log(`Scanning ${entry}`)
    const child = spawn('unzip', ['-p', fileURLToPath(file), entry], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let error = ''
    child.stderr.on('data', (chunk) => {
      error += chunk
    })
    const completion = new Promise((resolve) => {
      child.on('error', (failure) => resolve(failure))
      child.on('close', (code) =>
        resolve(code === 0 ? null : new Error(`unzip ${entry}: ${error || code}`))
      )
    })
    const rows = child.stdout.pipe(parse({ columns: true, bom: true, skip_empty_lines: true }))
    let rowNumber = 1
    try {
      for await (const row of rows) accept(row, entry, ++rowNumber)
    } catch (failure) {
      child.kill()
      throw failure
    }
    const failure = await completion
    if (failure) throw failure
  }
}

/**
 * Cache ONS evidence, including explicit misses, for every requested identifier.
 * Source archive hashes invalidate old extracts; completed extracts are reused.
 * @param {object} original - Preserved LibraryOn baseline.
 * @param {object} inputs - Supporting library rows with candidate identifiers.
 * @param {object} plan - Matched targets, including corrected postcode candidates.
 * @param {object} cache - Mutable lookup cache persisted after each product scan.
 * @returns {Promise<void>} Completes without making any network requests.
 */
export async function collectOnsLookups(original, inputs, plan, cache) {
  const postcodes = new Set(
    [
      ...plan.targets.flatMap((target) => [target.postcode, target.correctedPostcode]),
      ...inputs.sources.map((source) => source.postcode)
    ].filter(Boolean)
  )
  const uprns = new Set(
    [
      ...inputs.sources.map((source) => source.data['Unique property reference number']),
      ...original.libraries.map(({ record }) => record.uprn)
    ]
      .filter(Boolean)
      .map(String)
  )
  cache.ons ||= {}
  for (const [product, required] of [
    ['onspd', postcodes],
    ['nsul', uprns]
  ]) {
    const file = new URL(`${product}.zip`, root)
    if (!existsSync(file))
      throw new Error(`Missing ${product}.zip; local ONS verification is required`)
    const sha256 = await archiveIdentity(file)
    const table = product === 'onspd' ? cache.postcodes : cache.uprns
    if (
      cache.ons[product]?.sha256 === sha256 &&
      [...required].every((key) => table[key]?.product === product)
    )
      continue
    const entries = execFileSync('unzip', ['-Z1', fileURLToPath(file)], { encoding: 'utf8' })
      .split('\n')
      .filter((name) =>
        product === 'onspd'
          ? /^Data\/multi_csv\/ONSPD_.*\.csv$/.test(name)
          : /^Data\/NSUL_.*\.csv$/.test(name)
      )
    if (!entries.length) throw new Error(`No ${product} CSV entries found`)
    const found = new Map()
    await scanArchive(file, entries, (row, entry, rowNumber) => {
      const key = product === 'onspd' ? normalizePostcode(row.pcds) : String(row.UPRN)
      if (!required.has(key)) return
      if (found.has(key))
        throw new Error(`Duplicate ${product} lookup key ${key}; cannot choose a row safely`)
      found.set(key, {
        ...(product === 'onspd' ? parseOnsPostcode(row) : parseNsul(row)),
        product,
        archive: `${product}.zip`,
        entry,
        row: rowNumber,
        archiveSha256: sha256,
        url: `${product}.zip#${entry}:${rowNumber}`
      })
    })
    for (const key of required)
      table[key] = found.get(key) || {
        status: 'not-found',
        product,
        archive: `${product}.zip`,
        archiveSha256: sha256
      }
    cache.ons[product] = { sha256, entries, requested: required.size, found: found.size }
    writeJson(cacheFile, cache)
    console.log(`${product}: located ${found.size}/${required.size}`)
  }
}

/** @param {string} url - Public service URL. @returns {Promise<Response>} Response with an 18-second request deadline. */
async function fetchServicePage(url) {
  return fetch(url, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(18000)
  })
}

/**
 * Extract bounded service/software evidence while rejecting misleading redirects.
 * @param {string} html - Retrieved page content, never executed.
 * @param {string} url - Requested URL.
 * @param {string} finalUrl - Fetch's final URL after redirects.
 * @returns {object} Relevance, redirect and vendor signals for editorial review.
 */
export function parseServicePage(html, url, finalUrl) {
  const $ = load(html)
  $('script,style,nav,footer').remove()
  const title = $('title').text().trim().slice(0, 300)
  const text = $('body').text().replace(/\s+/g, ' ').slice(0, 300000)
  const signals = [
    ...new Set(
      `${text} ${$('a')
        .map((_, element) => $(element).attr('href'))
        .get()
        .join(' ')}`.match(
        /\b(?:spydus|sirsidynix|symphony|sierra|koha|prism|axiell|capita|folio|innovative)\b/gi
      ) || []
    )
  ].join(', ')
  const genericRedirect =
    /404|not.found|error|access.denied|captcha|just a moment|403 forbidden/i.test(title) ||
    (new URL(url).pathname.replace(/\/$/, '') !== new URL(finalUrl).pathname.replace(/\/$/, '') &&
      /^\/?$/.test(new URL(finalUrl).pathname))
  return {
    title,
    signals,
    crossDomain: normalizedHostname(url) !== normalizedHostname(finalUrl),
    libraryRelevant: /librar|catalogue|catalog|spydus|sirsidynix|koha|prism/i.test(
      `${title} ${text.slice(0, 30000)}`
    ),
    genericRedirect
  }
}

/**
 * Visit each item with bounded concurrency, propagating worker failures.
 * @param {unknown[]} items - Work items in stable source order.
 * @param {number} concurrency - Maximum simultaneous workers.
 * @param {(item: unknown, index: number) => Promise<void>} visitItem - Async visitor.
 * @returns {Promise<void>} Resolves after all workers finish.
 */
async function mapConcurrent(items, concurrency, visitItem) {
  let nextIndex = 0
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIndex < items.length) {
        const itemIndex = nextIndex++
        await visitItem(items[itemIndex], itemIndex)
      }
    })
  )
}

/**
 * Refresh local ONS extracts and optionally collect uncached service-page evidence.
 * Identifier lookups are exclusively local; no third-party UPRN scraping is used.
 * @param {{onsOnly?: boolean}} [options] - Skip HTTP requests for offline validation.
 * @returns {Promise<object|undefined>} The cache in offline mode; otherwise logs totals.
 */
export async function collectLookups({ onsOnly = false } = {}) {
  const original = baseline()
  const inputs = await readInputs()
  const overrides = JSON.parse(readFileSync(new URL('overrides.json', auditRoot), 'utf8'))
  const plan = planMatches(original, inputs, overrides)
  const cache = existsSync(cacheFile)
    ? JSON.parse(readFileSync(cacheFile, 'utf8'))
    : { postcodes: {}, uprns: {}, urls: {} }
  await collectOnsLookups(original, inputs, plan, cache)
  if (onsOnly) return cache
  const urls = [
    ...new Set(
      [
        ...inputs.grid.flatMap((row) =>
          Object.entries(row)
            .filter(([field]) => field.endsWith('URL'))
            .map(([, value]) => value)
        ),
        ...original.authorities.flatMap(({ record }) => [
          record.website,
          record.catalogue,
          record.joinOnline,
          record.androidApp,
          record.iOSApp
        ])
      ].filter((url) => /^https?:\/\//i.test(url))
    )
  ].filter((url) => !cache.urls[url])
  console.log(`Checking ${urls.length} service URLs`)
  await mapConcurrent(urls, 5, async (url, index) => {
    try {
      const response = await fetchServicePage(url)
      const contentType = response.headers.get('content-type') || ''
      cache.urls[url] = {
        status: response.ok ? 'ok' : 'http-error',
        httpStatus: response.status,
        finalUrl: response.url,
        checkedAt: new Date().toISOString(),
        ...(contentType.includes('text/html')
          ? parseServicePage(await response.text(), url, response.url)
          : {
              title: '',
              signals: '',
              crossDomain: normalizedHostname(url) !== normalizedHostname(response.url),
              libraryRelevant: false,
              genericRedirect: false
            })
      }
      await response.body?.cancel().catch(() => {})
    } catch (error) {
      cache.urls[url] = {
        status: 'error',
        error: error.message,
        checkedAt: new Date().toISOString()
      }
    }
    if (index % 50 === 0) {
      writeJson(cacheFile, cache)
      console.log(`URL progress ${index + 1}/${urls.length}`)
    }
  })
  writeJson(cacheFile, cache)
  console.log(
    JSON.stringify({
      postcodes: Object.keys(cache.postcodes).length,
      uprns: Object.keys(cache.uprns).length,
      urls: Object.keys(cache.urls).length
    })
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await collectLookups({ onsOnly: process.argv.includes('--ons-only') })
