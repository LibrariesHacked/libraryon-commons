/**
 * @fileoverview Automated tests for CMS domain authentication, GSS permission scoping, and Netlify Identity hooks.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  parseDomainPermissions,
  extractDomainFromEmail,
  resolveUserPermissions,
  isGssAllowed,
  validateEntrySave,
  filterCollectionsForPermissions
} from '../src/lib/cms/cmsAuthHelpers.mjs'
import { handler as validateHandler } from '../netlify/functions/identity-validate.mjs'
import { handler as signupHandler } from '../netlify/functions/identity-signup.mjs'
import { handler as loginHandler } from '../netlify/functions/identity-login.mjs'

test('domain permissions CSV loads and parses domain, GSS codes, and editorial roles', () => {
  const csvContent = readFileSync('src/data/auth/domain-permissions.csv', 'utf8')
  const rules = parseDomainPermissions(csvContent)

  assert.ok(
    rules.length >= 200,
    'Has comprehensive coverage of UK library services and national bodies'
  )

  // Core admin & national sector organisations (ACE, British Library, Libraries Connected, SLIC, etc.)
  const generalEditorDomains = [
    'librarieshacked.org',
    'librarycommons.org.uk',
    'artscouncil.org.uk',
    'bl.uk',
    'librariesconnected.org.uk',
    'librariesconnected.org',
    'scottishlibraries.org'
  ]
  for (const domain of generalEditorDomains) {
    const rule = rules.find((r) => r.domains.includes(domain))
    assert.ok(rule, `Has rule for ${domain}`)
    assert.equal(rule.role, 'general-editor', `${domain} must have general-editor role`)
    assert.deepEqual(rule.gssCodes, ['*'], `${domain} must have wildcard GSS access`)
  }

  // Service editors for local authorities
  const manchesterRule = rules.find((r) => r.domains.includes('manchester.gov.uk'))
  assert.ok(manchesterRule, 'Has manchester.gov.uk rule')
  assert.equal(manchesterRule.role, 'service-editor')
  assert.deepEqual(manchesterRule.gssCodes, ['E08000003'])
})

test('parsing supports semicolon-delimited multiple domains and multiple GSS codes', () => {
  const sampleCsv = `domain,gss_codes,role,notes
council.gov.uk;libraries.council.gov.uk,E08000001;E08000002,service-editor,Joint authority service
admin.org,*,general-editor,Super admin
`
  const rules = parseDomainPermissions(sampleCsv)
  assert.equal(rules.length, 2)
  assert.deepEqual(rules[0].domains, ['council.gov.uk', 'libraries.council.gov.uk'])
  assert.deepEqual(rules[0].gssCodes, ['E08000001', 'E08000002'])
  assert.equal(rules[0].role, 'service-editor')
  assert.equal(rules[1].role, 'general-editor')
  assert.deepEqual(rules[1].gssCodes, ['*'])
})

test('extractDomainFromEmail normalises and extracts domain parts', () => {
  assert.equal(extractDomainFromEmail('User@Manchester.Gov.UK'), 'manchester.gov.uk')
  assert.equal(extractDomainFromEmail('editor@librarycommons.org.uk'), 'librarycommons.org.uk')
  assert.equal(extractDomainFromEmail('invalid-email'), null)
  assert.equal(extractDomainFromEmail(''), null)
})

test('resolveUserPermissions assigns service-editor role and GSS codes to matching council domains', () => {
  const rules = [
    {
      domains: ['manchester.gov.uk'],
      gssCodes: ['E08000003'],
      role: 'service-editor',
      notes: 'Manchester'
    },
    {
      domains: ['librarycommons.org.uk'],
      gssCodes: ['*'],
      role: 'general-editor',
      notes: 'Core'
    }
  ]

  const councilUser = resolveUserPermissions('librarian@manchester.gov.uk', rules)
  assert.equal(councilUser.allowed, true)
  assert.equal(councilUser.role, 'service-editor')
  assert.equal(councilUser.isGeneralEditor, false)
  assert.deepEqual(councilUser.gssCodes, ['E08000003'])

  const coreUser = resolveUserPermissions('lead@librarycommons.org.uk', rules)
  assert.equal(coreUser.allowed, true)
  assert.equal(coreUser.role, 'general-editor')
  assert.equal(coreUser.isGeneralEditor, true)
  assert.deepEqual(coreUser.gssCodes, ['*'])

  const unknownUser = resolveUserPermissions('intruder@random.com', rules)
  assert.equal(unknownUser.allowed, false)
  assert.equal(unknownUser.role, null)
  assert.deepEqual(unknownUser.gssCodes, [])
})

test('resolveUserPermissions respects manually created users with explicit app_metadata', () => {
  const rules = [] // empty CSV
  const manualUser = {
    email: 'contractor@external-agency.com',
    app_metadata: {
      roles: ['service-editor'],
      gss_codes: ['E08000035']
    }
  }

  const resolved = resolveUserPermissions(manualUser, rules)
  assert.equal(resolved.allowed, true)
  assert.equal(resolved.role, 'service-editor')
  assert.deepEqual(resolved.gssCodes, ['E08000035'])
})

test('isGssAllowed enforces exact match unless wildcard is present', () => {
  assert.equal(isGssAllowed(['E08000003'], 'E08000003'), true)
  assert.equal(isGssAllowed(['E08000003'], 'E08000025'), false)
  assert.equal(isGssAllowed(['*'], 'E08000025'), true)
  assert.equal(isGssAllowed(['E08000001', 'E08000002'], 'E08000002'), true)
})

test('validateEntrySave allows matching GSS records and blocks unauthorized cross-service saves', () => {
  const serviceUser = {
    allowed: true,
    email: 'staff@manchester.gov.uk',
    role: 'service-editor',
    isGeneralEditor: false,
    gssCodes: ['E08000003']
  }

  const manchesterLibrary = {
    local_authority: 'Manchester',
    local_authority_code: 'E08000003',
    library_name: 'Central Library'
  }

  const birminghamLibrary = {
    local_authority: 'Birmingham',
    local_authority_code: 'E08000025',
    library_name: 'Library of Birmingham'
  }

  // Allowed: matching GSS code
  assert.doesNotThrow(() => {
    validateEntrySave(manchesterLibrary, 'libraries', serviceUser)
  })

  // Allowed: matching GSS code using schema field name local_authority_code
  const herefordshireUser = {
    allowed: true,
    email: 'user@herefordshire.gov.uk',
    role: 'service-editor',
    isGeneralEditor: false,
    gssCodes: ['E06000019']
  }

  const herefordLibrary = {
    local_authority: 'Herefordshire',
    local_authority_code: 'E06000019',
    library_name: 'Hereford Library'
  }

  const herefordAuthority = {
    local_authority: 'Herefordshire',
    local_authority_code: 'E06000019'
  }

  assert.doesNotThrow(() => {
    validateEntrySave(herefordLibrary, 'libraries', herefordshireUser)
    validateEntrySave(herefordAuthority, 'authorities', herefordshireUser)
  })

  // Denied: wrong GSS code
  assert.throws(() => {
    validateEntrySave(birminghamLibrary, 'libraries', serviceUser)
  }, /Permission denied.*E08000003.*E08000025/)

  // Denied: non-directory collection (e.g. editorial pages)
  assert.throws(() => {
    validateEntrySave({ title: 'New page' }, 'pages', serviceUser)
  }, /Permission denied.*only permitted to edit library directory records/)

  // General editor can save both
  const generalUser = {
    allowed: true,
    email: 'lead@librarycommons.org.uk',
    role: 'general-editor',
    isGeneralEditor: true,
    gssCodes: ['*']
  }

  assert.doesNotThrow(() => {
    validateEntrySave(birminghamLibrary, 'libraries', generalUser)
    validateEntrySave({ title: 'New page' }, 'pages', generalUser)
  })
})

test('filterCollectionsForPermissions restricts service editors to libraries and authorities', () => {
  const allCollections = [
    { name: 'settings' },
    { name: 'homepage' },
    { name: 'pages' },
    { name: 'libraries--manchester' },
    { name: 'libraries--unassigned' },
    { name: 'authorities', folder: 'src/content/authorities', fields: [] }
  ]

  const serviceFiltered = filterCollectionsForPermissions(
    allCollections,
    {
      allowed: true,
      role: 'service-editor',
      gssCodes: ['E08000003'],
      isGeneralEditor: false
    },
    [{ id: 'manchester', name: 'Manchester', code: 'E08000003' }]
  )
  assert.deepEqual(
    serviceFiltered.map((c) => c.name),
    ['libraries--manchester', 'authorities']
  )

  const generalFiltered = filterCollectionsForPermissions(allCollections, {
    allowed: true,
    role: 'general-editor',
    isGeneralEditor: true
  })
  assert.equal(generalFiltered.length, allCollections.length)
})

test('Netlify Identity validate function accepts pre-authorised domain and rejects unknown domains', async () => {
  const validEvent = {
    body: JSON.stringify({ user: { email: 'editor@manchester.gov.uk' } })
  }
  const validResponse = await validateHandler(validEvent)
  assert.equal(validResponse.statusCode, 200)

  const invalidEvent = {
    body: JSON.stringify({ user: { email: 'spammer@randomdomain.xyz' } })
  }
  const invalidResponse = await validateHandler(invalidEvent)
  assert.equal(invalidResponse.statusCode, 400)
  assert.match(invalidResponse.body, /not pre-authorised/)
})

test('Netlify Identity signup function assigns roles and GSS codes in app_metadata', async () => {
  const event = {
    body: JSON.stringify({ user: { email: 'librarian@manchester.gov.uk' } })
  }
  const response = await signupHandler(event)
  assert.equal(response.statusCode, 200)

  const parsed = JSON.parse(response.body)
  assert.deepEqual(parsed.app_metadata.roles, ['service-editor'])
  assert.deepEqual(parsed.app_metadata.gss_codes, ['E08000003'])
})

test('Netlify Identity login function refreshes roles and GSS codes from CSV', async () => {
  const event = {
    body: JSON.stringify({
      user: {
        email: 'staff@birmingham.gov.uk',
        app_metadata: { roles: ['service-editor'] }
      }
    })
  }
  const response = await loginHandler(event)
  assert.equal(response.statusCode, 200)

  const parsed = JSON.parse(response.body)
  assert.deepEqual(parsed.app_metadata.roles, ['service-editor'])
  assert.deepEqual(parsed.app_metadata.gss_codes, ['E08000025'])
})

test('admin index gates login reload on unauthenticated init to avoid infinite reload loop', () => {
  const adminHtml = readFileSync('src/pages/admin/index.astro', 'utf8')
  assert.ok(
    adminHtml.includes("netlifyIdentity.on('init'"),
    'Checks netlifyIdentity init event before attaching login handler'
  )
  assert.ok(
    !adminHtml.includes(
      "netlifyIdentity.on('login', () => {\n          document.location.reload()"
    ),
    'Does not reload unconditionally on every login event'
  )
  assert.ok(
    adminHtml.includes("netlifyIdentity.on('logout'"),
    'Registers logout listener on netlifyIdentity'
  )
})
