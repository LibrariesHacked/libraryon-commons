/**
 * @fileoverview Automated directory verification, URL link checking, postcode inspection, and issue detection.
 * Provides regular health auditing across library and authority datasets and generates candidate fixes.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { normalizePostcode } from '../../src/lib/directory/dataHelpers.mjs'

/**
 * Standard user agent for directory verification network requests.
 * @type {string}
 */
export const USER_AGENT =
  'LibraryOn-Commons-Data-Verification/1.0 (public library directory; https://github.com/LibrariesHacked/libraryon-commons)'

/**
 * Regular expression pattern for extracting UK postcodes from unstructured addresses.
 * @type {RegExp}
 */
export const UK_POSTCODE_REGEX = /\b([A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})\b/i

/**
 * Extract a candidate UK postcode from raw address text.
 * @param {string|null|undefined} address - Address string, multi-line or comma-separated.
 * @returns {string|null} Normalized postcode if found, or null.
 */
export function extractPostcodeCandidate(address) {
  if (!address || typeof address !== 'string') return null
  const match = address.match(UK_POSTCODE_REGEX)
  return match ? normalizePostcode(match[1]) : null
}

/**
 * Validate postcode format and compare against known ONS lookups.
 * @param {string|null|undefined} postcode - Candidate postcode value.
 * @param {Record<string, {status: string, terminated?: string|null, latitude?: number|null, longitude?: number|null}>} [lookups] - Postcode lookup cache.
 * @returns {{valid: boolean, normalized: string|null, status: 'found'|'terminated'|'missing-lookup'|'invalid-syntax'|'empty', lookup: object|null}} Assessment outcome.
 */
export function checkPostcode(postcode, lookups = {}) {
  if (!postcode) {
    return { valid: false, normalized: null, status: 'empty', lookup: null }
  }
  const normalized = normalizePostcode(postcode)
  if (!normalized) {
    return { valid: false, normalized: null, status: 'invalid-syntax', lookup: null }
  }
  const lookup = lookups[normalized] || null
  if (!lookup) {
    return { valid: true, normalized, status: 'missing-lookup', lookup: null }
  }
  if (lookup.status === 'terminated' || lookup.terminated) {
    return { valid: true, normalized, status: 'terminated', lookup }
  }
  return { valid: true, normalized, status: 'found', lookup }
}

/**
 * Check syntax and structure of a candidate URL without performing network requests.
 * @param {string|null|undefined} urlString - URL string to inspect.
 * @returns {{valid: boolean, candidate: string|null, issue: 'empty'|'missing-protocol'|'protocol-typo'|'email-in-url'|'phone-in-url'|'invalid'|null}} URL syntax report.
 */
export function checkUrlSyntax(urlString) {
  if (!urlString || typeof urlString !== 'string' || !urlString.trim()) {
    return { valid: false, candidate: null, issue: 'empty' }
  }
  const trimmed = urlString.trim()
  if (/^hthttps:\/\//i.test(trimmed)) {
    return {
      valid: false,
      candidate: trimmed.replace(/^hthttps:\/\//i, 'https://'),
      issue: 'protocol-typo'
    }
  }
  if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) {
    return { valid: false, candidate: null, issue: 'email-in-url' }
  }
  if (/^[\d\s()+.-]{7,20}$/.test(trimmed)) {
    return { valid: false, candidate: null, issue: 'phone-in-url' }
  }
  if (/^(?:www\.|[a-z0-9-]+\.(?:org|gov|co|ac|net|com|wales|scot|london))/i.test(trimmed)) {
    return { valid: false, candidate: `https://${trimmed}`, issue: 'missing-protocol' }
  }
  try {
    const parsed = new URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, candidate: null, issue: 'invalid' }
    }
    return { valid: true, candidate: trimmed, issue: null }
  } catch {
    return { valid: false, candidate: null, issue: 'invalid' }
  }
}

/**
 * Classify HTTP outcome based on status code, final URL, and title signals.
 * @param {number} statusCode - HTTP status code.
 * @param {string} initialUrl - Original URL requested.
 * @param {string} finalUrl - Final URL after redirects.
 * @param {string} [pageTitle=''] - HTML page title text.
 * @returns {'ok'|'redirect'|'broken'|'blocked'} Classified outcome category.
 */
export function classifyHttpStatus(statusCode, initialUrl, finalUrl, pageTitle = '') {
  if (statusCode === 403 || statusCode === 429) {
    return 'blocked'
  }
  if (pageTitle && /just a moment|attention required|security check|cloudflare/i.test(pageTitle)) {
    return 'blocked'
  }
  if (statusCode >= 200 && statusCode < 300) {
    if (pageTitle && /404|not found|page not found|access denied/i.test(pageTitle)) {
      return 'broken'
    }
    const initClean = initialUrl.replace(/\/$/, '')
    const finalClean = finalUrl.replace(/\/$/, '')
    if (initClean !== finalClean) {
      return 'redirect'
    }
    return 'ok'
  }
  if (statusCode >= 300 && statusCode < 400) {
    return 'redirect'
  }
  if (statusCode >= 400) {
    return 'broken'
  }
  return 'broken'
}

/**
 * Verify a single URL against live network or cached lookup results.
 * @param {string} url - Target URL.
 * @param {object} [options] - Verification configuration.
 * @param {boolean} [options.live=false] - Perform real live HTTP request.
 * @param {Record<string, object>} [options.cache={}] - Lookup cache from lookups.json.
 * @param {number} [options.timeoutMs=15000] - Request timeout in milliseconds.
 * @returns {Promise<{status: 'ok'|'redirect'|'broken'|'blocked'|'cached-error'|'syntax-error'|'untested', httpStatus?: number, finalUrl?: string, error?: string, title?: string}>} Verification outcome.
 */
export async function verifyUrl(url, { live = false, cache = {}, timeoutMs = 15000 } = {}) {
  const syntax = checkUrlSyntax(url)
  if (!syntax.valid) {
    return { status: 'syntax-error', error: syntax.issue }
  }
  if (cache[url]) {
    const cached = cache[url]
    if (cached.status === 'ok') {
      return {
        status: cached.crossDomain || cached.genericRedirect ? 'redirect' : 'ok',
        httpStatus: cached.httpStatus || 200,
        finalUrl: cached.finalUrl || url,
        title: cached.title || ''
      }
    }
    if (cached.status === 'blocked' || cached.httpStatus === 403 || cached.httpStatus === 429) {
      return {
        status: 'blocked',
        httpStatus: cached.httpStatus,
        finalUrl: cached.finalUrl,
        title: cached.title
      }
    }
    if (
      cached.title &&
      /just a moment|attention required|security check|cloudflare/i.test(cached.title)
    ) {
      return {
        status: 'blocked',
        httpStatus: cached.httpStatus,
        finalUrl: cached.finalUrl,
        title: cached.title
      }
    }
    return {
      status: cached.status === 'http-error' ? 'broken' : 'cached-error',
      httpStatus: cached.httpStatus,
      finalUrl: cached.finalUrl,
      error: cached.error || `HTTP ${cached.httpStatus}`
    }
  }
  if (!live) {
    return { status: 'untested' }
  }
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs)
    })
    const finalUrl = response.url || url
    let pageTitle = ''
    try {
      const text = await response.text()
      const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleMatch) pageTitle = titleMatch[1].trim()
    } catch {
      // Ignore body decoding errors if headers succeeded.
    }
    const statusCategory = classifyHttpStatus(response.status, url, finalUrl, pageTitle)
    return {
      status: statusCategory,
      httpStatus: response.status,
      finalUrl,
      title: pageTitle
    }
  } catch (err) {
    return {
      status: 'broken',
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/**
 * Inspect an email address for common formatting anomalies and extract clean candidates.
 * @param {string|null|undefined} email - Raw email string from directory records.
 * @returns {{valid: boolean, candidate: string|null, issue: 'trailing-period'|'display-name'|'url-value'|'missing-at'|'empty'|null}} Syntax analysis.
 */
export function checkEmailSyntax(email) {
  if (!email || typeof email !== 'string' || !email.trim()) {
    return { valid: false, candidate: null, issue: 'empty' }
  }
  const trimmed = email.trim()
  if (trimmed.endsWith('.')) {
    const clean = trimmed.replace(/\.+$/, '')
    return { valid: false, candidate: clean, issue: 'trailing-period' }
  }
  const angleMatch = trimmed.match(/<([^>]+@[^>]+)>/)
  if (angleMatch) {
    return { valid: false, candidate: angleMatch[1], issue: 'display-name' }
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { valid: false, candidate: null, issue: 'url-value' }
  }
  if (!trimmed.includes('@')) {
    return { valid: false, candidate: null, issue: 'missing-at' }
  }
  return { valid: true, candidate: trimmed, issue: null }
}

/**
 * Scan the directory content files and analyze exceptions, checks, URLs, postcodes and emails.
 * @param {object} [options] - Scanner options.
 * @param {string} [options.rootDir=process.cwd()] - Project workspace root directory.
 * @param {boolean} [options.live=false] - Perform live HTTP link verification.
 * @returns {Promise<object>} Complete directory health report and detected candidates.
 */
export async function auditDirectory({ rootDir = process.cwd(), live = false } = {}) {
  const librariesDir = join(rootDir, 'src/content/libraries')
  const authoritiesDir = join(rootDir, 'src/content/authorities')
  const lookupsPath = join(rootDir, 'migration/directory/lookups.json')

  const lookups = existsSync(lookupsPath)
    ? JSON.parse(readFileSync(lookupsPath, 'utf8'))
    : { postcodes: {}, urls: {} }

  const report = {
    scannedAt: new Date().toISOString(),
    totals: { libraries: 0, authorities: 0 },
    validationExceptions: { count: 0, byField: {}, byKind: { libraries: 0, authorities: 0 } },
    manualChecks: { count: 0, byKind: {} },
    postcodes: { total: 0, found: 0, missingLookup: 0, terminated: 0, invalidSyntax: 0, empty: 0 },
    urls: {
      total: 0,
      distinct: 0,
      syntaxIssues: [],
      brokenList: [],
      redirectList: [],
      statuses: { ok: 0, redirect: 0, broken: 0, blocked: 0, untested: 0 }
    },
    candidates: []
  }

  const distinctUrls = new Set()
  const urlRecords = []

  // 1. Scan Libraries
  if (existsSync(librariesDir)) {
    const libFiles = readdirSync(librariesDir).filter((f) => f.endsWith('.json'))
    report.totals.libraries = libFiles.length
    for (const file of libFiles) {
      const record = JSON.parse(readFileSync(join(librariesDir, file), 'utf8'))
      const id = record.id
      const data = record.data || {}

      for (const check of record.manual_checks || []) {
        report.manualChecks.count++
        report.manualChecks.byKind[check.kind] = (report.manualChecks.byKind[check.kind] || 0) + 1
      }
      for (const ex of record.validation_exceptions || []) {
        report.validationExceptions.count++
        report.validationExceptions.byKind.libraries++
        report.validationExceptions.byField[ex.field] =
          (report.validationExceptions.byField[ex.field] || 0) + 1
      }

      // Check Postcode
      report.postcodes.total++
      const pcResult = checkPostcode(data.Postcode, lookups.postcodes)
      if (pcResult.status === 'found') report.postcodes.found++
      else if (pcResult.status === 'missing-lookup') report.postcodes.missingLookup++
      else if (pcResult.status === 'terminated') report.postcodes.terminated++
      else if (pcResult.status === 'invalid-syntax') report.postcodes.invalidSyntax++
      else if (pcResult.status === 'empty') {
        report.postcodes.empty++
        const extracted = extractPostcodeCandidate(
          [data['Address 1'], data['Address 2'], data['Address 3']].filter(Boolean).join(', ')
        )
        if (extracted) {
          report.candidates.push({
            id,
            file,
            collection: 'libraries',
            field: 'Postcode',
            before: null,
            candidate: extracted,
            reason: 'Postcode extracted from address text'
          })
        }
      }

      // Check URL
      if (data.URL) {
        distinctUrls.add(data.URL)
        urlRecords.push({ url: data.URL, id, file, field: 'URL', collection: 'libraries' })
        const urlSyntax = checkUrlSyntax(data.URL)
        if (!urlSyntax.valid) {
          report.urls.syntaxIssues.push({
            id,
            file,
            field: 'URL',
            value: data.URL,
            issue: urlSyntax.issue,
            candidate: urlSyntax.candidate
          })
          if (urlSyntax.candidate) {
            report.candidates.push({
              id,
              file,
              collection: 'libraries',
              field: 'URL',
              before: data.URL,
              candidate: urlSyntax.candidate,
              reason: `Fixed URL issue: ${urlSyntax.issue}`
            })
          }
        }
      }

      // Check Email
      if (data['Email address']) {
        const emailSyntax = checkEmailSyntax(data['Email address'])
        if (!emailSyntax.valid && emailSyntax.candidate) {
          report.candidates.push({
            id,
            file,
            collection: 'libraries',
            field: 'Email address',
            before: data['Email address'],
            candidate: emailSyntax.candidate,
            reason: `Fixed email issue: ${emailSyntax.issue}`
          })
        }
      }
    }
  }

  // 2. Scan Authorities
  if (existsSync(authoritiesDir)) {
    const authFiles = readdirSync(authoritiesDir).filter((f) => f.endsWith('.json'))
    report.totals.authorities = authFiles.length
    for (const file of authFiles) {
      const record = JSON.parse(readFileSync(join(authoritiesDir, file), 'utf8'))
      const id = record.id
      const data = record.data || {}

      for (const check of record.manual_checks || []) {
        report.manualChecks.count++
        report.manualChecks.byKind[check.kind] = (report.manualChecks.byKind[check.kind] || 0) + 1
      }
      for (const ex of record.validation_exceptions || []) {
        report.validationExceptions.count++
        report.validationExceptions.byKind.authorities++
        report.validationExceptions.byField[ex.field] =
          (report.validationExceptions.byField[ex.field] || 0) + 1
      }

      // Check Authority URLs
      for (const [key, value] of Object.entries(data)) {
        if (key.includes('URL') && value && typeof value === 'string') {
          distinctUrls.add(value)
          urlRecords.push({ url: value, id, file, field: key, collection: 'authorities' })
          const urlSyntax = checkUrlSyntax(value)
          if (!urlSyntax.valid) {
            report.urls.syntaxIssues.push({
              id,
              file,
              field: key,
              value,
              issue: urlSyntax.issue,
              candidate: urlSyntax.candidate
            })
            if (urlSyntax.candidate) {
              report.candidates.push({
                id,
                file,
                collection: 'authorities',
                field: key,
                before: value,
                candidate: urlSyntax.candidate,
                reason: `Fixed URL issue: ${urlSyntax.issue}`
              })
            }
          }
        }
      }

      // Check Authority Email
      if (data['Email address']) {
        const emailSyntax = checkEmailSyntax(data['Email address'])
        if (!emailSyntax.valid && emailSyntax.candidate) {
          report.candidates.push({
            id,
            file,
            collection: 'authorities',
            field: 'Email address',
            before: data['Email address'],
            candidate: emailSyntax.candidate,
            reason: `Fixed email issue: ${emailSyntax.issue}`
          })
        }
      }
    }
  }

  report.urls.total = urlRecords.length
  report.urls.distinct = distinctUrls.size

  // 3. Verify Distinct URLs
  const urlCache = lookups.urls || {}
  const urlList = Array.from(distinctUrls)
  const concurrency = live ? 25 : 100
  let urlIdx = 0

  async function checkNext() {
    while (urlIdx < urlList.length) {
      const url = urlList[urlIdx++]
      const outcome = await verifyUrl(url, { live, cache: urlCache, timeoutMs: 8000 })
      report.urls.statuses[outcome.status] = (report.urls.statuses[outcome.status] || 0) + 1
      if (outcome.status === 'broken') {
        report.urls.brokenList.push({ url, status: outcome.httpStatus, error: outcome.error })
      } else if (outcome.status === 'redirect') {
        report.urls.redirectList.push({ url, finalUrl: outcome.finalUrl })
      }
    }
  }

  const pool = Array.from({ length: Math.min(concurrency, urlList.length) }, () => checkNext())
  await Promise.all(pool)

  return report
}

/**
 * Format report object into a readable terminal output.
 * @param {object} report - The directory audit report.
 * @returns {string} Human-readable summary block.
 */
export function formatAuditSummary(report) {
  const lines = [
    '==================================================',
    '        DIRECTORY HEALTH & VERIFICATION REPORT    ',
    '==================================================',
    `Scanned: ${report.scannedAt}`,
    `Total Libraries:   ${report.totals.libraries}`,
    `Total Authorities: ${report.totals.authorities}`,
    '--------------------------------------------------',
    `Validation Exceptions: ${report.validationExceptions.count}`,
    ...Object.entries(report.validationExceptions.byField).map(
      ([f, c]) => `  - ${f.padEnd(25)}: ${c}`
    ),
    '--------------------------------------------------',
    `Open Manual Checks:    ${report.manualChecks.count}`,
    ...Object.entries(report.manualChecks.byKind).map(([k, c]) => `  - ${k.padEnd(25)}: ${c}`),
    '--------------------------------------------------',
    'Postcodes Assessment:',
    `  - Found in lookups:    ${report.postcodes.found}`,
    `  - Terminated postcodes: ${report.postcodes.terminated} (closed historical buildings)`,
    `  - Missing lookups:     ${report.postcodes.missingLookup}`,
    `  - Empty / unrecorded:  ${report.postcodes.empty}`,
    '--------------------------------------------------',
    'Links & URLs Assessment:',
    `  - Total URLs:          ${report.urls.total} (${report.urls.distinct} distinct)`,
    `  - OK:                  ${report.urls.statuses.ok || 0}`,
    `  - Redirects:           ${report.urls.statuses.redirect || 0}`,
    `  - Broken / HTTP error: ${report.urls.statuses.broken || 0}`,
    `  - Blocked / 403 / CDN: ${report.urls.statuses.blocked || 0}`,
    `  - Untested:            ${report.urls.statuses.untested || 0}`,
    `  - Syntax Issues:       ${report.urls.syntaxIssues.length}`,
    '--------------------------------------------------',
    `Proposed Candidates:   ${report.candidates.length}`,
    '=================================================='
  ]
  return lines.join('\n')
}

/**
 * Format audit report into GitHub-Flavored Markdown for Step Summaries or issues.
 * @param {object} report - The directory audit report.
 * @returns {string} GitHub Flavored Markdown block.
 */
export function formatAuditMarkdown(report) {
  return `## 🏛️ Directory Health & Link Verification Report

**Scanned:** \`${report.scannedAt}\`  
**Total Libraries:** ${report.totals.libraries} | **Total Authorities:** ${report.totals.authorities}

### 📊 Health Overview

| Metric | Count | Details |
| :--- | :--- | :--- |
| **Validation Exceptions** | **${report.validationExceptions.count}** | Schema gaps requiring community verification |
| **Open Manual Checks** | **${report.manualChecks.count}** | Tasks visible in maintainer worklist (\`/admin/review/\`) |
| **Postcodes Verified** | **${report.postcodes.found}** | Verified against official ONS/boundary lookups |
| **Terminated Postcodes** | **${report.postcodes.terminated}** | Postcodes retired by Royal Mail (closed buildings) |
| **Missing Postcodes** | **${report.postcodes.empty}** | Unrecorded postcode values |
| **Distinct URLs Tested** | **${report.urls.distinct}** | Total URL references across directory records |
| **Broken Links** | **${report.urls.statuses.broken || 0}** | HTTP 404/500 or DNS failure |
| **Redirects** | **${report.urls.statuses.redirect || 0}** | Permanent or cross-domain redirects |
| **Blocked / CDN** | **${report.urls.statuses.blocked || 0}** | Cloudflare / CAPTCHA / rate-limited |
| **Actionable Candidates** | **${report.candidates.length}** | Automated proposals ready for \`overrides.json\` |

### 🛠️ Open Exceptions Breakdown
${Object.entries(report.validationExceptions.byField)
  .map(([field, count]) => `- **${field}**: ${count}`)
  .join('\n')}

${
  report.candidates.length > 0
    ? `### 💡 Proposed Candidates\n` +
      report.candidates
        .map(
          (c) =>
            `- **${c.collection}/${c.file}** (\`${c.field}\`): Change \`${c.before}\` &rarr; \`${c.candidate}\` (${c.reason})`
        )
        .join('\n')
    : `*(No pending automated candidates; all extracted values verified)*`
}
`
}

/**
 * Attach broken URLs and newly discovered candidate changes as manual review items.
 * @param {object[]} records - Mutable records to annotate in place.
 * @param {object} report - Directory audit report containing broken links and candidate items.
 * @param {object} auditJson - report.json audit structure to update.
 * @returns {{newReviewItems: number}} Count of attached review items.
 */
export function attachDiscoveredIssues(records, report, auditJson) {
  let newReviewItems = 0
  const recordsById = new Map(records.map((r) => [r.id, r]))
  for (const candidate of report.candidates) {
    const record = recordsById.get(candidate.id)
    if (!record) continue
    const evidence = {
      kind: 'candidate-field-update',
      id: candidate.id,
      field: candidate.field,
      current: candidate.before,
      candidate: candidate.candidate,
      reason: candidate.reason
    }
    const reviewId = `review_${createHash('sha256').update(JSON.stringify(evidence)).digest('hex').slice(0, 24)}`
    if (!auditJson.review.some((r) => r.review_id === reviewId)) {
      auditJson.review.push({ ...evidence, review_id: reviewId })
      newReviewItems++
    }
    if (!record.manual_checks) record.manual_checks = []
    const ref = `migration/directory/report.json#${reviewId}`
    if (!record.manual_checks.some((c) => c.audit_refs.includes(ref))) {
      record.manual_checks.push({
        kind: 'candidate-field-update',
        reason: candidate.reason,
        audit_refs: [ref]
      })
    }
  }
  return { newReviewItems }
}

/**
 * CLI Entry point.
 */
/* c8 ignore start */
if (process.argv[1] && process.argv[1].endsWith('check-directory.mjs')) {
  const isLive = process.argv.includes('--live')
  const isJson = process.argv.includes('--json')
  const isMarkdown = process.argv.includes('--markdown')
  const showCandidates = process.argv.includes('--candidates')

  auditDirectory({ live: isLive }).then((report) => {
    if (isJson) {
      console.log(JSON.stringify(report, null, 2))
    } else if (isMarkdown) {
      console.log(formatAuditMarkdown(report))
    } else {
      console.log(formatAuditSummary(report))
      if (showCandidates && report.candidates.length > 0) {
        console.log('\nProposed Candidates:')
        console.log(JSON.stringify(report.candidates, null, 2))
      }
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatAuditMarkdown(report) + '\n')
      } catch {
        // Ignore step summary write error
      }
    }
  })
}
/* c8 ignore end */
