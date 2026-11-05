import test from 'node:test'
import { parse as parseCsv } from 'csv-parse/sync'
import { libraryCsv, libraryValidationReport } from '../src/lib/directory-export.mjs'
import { directoryReviewRows, reviewIndex } from '../src/lib/directory-review.mjs'
import {
  libraries as currentLibraries,
  authorities as currentAuthorities
} from '../src/lib/directory.mjs'
import assert from 'node:assert/strict'
import {
  readFileSync,
  readdirSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import {
  openingHours,
  legacyHours,
  normalizePostcode,
  normalizeUprn
} from '../src/lib/directory-data.mjs'
import {
  directorySchemas,
  dataIssues,
  validateRecord,
  prepareDirectoryEdit
} from '../src/lib/directory-schema.mjs'
import {
  buildingMatch,
  possibleSameBuilding,
  sqlPostcodeRules,
  correctedPostcode,
  uprnEvidence,
  convertLibrary,
  writeMigratedRecords,
  unmappedDetails,
  attachManualChecks,
  resolveReviewItem
} from '../scripts/directory/migrate.mjs'
import { parseServicePage, parseOnsPostcode, parseNsul } from '../scripts/directory/lookups.mjs'
import { createDirectory } from '../src/lib/directory-model.mjs'
import { libraryView, authorityView } from '../src/lib/directory-view.ts'

test("review worklist follows live flags, prioritizes risks and never attaches another record's evidence", () => {
  const issue = { field: 'Statutory', code: 'required', value: null, reason: 'Unknown' }
  const check = {
    kind: 'opening-hours',
    reason: 'Invalid session',
    audit_refs: [
      'migration/directory/report.json#review_one',
      'migration/directory/report.json#review_other'
    ]
  }
  const record = (id, name, checks = [], exceptions = []) => ({
    id,
    slug: name.toLowerCase(),
    authority: 'example',
    data: { 'Library name': name },
    manual_checks: checks,
    validation_exceptions: exceptions
  })
  const rows = directoryReviewRows(
    {
      authorities: [
        {
          file: 'example.json',
          record: { id: 1, slug: 'example', data: { 'Local authority': 'Example' } }
        }
      ],
      libraries: [
        { file: 'example--alpha.json', record: record('one', 'Alpha', [], [issue]) },
        { file: 'example--beta.json', record: record('two', 'Beta', [check]) },
        { file: 'example--resolved.json', record: record('three', 'Resolved') }
      ]
    },
    {
      review: [
        { review_id: 'review_one', id: 'two', kind: 'opening-hours', original: ['09:00-08:00'] },
        { review_id: 'review_other', id: 'one', candidate: 'unrelated secret' }
      ]
    }
  )
  assert.deepEqual(
    rows.map((row) => row.name),
    ['Beta', 'Alpha']
  )
  assert.equal(rows[0].authority, 'Example')
  assert.equal(rows[0].editPath, '/admin/#/collections/libraries/entries/example--beta')
  assert.deepEqual(rows[0].manual[0].evidence[0].original, ['09:00-08:00'])
  assert.ok(!JSON.stringify(rows[0]).includes('unrelated secret'))
  assert.ok(!('exceptions' in reviewIndex(rows)[0]))
  assert.ok(!('manual' in reviewIndex(rows)[0]))
})

test('CSV exports preserve schema columns, types, quoted values and explicit validation gaps', () => {
  const data = Object.fromEntries(
    directorySchemas.libraries.fields.map((field) => [field.name, null])
  )
  Object.assign(data, {
    'Local authority': 'Example',
    'Local authority code': 'E09000001',
    'Library name': 'Central, "Annex"',
    Postcode: 'SW1A 1AA',
    Status: 'Open',
    Statutory: 'Yes',
    'Type of library': 'LAL',
    Latitude: 51.5,
    'Unique property reference number': 100000000001,
    Notes: 'First line\nSecond line'
  })
  const records = [
    { id: 'one', data },
    { id: 'two', data: { ...data, Statutory: null } }
  ]
  const csv = libraryCsv(records)
  const rows = parseCsv(csv, { columns: true })
  assert.deepEqual(
    Object.keys(rows[0]),
    directorySchemas.libraries.fields.map((field) => field.name)
  )
  assert.equal(rows.length, 2)
  assert.equal(rows[0]['Library name'], data['Library name'])
  assert.equal(rows[0].Notes, data.Notes)
  assert.equal(rows[0].Latitude, '51.5')
  assert.equal(rows[0]['Unique property reference number'], '100000000001')
  assert.equal(rows[0]['Monday staffed hours'], '')
  assert.equal(parseCsv(libraryCsv(records, { validOnly: true }), { columns: true }).length, 1)
  const report = libraryValidationReport(records)
  assert.equal(report.totalRecords, 2)
  assert.equal(report.validRecords, 1)
  assert.deepEqual(report.issues[0], {
    id: 'two',
    name: data['Library name'],
    csvRecord: 3,
    field: 'Statutory',
    code: 'required',
    value: null
  })
  assert.equal(parseCsv(libraryCsv([])).length, 1)
})

test('complete and authority-scoped CSVs preserve every record while strict exports pass the schema', () => {
  const allRows = parseCsv(libraryCsv(currentLibraries), { columns: true })
  assert.equal(allRows.length, currentLibraries.length)
  for (const authority of currentAuthorities) {
    const entries = currentLibraries.filter((record) => record.authority === authority.slug)
    const rows = parseCsv(libraryCsv(entries), { columns: true })
    assert.equal(rows.length, entries.length)
    assert.ok(rows.every((row) => row['Local authority'] === authority.data['Local authority']))
  }
  const strict = parseCsv(libraryCsv(currentLibraries, { validOnly: true }), { columns: true })
  assert.equal(strict.length, libraryValidationReport(currentLibraries).validRecords)
  for (const row of strict) {
    const data = Object.fromEntries(
      directorySchemas.libraries.fields.map((field) => [
        field.name,
        row[field.name] === ''
          ? null
          : ['number', 'integer', 'year'].includes(field.type)
            ? Number(row[field.name])
            : row[field.name]
      ])
    )
    assert.deepEqual(dataIssues(data, directorySchemas.libraries), [])
  }
})

test('public views use canonical fields without legacy payload fallbacks', () => {
  const data = Object.fromEntries(
    directorySchemas.libraries.fields.map((field) => [field.name, null])
  )
  data['Library name'] = 'Canonical Library'
  data['Facilities and services'] = 'Books'
  data['Monday staffed hours'] = '09:00-17:00'
  const view = libraryView({
    data,
    extensions: {
      town: 'Legacy town',
      services: [{ service: 'Books', url: 'https://old.example/' }],
      accessibility: ['wheelchair-access'],
      openingTimes: { monday: { timeFrames: [] } }
    }
  })
  assert.equal(view.name, 'Canonical Library')
  assert.equal(view.town, undefined)
  assert.deepEqual(view.services, [{ service: 'Books' }])
  assert.deepEqual(view.accessibility, [])
  assert.equal(view.openingTimes.monday.timeFrames[0].startTime, '09:00')
  const service = authorityView({
    data: { 'Local authority': 'Canonical Authority' },
    extensions: {
      about: 'Old about text',
      social: [{ channel: 'other', url: 'https://old.example/' }]
    }
  })
  assert.equal(service.name, 'Canonical Authority')
  assert.equal(service.about, undefined)
  assert.deepEqual(service.social, [])
})

test('source-only details are audited rather than embedded in canonical records', () => {
  const original = {
    id: 'one',
    slug: 'one',
    name: 'One',
    address: 'Example Town',
    town: 'Example Town',
    services: [
      { service: 'Books', url: '' },
      { service: 'Computers', url: 'https://booking.example/' }
    ],
    accessibility: ['step-free-access', 'wheelchair-access'],
    openingTimes: { exceptions: [] }
  }
  const record = convertLibrary(original, { name: 'Example' }, { review: [] })
  assert.ok(!('extensions' in record))
  assert.equal(record.data['Step-free access'], 'Yes')
  assert.deepEqual(unmappedDetails(original, 'libraries'), {
    accessibility: ['wheelchair-access'],
    serviceLinks: [{ service: 'Computers', url: 'https://booking.example/' }]
  })
  record.validation_exceptions = dataIssues(record.data, directorySchemas.libraries).map(
    (issue) => ({ ...issue, reason: 'Missing source data' })
  )
  validateRecord(record, 'libraries')
  assert.throws(
    () => validateRecord({ ...record, extensions: {} }, 'libraries'),
    /unexpected record field: extensions/
  )
  assert.throws(
    () => validateRecord({ ...record, openingTimes: {} }, 'libraries'),
    /unexpected record field: openingTimes/
  )
})

test('maintainer resolutions preserve data, exceptions and audit IDs while leaving non-null postcode problems open', () => {
  const policies = JSON.parse(
    readFileSync('migration/directory/overrides.json', 'utf8')
  ).review_resolutions
  const record = {
    id: 'one',
    data: { Postcode: null, URL: 'https://existing.example/' },
    updated_on: '2026-01-23',
    validation_exceptions: [
      { field: 'Postcode', code: 'required', value: null, reason: 'Missing source data' }
    ]
  }
  const originalValues = structuredClone(record)
  const review = [
    {
      kind: 'current-service-url',
      id: 'one',
      reason: 'Existing LibraryOn URL retained; lookup needs editorial review'
    },
    { kind: 'service-url', id: 'one', candidate: 'https://candidate.example/' },
    { kind: 'postcode-lookup', id: 'one', postcode: null, result: null },
    { kind: 'postcode-lookup', id: 'one', postcode: 'AB1 0AA', result: { status: 'terminated' } },
    {
      kind: 'unmapped-source-details',
      id: 'one',
      reason:
        'Source details have no exact Table Schema field; preserved in the audit for manual review, not used as a parallel live model'
    },
    { kind: 'opening-hours', id: 'one', reason: 'Invalid session' }
  ]
  attachManualChecks([record], review)
  const identifiers = review.map((item) => item.review_id)
  attachManualChecks([record], review, policies)
  assert.deepEqual(
    record.manual_checks.map((item) => item.kind),
    ['postcode-lookup', 'opening-hours']
  )
  assert.deepEqual(
    review.map((item) => item.review_id),
    identifiers
  )
  assert.deepEqual(
    review.map((item) => item.resolution?.status),
    ['approved', 'approved', 'deferred', undefined, 'archived', undefined]
  )
  assert.deepEqual(record.data, originalValues.data)
  assert.deepEqual(record.validation_exceptions, originalValues.validation_exceptions)
  assert.equal(record.updated_on, originalValues.updated_on)
  attachManualChecks([record], review, policies)
  assert.deepEqual(
    review.map((item) => item.review_id),
    identifiers
  )
  assert.equal(
    resolveReviewItem(
      { kind: 'postcode-lookup', postcode: null, result: { status: 'error' } },
      policies
    ),
    null
  )
  assert.throws(
    () => resolveReviewItem({}, [{ kind: 'anything', status: 'approved' }]),
    /Review resolutions require/
  )
})

test('historical supplier and software hints are archived while unmatched source rows are deferred', () => {
  const policies = JSON.parse(
    readFileSync('migration/directory/overrides.json', 'utf8')
  ).review_resolutions
  const record = {
    id: 'one',
    data: { 'Library management system': null, 'Ebook supplier': null, 'Audiobook supplier': null },
    updated_on: '2026-01-23',
    validation_exceptions: []
  }
  const originalRecord = structuredClone(record)
  const review = [
    {
      kind: 'historical-lms',
      id: 'one',
      field: 'Library management system',
      candidate: 'Historical software',
      reason: 'Current catalogue does not independently confirm historical system'
    },
    {
      kind: 'historical-supplier',
      id: 'one',
      field: 'Ebook supplier',
      candidate: 'Historical supplier',
      reason: 'Historical grid does not establish a current supplier'
    },
    {
      kind: 'unmatched-source',
      source: 'libraries.csv:123',
      name: 'Possible historical building',
      reason:
        'Not enough evidence for a unique closed building; open historical rows require review'
    },
    { kind: 'opening-hours', id: 'one', reason: 'Invalid opening session' }
  ]
  attachManualChecks([record], review)
  const identifiers = review.map((item) => item.review_id)
  attachManualChecks([record], review, policies)
  assert.deepEqual(
    review.map((item) => item.resolution?.status),
    ['archived', 'archived', 'deferred', undefined]
  )
  assert.deepEqual(
    review.map((item) => item.review_id),
    identifiers
  )
  assert.deepEqual(
    record.manual_checks.map((item) => item.kind),
    ['opening-hours']
  )
  assert.deepEqual(record.data, originalRecord.data)
  assert.equal(record.updated_on, originalRecord.updated_on)
  assert.deepEqual(record.validation_exceptions, originalRecord.validation_exceptions)
  assert.equal(review[0].candidate, 'Historical software')
  assert.equal(review[2].name, 'Possible historical building')
})

test('manual-check references remain stable when review entries move and contain no source payload', () => {
  const records = [{ id: 'one' }]
  const review = [{ kind: 'postcode-lookup', id: 'one', reason: 'Check the postcode' }]
  attachManualChecks(records, review)
  const reference = records[0].manual_checks[0].audit_refs[0]
  attachManualChecks(records, [{ kind: 'other', id: 'two' }, ...review])
  assert.equal(records[0].manual_checks[0].audit_refs[0], reference)
  assert.deepEqual(Object.keys(records[0].manual_checks[0]).sort(), [
    'audit_refs',
    'kind',
    'reason'
  ])
  attachManualChecks(records, [])
  assert.ok(!('manual_checks' in records[0]))
})

test('every live file contains only canonical data, metadata, exceptions and valid audit references', () => {
  const report = JSON.parse(readFileSync('migration/directory/report.json', 'utf8'))
  const reviews = new Map(report.review.map((item) => [item.review_id, item]))
  for (const kind of ['libraries', 'authorities']) {
    for (const file of readdirSync(`src/content/${kind}`).filter((name) =>
      name.endsWith('.json')
    )) {
      const record = JSON.parse(readFileSync(`src/content/${kind}/${file}`, 'utf8'))
      validateRecord(record, kind)
      assert.ok(!('extensions' in record), file)
      for (const check of record.manual_checks || []) {
        for (const reference of check.audit_refs) {
          const review = reviews.get(reference.split('#')[1])
          assert.ok(review, `${file}: missing audit evidence`)
          assert.ok(
            review.id === record.id || review.ids?.includes(record.id),
            `${file}: unrelated audit evidence`
          )
        }
      }
    }
  }
})

test('ONS rows distinguish terminated postcodes and retain exact UPRN grid evidence', () => {
  const row = {
    pcds: 'AB1 0AA',
    dointr: '198001',
    doterm: '199606',
    lat: '57.101459',
    long: '-2.242858'
  }
  assert.equal(parseOnsPostcode(row).status, 'terminated')
  assert.equal(parseOnsPostcode({ ...row, doterm: '' }).status, 'found')
  assert.equal(parseOnsPostcode({ ...row, lat: '', long: '' }).latitude, null)
  const uprn = parseNsul({
    UPRN: '100023456789',
    PCDS: 'N6 6AS',
    GRIDGB1E: '528256',
    GRIDGB1N: '186364'
  })
  assert.equal(uprn.uprn, '100023456789')
  assert.equal(uprn.postcode, 'N6 6AS')
  assert.equal(uprn.easting, 528256)
  assert.equal(parseNsul({ UPRN: '123', GRIDGB1E: '', GRIDGB1N: '' }).status, 'unresolved')
})

test('opening hours preserve split sessions and reject ambiguous or invalid times', () => {
  assert.equal(openingHours('9:00-12:00, 13:00-17:00'), '09:00-12:00,13:00-17:00')
  assert.equal(openingHours('closed'), null)
  assert.equal(openingHours('Closed'), null)
  assert.equal(openingHours('  '), null)
  assert.equal(openingHours(''), null)
  assert.equal(
    legacyHours({ timeFrames: [{ startTime: '09:00', endTime: '17:00' }] }),
    '09:00-17:00'
  )
  for (const value of ['9-5', '25:00-26:00', '09:00-08:00', '09:00-13:00,12:00-17:00']) {
    assert.throws(() => openingHours(value))
  }
})

test('identifier normalization is not evidence that a postcode or UPRN exists', () => {
  assert.equal(normalizePostcode(' se1\u00a0 1ja '), 'SE1 1JA')
  assert.equal(normalizePostcode('[Unknown]'), null)
  assert.equal(normalizeUprn('000123456'), 123456)
  for (const value of ['unknown', '1e10', '-12', '0', '1000000000000']) {
    assert.equal(normalizeUprn(value), null)
  }
})

test('schema validation rejects unknown fields, wrong values and stale exceptions', () => {
  const data = Object.fromEntries(
    directorySchemas.libraries.fields.map((field) => [field.name, null])
  )
  const record = { slug: 'example', data, validation_exceptions: [] }
  assert.throws(() => validateRecord(record, 'libraries'), /required/)
  record.validation_exceptions = dataIssues(data, directorySchemas.libraries).map((issue) => ({
    ...issue,
    reason: 'Source does not record this value'
  }))
  assert.equal(validateRecord(record, 'libraries'), record)
  data.Postcode = 'SW1A 1AA'
  assert.throws(() => validateRecord(record, 'libraries'), /stale validation exception/)
  record.validation_exceptions = record.validation_exceptions.filter(
    (issue) => issue.field !== 'Postcode'
  )
  data['Monday staffed hours'] = '9-5'
  assert.throws(() => validateRecord(record, 'libraries'), /hours-format/)
  data['Monday staffed hours'] = 'Closed'
  assert.throws(() => validateRecord(record, 'libraries'), /hours-format/)
  data['Monday staffed hours'] = ''
  data['Weekly staffed hours'] = 40
  assert.equal(validateRecord(record, 'libraries'), record)
  data['Monday staffed hours'] = null
  data.unexpected = 'value'
  assert.throws(() => validateRecord(record, 'libraries'), /unknown-field/)
})

test('building matching requires name, postcode and specific address evidence', () => {
  const library = {
    name: 'Central Library',
    address: '12 Rosemount Road, Example',
    postcode: 'SW1A 1AA'
  }
  assert.ok(buildingMatch(library, { ...library, name: 'Central', address: '12 Rosemount Rd' }))
  assert.ok(!buildingMatch(library, { ...library, address: '14 Rosemount Road' }))
  assert.ok(!buildingMatch(library, { ...library, address: '12 Church Street' }))
  assert.ok(!buildingMatch(library, { ...library, postcode: 'SW1A 2AA' }))
  assert.ok(!buildingMatch(library, { ...library, name: 'Other Library' }))
  assert.ok(!buildingMatch(library, { ...library, address: 'Central Library' }))
  assert.ok(
    !buildingMatch(
      { ...library, address: '12 Rosemount Road, Example, Example County' },
      { ...library, address: '12 Church Street, Example, Example County' }
    )
  )
})

test('CMS edits materialize missing fields, clear resolved exceptions and reject invalid new values', () => {
  const record = prepareDirectoryEdit(
    { slug: 'example', data: { 'Library name': 'Example', Postcode: '' } },
    'libraries'
  )
  assert.equal(record.data.Postcode, null)
  assert.ok(record.validation_exceptions.some((item) => item.field === 'Postcode'))
  record.data.Postcode = 'SW1A 1AA'
  prepareDirectoryEdit(record, 'libraries')
  assert.ok(!record.validation_exceptions.some((item) => item.field === 'Postcode'))
  record.data['Monday staffed hours'] = ''
  prepareDirectoryEdit(record, 'libraries')
  assert.equal(record.data['Monday staffed hours'], null)
  record.data['Monday staffed hours'] = '9-5'
  assert.throws(() => prepareDirectoryEdit(record, 'libraries'), /hours-format/)
})

test('SQL corrections are name-scoped and do not replay deletion or status rules', () => {
  const rules = sqlPostcodeRules(
    "update basic set postcode = 'N3 1TR' where name = 'Church End' and postcode = 'N3 1SA';\ndelete from basic where name = 'Library';"
  )
  assert.equal(rules.length, 1)
  assert.equal(correctedPostcode('N3 1SA', 'Church End Library', rules).postcode, 'N3 1TR')
  assert.equal(correctedPostcode('N3 1SA', 'Other Library', rules).postcode, 'N3 1SA')
})

test('historical deduplication recognizes the same address despite name or postcode changes', () => {
  const first = {
    authority: 'example',
    name: 'Central Library',
    address: '12 Rosemount Road',
    postcode: 'AB25 1GW'
  }
  assert.ok(possibleSameBuilding(first, { ...first, name: 'Central', postcode: 'AB25 1GX' }))
  assert.ok(!possibleSameBuilding(first, { ...first, address: '14 Rosemount Road' }))
  assert.ok(!possibleSameBuilding(first, { ...first, authority: 'different' }))
  assert.ok(
    !possibleSameBuilding(
      { ...first, address: 'Cornhill Drive, Aberdeen' },
      { ...first, address: 'Byron Drive, Aberdeen' }
    )
  )
})

test('UPRN acceptance requires matching postcode, lookup and a nearby LibraryOn coordinate', () => {
  const source = { data: { 'Unique property reference number': 123 } }
  const target = { postcode: 'SW1A 1AA', record: { latitude: 51.5, longitude: -0.1 } }
  const lookups = {
    postcodes: { 'SW1A 1AA': { status: 'found' } },
    uprns: { 123: { status: 'found', postcode: 'SW1A 1AA', latitude: 51.50001, longitude: -0.1 } }
  }
  assert.ok(uprnEvidence(source, target, lookups).accepted)
  lookups.uprns[123].postcode = 'SW1A 2AA'
  assert.ok(!uprnEvidence(source, target, lookups).accepted)
  lookups.uprns[123].postcode = 'SW1A 1AA'
  lookups.uprns[123].latitude = 52
  assert.ok(!uprnEvidence(source, target, lookups).accepted)
})

test('service-page parsing rejects generic redirects and soft-error pages', () => {
  const page = parseServicePage(
    '<title>Libraries</title><p>Online library catalogue Koha</p>',
    'https://council.example/library',
    'https://council.example/'
  )
  assert.ok(page.genericRedirect)
  assert.equal(page.signals, 'Koha')
  assert.ok(
    parseServicePage(
      '<title>Just a moment...</title>',
      'https://catalogue.example/',
      'https://catalogue.example/'
    ).genericRedirect
  )
})

test('a building match needs name, postcode and specific address agreement', () => {
  const first = {
    name: 'Central Library',
    address: 'Central Library, 12 Rosemount Road, Aberdeen',
    postcode: 'AB25 1GW'
  }
  assert.ok(buildingMatch(first, { ...first, address: '12 Rosemount Road' }))
  assert.ok(!buildingMatch(first, { ...first, address: '14 Rosemount Road' }))
  assert.ok(!buildingMatch(first, { ...first, address: 'Central Library, Aberdeen' }))
  assert.ok(!buildingMatch(first, { ...first, postcode: 'AB25 1GX' }))
  assert.ok(!buildingMatch(first, { ...first, name: 'North Library' }))
})

test('historical SQL corrections are scoped and never execute deletion or status statements', () => {
  const rules = sqlPostcodeRules(
    "update basic set postcode = 'TA24 8NP' where name = 'Porlock' and postcode = 'TA24 7HD';\nupdate basic set closed = '2016' where postcode = 'NE33 2PE';\ndelete from basic where name = 'Library';"
  )
  assert.equal(rules.length, 1)
  assert.equal(correctedPostcode('TA24 7HD', 'Porlock Library', rules).postcode, 'TA24 8NP')
  assert.equal(correctedPostcode('TA24 7HD', 'Other Library', rules).postcode, 'TA24 7HD')
})

test('UPRN acceptance requires independent postcode and nearby property coordinates', () => {
  const source = { data: { 'Unique property reference number': 123 } }
  const target = { postcode: 'AB25 1GW', record: { latitude: 57.1, longitude: -2.1 } }
  const cache = {
    postcodes: { 'AB25 1GW': { status: 'found' } },
    uprns: {
      123: { status: 'found', latitude: 57.10001, longitude: -2.10001, postcode: 'AB25 1GW' }
    }
  }
  assert.ok(uprnEvidence(source, target, cache).accepted)
  cache.uprns[123].postcode = 'AB25 1GX'
  assert.ok(!uprnEvidence(source, target, cache).accepted)
  cache.uprns[123].postcode = 'AB25 1GW'
  cache.uprns[123].latitude = 58
  assert.ok(!uprnEvidence(source, target, cache).accepted)
  assert.ok(!uprnEvidence(source, target, {}).accepted)
})

test('LibraryOn hours separate staffed, volunteer and self-service without changing dates', () => {
  const record = convertLibrary(
    {
      id: 'one',
      name: 'One',
      slug: 'one',
      updated_on: '2025-01-02',
      latitude: null,
      longitude: null,
      openingTimes: {
        monday: {
          timeFrames: [
            { type: 'Staffed', startTime: '09:00', endTime: '12:00' },
            { type: 'Volunteer-run', startTime: '13:00', endTime: '17:00' },
            { type: 'Self-service', startTime: '17:00', endTime: '20:00' }
          ]
        },
        tuesday: { timeFrames: [] }
      }
    },
    { name: 'Authority', gss: 'E09000001' },
    { review: [] }
  )
  assert.equal(record.data['Monday staffed hours'], '09:00-12:00,13:00-17:00')
  assert.equal(record.data['Monday unstaffed hours'], '17:00-20:00')
  assert.equal(record.data['Tuesday staffed hours'], null)
  assert.equal(record.data['Tuesday unstaffed hours'], null)
  assert.equal(record.data['Wednesday staffed hours'], null)
  assert.equal(record.updated_on, '2025-01-02')
  const view = libraryView(record)
  assert.equal(view.name, 'One')
  assert.equal(view.openingTimes.monday.timeFrames.length, 3)
  assert.equal(view.openingTimes.monday.timeFrames[2].type, 'Self-service')
  assert.equal(view.updated_on, '2025-01-02')
  record.validation_exceptions = dataIssues(record.data, directorySchemas.libraries).map(
    (issue) => ({ ...issue, reason: 'Missing source value' })
  )
  assert.equal(
    createDirectory(
      [{ name: 'Authority', slug: 'authority' }],
      [{ ...record, authority: 'authority' }]
    ).libraries[0].name,
    'One'
  )
  record.data['Monday staffed hours'] = '9-5'
  assert.throws(() => createDirectory([], [record]), /hours-format/)
})

test('written schema records preserve every original ID, route and date and substantiate each new UPRN', () => {
  const baseline = JSON.parse(
    gunzipSync(readFileSync('migration/directory/libraryon-baseline.json.gz'))
  )
  const report = JSON.parse(readFileSync('migration/directory/report.json', 'utf8'))
  const lookups = JSON.parse(readFileSync('migration/directory/lookups.json', 'utf8'))
  for (const [kind, records] of Object.entries(baseline)) {
    for (const { file, record } of records) {
      const migrated = JSON.parse(readFileSync(`src/content/${kind}/${file}`, 'utf8'))
      validateRecord(migrated, kind)
      for (const field of [
        'id',
        'slug',
        'source_id',
        'source_url',
        'updated_on',
        'reviewed_on',
        'imported_on'
      ])
        assert.deepEqual(migrated[field], record[field], `${file}: ${field}`)
      if (kind === 'libraries') {
        const uprn = migrated.data['Unique property reference number']
        if (uprn && !record.uprn) {
          const evidence = uprnEvidence(
            { data: migrated.data },
            { postcode: migrated.data.Postcode, record },
            lookups
          )
          assert.ok(evidence.accepted, `${file}: ${evidence.reason}`)
          assert.equal(lookups.uprns[uprn].product, 'nsul')
        }
        if (migrated.data.Status === 'Open') assert.equal(migrated.data['Year closed'], null, file)
      }
    }
  }
  assert.ok(report.summary.filledUprns > 0)
  for (const added of report.added) {
    assert.ok(added.yearClosed)
    assert.ok(added.address)
  }
})

test('migration writes are repeatable, protect editorial edits and never remove originals', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'directory-migration-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  mkdirSync(join(directory, 'src/content/libraries'), { recursive: true })
  mkdirSync(join(directory, 'migration'), { recursive: true })
  const options = {
    workspaceRoot: pathToFileURL(`${directory}/`),
    reportRoot: pathToFileURL(`${directory}/migration/`)
  }
  const file = 'one.json'
  const record = { name: 'One', slug: 'one' }
  const original = { libraries: [{ file, record }] }
  const output = [
    { file, record: { ...record, data: {} } },
    { file: 'closed.json', record: { slug: 'closed', data: {} } }
  ]
  writeFileSync(join(directory, 'src/content/libraries/one.json'), JSON.stringify(record))
  writeMigratedRecords(original, [['libraries', output]], options)
  writeMigratedRecords(original, [['libraries', output]], options)
  writeMigratedRecords(original, [['libraries', output.slice(0, 1)]], options)
  assert.ok(!existsSync(join(directory, 'src/content/libraries/closed.json')))
  assert.throws(() => writeMigratedRecords(original, [], options), /remove original/)
  writeFileSync(join(directory, 'src/content/libraries/one.json'), '{"edited":true}')
  assert.throws(
    () => writeMigratedRecords(original, [['libraries', output]], options),
    /overwrite edited/
  )
  assert.equal(
    readFileSync(join(directory, 'src/content/libraries/one.json'), 'utf8'),
    '{"edited":true}'
  )
})
