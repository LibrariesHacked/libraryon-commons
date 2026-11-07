/**
 * @fileoverview Automated tests for directory health auditing, link verification, postcode checks, and issue detection.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractPostcodeCandidate,
  checkPostcode,
  checkUrlSyntax,
  classifyHttpStatus,
  verifyUrl,
  checkEmailSyntax,
  auditDirectory,
  formatAuditSummary,
  formatAuditMarkdown,
  attachDiscoveredIssues
} from '../scripts/directory/check-directory.mjs'

test('extractPostcodeCandidate extracts and normalizes postcodes from addresses', () => {
  assert.equal(
    extractPostcodeCandidate('Aqualibrium, Kinloch Road, Campbeltown, PA28 6EH'),
    'PA28 6EH'
  )
  assert.equal(extractPostcodeCandidate('152 Olive Road, London, NW2 6UY'), 'NW2 6UY')
  assert.equal(extractPostcodeCandidate('AB54 7TW, Huntly, Aberdeenshire, Scotland'), 'AB54 7TW')
  assert.equal(
    extractPostcodeCandidate('Old School House, Clayton Lane, Bradford, BD146AY'),
    'BD14 6AY'
  )
  assert.equal(extractPostcodeCandidate('No postcode here, just streets'), null)
  assert.equal(extractPostcodeCandidate(null), null)
  assert.equal(extractPostcodeCandidate(''), null)
})

test('checkPostcode validates formats and maps lookup results', () => {
  const lookups = {
    'SW1A 1AA': { status: 'found', postcode: 'SW1A 1AA' },
    'EC1A 1BB': { status: 'terminated', terminated: '202001', postcode: 'EC1A 1BB' }
  }

  assert.deepEqual(checkPostcode(null, lookups), {
    valid: false,
    normalized: null,
    status: 'empty',
    lookup: null
  })

  assert.deepEqual(checkPostcode('NOT-A-POSTCODE', lookups), {
    valid: false,
    normalized: null,
    status: 'invalid-syntax',
    lookup: null
  })

  assert.deepEqual(checkPostcode('sw1a 1aa', lookups), {
    valid: true,
    normalized: 'SW1A 1AA',
    status: 'found',
    lookup: lookups['SW1A 1AA']
  })

  assert.deepEqual(checkPostcode('EC1A 1BB', lookups), {
    valid: true,
    normalized: 'EC1A 1BB',
    status: 'terminated',
    lookup: lookups['EC1A 1BB']
  })

  assert.deepEqual(checkPostcode('OX1 1AA', lookups), {
    valid: true,
    normalized: 'OX1 1AA',
    status: 'missing-lookup',
    lookup: null
  })
})

test('checkUrlSyntax detects formatting issues and suggests fixes', () => {
  assert.deepEqual(checkUrlSyntax('https://www.example.gov.uk/library'), {
    valid: true,
    candidate: 'https://www.example.gov.uk/library',
    issue: null
  })

  assert.deepEqual(checkUrlSyntax('hthttps://bwdlibraries.spydus.co.uk/join'), {
    valid: false,
    candidate: 'https://bwdlibraries.spydus.co.uk/join',
    issue: 'protocol-typo'
  })

  assert.deepEqual(checkUrlSyntax('burbagecommunitylibrary.org.uk'), {
    valid: false,
    candidate: 'https://burbagecommunitylibrary.org.uk',
    issue: 'missing-protocol'
  })

  assert.deepEqual(checkUrlSyntax('libraries@carmarthenshire.gov.uk'), {
    valid: false,
    candidate: null,
    issue: 'email-in-url'
  })

  assert.deepEqual(checkUrlSyntax('01269 870891'), {
    valid: false,
    candidate: null,
    issue: 'phone-in-url'
  })

  assert.deepEqual(checkUrlSyntax(''), {
    valid: false,
    candidate: null,
    issue: 'empty'
  })
})

test('classifyHttpStatus distinguishes ok, redirect, broken, and blocked responses', () => {
  assert.equal(
    classifyHttpStatus(200, 'https://example.com/page', 'https://example.com/page'),
    'ok'
  )
  assert.equal(
    classifyHttpStatus(200, 'https://example.com/page', 'https://example.com/other'),
    'redirect'
  )
  assert.equal(
    classifyHttpStatus(301, 'https://example.com/old', 'https://example.com/new'),
    'redirect'
  )
  assert.equal(
    classifyHttpStatus(200, 'https://example.com/cf', 'https://example.com/cf', 'Just a moment...'),
    'blocked'
  )
  assert.equal(
    classifyHttpStatus(
      200,
      'https://example.com/page',
      'https://example.com/page',
      'Page Not Found - 404'
    ),
    'broken'
  )
  assert.equal(
    classifyHttpStatus(404, 'https://example.com/missing', 'https://example.com/missing'),
    'broken'
  )
  assert.equal(
    classifyHttpStatus(500, 'https://example.com/fail', 'https://example.com/fail'),
    'broken'
  )
  assert.equal(
    classifyHttpStatus(403, 'https://example.com/cdn', 'https://example.com/cdn'),
    'blocked'
  )
  assert.equal(
    classifyHttpStatus(429, 'https://example.com/rate', 'https://example.com/rate'),
    'blocked'
  )
})

test('verifyUrl checks against cached lookup outcomes', async () => {
  const cache = {
    'https://active.example.org': {
      status: 'ok',
      httpStatus: 200,
      finalUrl: 'https://active.example.org',
      crossDomain: false,
      genericRedirect: false
    },
    'https://redirect.example.org': {
      status: 'ok',
      httpStatus: 200,
      finalUrl: 'https://newdomain.example.org',
      crossDomain: true,
      genericRedirect: false
    },
    'https://broken.example.org': {
      status: 'http-error',
      httpStatus: 404,
      finalUrl: 'https://broken.example.org'
    },
    'https://blocked.example.org': {
      status: 'http-error',
      httpStatus: 403,
      finalUrl: 'https://blocked.example.org'
    },
    'https://cloudflare.example.org': {
      status: 'blocked',
      httpStatus: 200,
      title: 'Just a moment...',
      finalUrl: 'https://cloudflare.example.org'
    }
  }

  assert.equal((await verifyUrl('https://active.example.org', { cache })).status, 'ok')
  assert.equal((await verifyUrl('https://redirect.example.org', { cache })).status, 'redirect')
  assert.equal((await verifyUrl('https://broken.example.org', { cache })).status, 'broken')
  assert.equal((await verifyUrl('https://blocked.example.org', { cache })).status, 'blocked')
  assert.equal((await verifyUrl('https://cloudflare.example.org', { cache })).status, 'blocked')
  assert.equal(
    (await verifyUrl('https://uncached.example.org', { live: false, cache })).status,
    'untested'
  )
  assert.equal((await verifyUrl('invalid-url', { cache })).status, 'syntax-error')
})

test('checkEmailSyntax detects formatting errors and suggests candidate fixes', () => {
  assert.deepEqual(checkEmailSyntax('info@library.gov.uk'), {
    valid: true,
    candidate: 'info@library.gov.uk',
    issue: null
  })

  assert.deepEqual(checkEmailSyntax('city.library@bradford.gov.uk.'), {
    valid: false,
    candidate: 'city.library@bradford.gov.uk',
    issue: 'trailing-period'
  })

  assert.deepEqual(
    checkEmailSyntax('Lostwithiel Library <lostwithiel.library@liscornwall.org.uk>'),
    {
      valid: false,
      candidate: 'lostwithiel.library@liscornwall.org.uk',
      issue: 'display-name'
    }
  )

  assert.deepEqual(checkEmailSyntax('https://cumberland.gov.uk/contact'), {
    valid: false,
    candidate: null,
    issue: 'url-value'
  })

  assert.deepEqual(checkEmailSyntax('plain-text-no-at'), {
    valid: false,
    candidate: null,
    issue: 'missing-at'
  })
})

test('auditDirectory scans content without errors and formatAuditSummary returns text', async () => {
  const report = await auditDirectory({ live: false })

  assert.ok(report.totals.libraries > 0)
  assert.ok(report.totals.authorities > 0)
  assert.ok(report.postcodes.found > 4000)
  assert.equal(report.postcodes.empty, 0)
  assert.ok(report.urls.total > 0)
  assert.equal(report.urls.syntaxIssues.length, 0)

  const summary = formatAuditSummary(report)
  assert.ok(summary.includes('DIRECTORY HEALTH & VERIFICATION REPORT'))
  assert.ok(summary.includes('Total Libraries:'))
  assert.ok(summary.includes('Postcodes Assessment:'))

  const markdown = formatAuditMarkdown(report)
  assert.ok(markdown.includes('Directory Health & Link Verification Report'))
  assert.ok(markdown.includes('Health Overview'))
})

test('attachDiscoveredIssues creates content-addressed manual review references', () => {
  const records = [{ id: 'lib_test_1', manual_checks: [] }]
  const report = {
    candidates: [
      {
        id: 'lib_test_1',
        field: 'URL',
        before: 'example.org',
        candidate: 'https://example.org',
        reason: 'Added missing protocol'
      }
    ]
  }
  const auditJson = { review: [] }

  const result = attachDiscoveredIssues(records, report, auditJson)
  assert.equal(result.newReviewItems, 1)
  assert.equal(auditJson.review.length, 1)
  assert.ok(auditJson.review[0].review_id.startsWith('review_'))
  assert.equal(records[0].manual_checks.length, 1)
  assert.equal(records[0].manual_checks[0].kind, 'candidate-field-update')
  assert.ok(
    records[0].manual_checks[0].audit_refs[0].startsWith('migration/directory/report.json#review_')
  )
})
