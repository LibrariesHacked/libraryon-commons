/**
 * @fileoverview Automated tests for directory data models, search indexing, routing, and map features.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createDirectory } from '../src/lib/directory-model.mjs'
import { Library, LibraryService } from '../src/lib/directory-models.mjs'
import { compactDirectory, expandDirectory, matchesLibrary } from '../src/lib/search.mjs'
import { createNameIndex } from '@geovation/gb-name-index'
import { libraryMapFeatures } from '../src/lib/library-map.mjs'

test('library maps use longitude/latitude, preserve routes and reject missing or invalid points', () => {
  const data = libraryMapFeatures(
    [
      { name: 'Central', url: '/libraries/example/central/', latitude: 51.5, longitude: -0.1 },
      {
        name: 'Closed',
        latitude: 52,
        longitude: 0,
        permanentlyClosed: true,
        url: 'javascript:alert(1)'
      },
      { name: 'Missing', latitude: null, longitude: null },
      { name: 'Out of range', latitude: 91, longitude: 0 },
      { name: 'Invalid longitude', latitude: 52, longitude: 181 }
    ],
    (path) => `/preview${path}`
  )
  assert.equal(data.type, 'FeatureCollection')
  assert.equal(data.features.length, 2)
  assert.deepEqual(data.features[0].geometry.coordinates, [-0.1, 51.5])
  assert.equal(data.features[0].properties.url, '/preview/libraries/example/central/')
  assert.equal(data.features[1].properties.url, '')
  assert.equal(data.features[1].properties.closed, true)
  assert.equal(
    libraryMapFeatures([
      { name: 'Closed branch', latitude: 51, longitude: 0, facilityOperated: 'Closed' }
    ]).features[0].properties.closed,
    true
  )
  assert.deepEqual(libraryMapFeatures([]).features, [])
})

test('GB name lookup decodes static shards, caches downloads and locates nearby libraries', async () => {
  const requests = []
  const files = {
    'index.json': {
      minimumQueryLength: 3,
      schema: [
        'name',
        'category',
        'subtype',
        'locality',
        'postcodeDistrict',
        'region',
        'longitude',
        'latitude',
        'bbox',
        'source'
      ],
      categories: ['populatedPlace'],
      regions: ['South West'],
      sources: ['OS Open Names'],
      routes: {},
      truncated: []
    },
    'bat.json': [['Bath', 0, null, null, null, 0, -2.36, 51.38, null, 0]]
  }
  const index = createNameIndex({
    baseUrl: 'https://static.example/names',
    fetch: async (url) => {
      const file = url.split('/').at(-1)
      assert.ok(Object.hasOwn(files, file), `Unexpected static request: ${url}`)
      requests.push(file)
      return Response.json(files[file])
    }
  })
  const places = await index.search('Bath', { previewLimit: 8 })
  assert.equal(places[0].name, 'Bath')
  assert.equal(places[0].region, 'South West')
  assert.equal(places[0].source, 'OS Open Names')
  assert.equal(places[0].latitude, 51.38)
  assert.equal(places[0].longitude, -2.36)
  assert.ok(
    matchesLibrary(
      { latitude: 51.381, longitude: -2.36 },
      {
        location: places[0],
        distance: 5
      }
    )
  )
  assert.ok(
    !matchesLibrary(
      { latitude: 53.5, longitude: -2.36 },
      {
        location: places[0],
        distance: 5
      }
    )
  )
  await index.search('Bath')
  assert.deepEqual(requests, ['index.json', 'bat.json'])
})

test('compact directory preserves search fields and filters with shared authority metadata', () => {
  const { searchRecords } = createDirectory(
    [{ name: 'Example', slug: 'example', country: 'England' }],
    [
      {
        name: 'Central Library',
        slug: 'central',
        authority: 'example',
        postcode: 'AB1 2CD',
        latitude: 51.123456,
        longitude: -0.123456,
        services: [{ service: 'Books' }],
        accessibility: ['step-free-access'],
        openingTimes: {
          monday: { timeFrames: [{ startTime: '09:00', endTime: '17:00' }] }
        }
      },
      { name: 'Branch', slug: 'branch', authority: 'example' }
    ]
  )
  const packed = compactDirectory(searchRecords)
  assert.equal(packed.authorities.length, 1)
  assert.ok(JSON.stringify(packed).length < JSON.stringify(searchRecords).length)
  const expanded = expandDirectory(JSON.parse(JSON.stringify(packed)))
  for (const [index, original] of searchRecords.entries()) {
    const { id, latitude, longitude, ...fields } = original
    assert.deepEqual(expanded[index], {
      ...fields,
      latitude: latitude === null ? null : Math.round(latitude * 1e4) / 1e4,
      longitude: longitude === null ? null : Math.round(longitude * 1e4) / 1e4
    })
  }
  assert.ok(
    matchesLibrary(expanded[1], {
      query: 'AB12CD',
      services: ['Books'],
      accessibility: ['step-free-access'],
      openNow: true,
      now: new Date(2026, 10, 2, 10)
    })
  )
  assert.throws(() => expandDirectory({ version: 2 }), /Unsupported directory/)
})

test('individual library records determine authority membership and stable public paths', () => {
  const result = createDirectory(
    [{ name: 'Example', slug: 'example', country: 'England' }],
    [{ name: 'Central Library', slug: 'central', id: 'one', authority: 'example' }]
  )
  assert.equal(result.libraries.length, 1)
  assert.ok(result.libraries[0] instanceof Library)
  assert.ok(result.authorities[0] instanceof LibraryService)
  assert.deepEqual(result.authorities[0].library_ids, ['one'])
  assert.equal(result.libraryPath(result.libraries[0]), '/libraries/example/central/')
})

test('unknown authorities and duplicate routes fail instead of losing records', () => {
  assert.throws(
    () => createDirectory([], [{ name: 'Legacy', slug: 'legacy' }], { requireCanonical: true }),
    /Invalid libraries record/
  )
  assert.throws(
    () => createDirectory([], [{ authority: 'missing', name: 'Library', slug: 'library' }]),
    /Unknown authority/
  )
  assert.throws(
    () =>
      createDirectory(
        [],
        [
          { name: 'One', slug: 'same' },
          { name: 'Two', slug: 'same' }
        ]
      ),
    /Duplicate library/
  )
})

test('legacy source slugs keep their public routes', () => {
  const result = createDirectory([], [{ name: 'Legacy', slug: 'Legacy-Library-' }])
  assert.equal(result.libraryPath(result.libraries[0]), '/libraries/unassigned/Legacy-Library-/')
})

test('library pages reproduce operating model, map links and nearby libraries', async () => {
  const { operatingModelLabel, mapLinks, nearbyLibraries, collectValues } =
    await import('../src/lib/directory-model.mjs')
  assert.equal(operatingModelLabel('Local Authority Run'), 'Local authority staffed')
  assert.equal(operatingModelLabel('Independent Community'), 'Community-run')
  const here = { id: 'a', address: '1 High Street', latitude: 51.5, longitude: -0.1 }
  const links = mapLinks(here)
  assert.ok(links.google.includes('query=library%201%20High%20Street'))
  assert.ok(links.apple.includes('ll=51.5,-0.1'))
  assert.equal(mapLinks({}), null)
  const near = nearbyLibraries(
    here,
    [
      here,
      { id: 'far', latitude: 53.5, longitude: -2.2 },
      { id: 'near', latitude: 51.51, longitude: -0.1 },
      { id: 'closed', latitude: 51.5, longitude: -0.1001, permanentlyClosed: true },
      { id: 'nowhere' }
    ],
    2
  )
  assert.deepEqual(
    near.map((item) => item.library.id),
    ['near', 'far']
  )
  assert.ok(near[0].miles > 0.6 && near[0].miles < 0.8)
  assert.deepEqual(
    collectValues([{ a: ['x', 'y'] }, { a: ['y', 'z'] }, {}], (item) => item.a),
    ['x', 'y', 'z']
  )
})

test('Library model encapsulates address, operatingModel, mapLinks, and nearby search', () => {
  const library = new Library({
    id: 'test-1',
    name: 'Test Central',
    authority: 'example',
    slug: 'test-central',
    data: {
      'Library name': 'Test Central',
      'Address 1': '10 High Street',
      Postcode: 'TE1 1ST',
      Latitude: 51.5,
      Longitude: -0.1,
      'Type of library': 'LAL',
      Status: 'Open'
    }
  })
  assert.equal(library.address, '10 High Street')
  assert.equal(library.facilityOperated, 'Local Authority Run')
  assert.equal(library.operatingModel, 'Local authority staffed')
  assert.ok(library.hasCoordinates)
  assert.equal(library.isClosed, false)
  assert.ok(library.mapLinks.google.includes('10%20High%20Street'))
  assert.ok(library.mapLinks.apple.includes('51.5,-0.1'))

  const other = new Library({
    id: 'test-2',
    name: 'Test Branch',
    data: { Latitude: 51.51, Longitude: -0.1 }
  })
  const nearest = library.nearby([other])
  assert.equal(nearest.length, 1)
  assert.equal(nearest[0].library.id, 'test-2')
})

test('LibraryService model encapsulates authority fields and channels', () => {
  const service = new LibraryService({
    slug: 'example',
    data: {
      'Local authority': 'Example Council',
      'Local authority code': 'E09000001',
      Country: 'England',
      'Twitter URL': 'https://twitter.com/example'
    }
  })
  assert.equal(service.name, 'Example Council')
  assert.equal(service.gss, 'E09000001')
  assert.equal(service.country, 'England')
  assert.equal(service.hasSocial, true)
  assert.equal(service.url, '/libraries/example/')
})
