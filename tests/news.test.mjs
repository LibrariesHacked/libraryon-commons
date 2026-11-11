/**
 * @fileoverview Automated tests for Public Libraries News helpers, dataset lookups, and organisation records.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { parse } from 'yaml'
import {
  categoryLabel,
  changeTypeLabel,
  categoryColor,
  formatNewsDate,
  getNewsMetadata,
  getNewsSummaries,
  getNewsSummaryForOrganisation,
  getNewsSummaryForAuthority,
  getNewsSummaryForLibrary,
  getNewsForLibrary,
  getNewsForAuthority,
  getNewsForOrganisation,
  filterStoriesByDate,
  CATEGORY_LABELS,
  CHANGE_TYPE_LABELS,
  CATEGORY_COLORS
} from '../src/lib/content/newsHelpers.mjs'

test('categoryLabel and changeTypeLabel resolve known keys and format fallbacks', () => {
  assert.equal(categoryLabel('cuts_and_finance'), 'Cuts & Finance')
  assert.equal(categoryLabel('closures_and_threats'), 'Closures & Threats')
  assert.equal(categoryLabel('unknown_topic'), 'unknown topic')
  assert.equal(categoryLabel(''), '')

  assert.equal(changeTypeLabel('closure'), 'Closure')
  assert.equal(changeTypeLabel('community_handover'), 'Community Handover')
  assert.equal(changeTypeLabel('custom_change'), 'custom change')
  assert.equal(changeTypeLabel(''), '')
})

test('categoryColor returns logical grouping colours and defaults to plum', () => {
  assert.equal(categoryColor('cuts_and_finance'), 'rose')
  assert.equal(categoryColor('closures_and_threats'), 'rose')
  assert.equal(categoryColor('refurbishment_and_new_builds'), 'green')
  assert.equal(categoryColor('mobile_and_outreach'), 'green')
  assert.equal(categoryColor('digital_and_technology'), 'apricot')
  assert.equal(categoryColor('opening_hours'), 'apricot')
  assert.equal(categoryColor('events_and_activities'), 'plum')
  assert.equal(categoryColor('governance_and_trusts'), 'plum')
  assert.equal(categoryColor('unknown_topic'), 'plum')
  assert.equal(categoryColor(''), 'plum')
})

test('formatNewsDate formats dates in British English and handles empty or invalid inputs', () => {
  assert.equal(formatNewsDate(''), '')
  assert.equal(formatNewsDate(null), '')
  assert.equal(formatNewsDate('not-a-date'), 'not-a-date')
  const formatted = formatNewsDate('2026-11-02T12:00:00Z')
  assert.match(formatted, /2\s+Nov\s+2026/)
})

test('filterStoriesByDate filters by 1y, 2y, 3y, 5y presets, custom range, and all', () => {
  const sample = [
    { id: 1, date: '2026-11-01' },
    { id: 2, date: '2025-10-01' },
    { id: 3, date: '2023-05-15' },
    { id: 4, date: '2020-01-01' },
    { id: 5, date: '2015-06-01' }
  ]
  const anchor = '2026-11-01'

  const past1y = filterStoriesByDate(sample, { preset: '1y', anchorDate: anchor })
  assert.equal(past1y.length, 1)
  assert.equal(past1y[0].id, 1)

  const past2y = filterStoriesByDate(sample, { preset: '2y', anchorDate: anchor })
  assert.equal(past2y.length, 2)
  assert.deepEqual(
    past2y.map((s) => s.id),
    [1, 2]
  )

  const past3y = filterStoriesByDate(sample, { preset: '3y', anchorDate: anchor })
  assert.equal(past3y.length, 2)

  const past5y = filterStoriesByDate(sample, { preset: '5y', anchorDate: anchor })
  assert.equal(past5y.length, 3)

  const all = filterStoriesByDate(sample, { preset: 'all' })
  assert.equal(all.length, 5)

  const custom = filterStoriesByDate(sample, {
    preset: 'custom',
    from: '2022-01-01',
    to: '2025-12-31'
  })
  assert.equal(custom.length, 2)
  assert.deepEqual(
    custom.map((s) => s.id),
    [2, 3]
  )
})

test('getNewsMetadata returns metadata structure with story and category counts', () => {
  const metadata = getNewsMetadata()
  assert.ok(metadata)
  assert.equal(typeof metadata.total_stories, 'number')
  assert.ok(metadata.categories)
  assert.ok(metadata.change_types)
  assert.ok(metadata.organisations)
  assert.ok(metadata.authorities)
})

test('news story accessors return story arrays and resolve authorities flexibly', () => {
  const orgStories = getNewsForOrganisation('arts-council-england')
  assert.ok(Array.isArray(orgStories))

  const unknownOrg = getNewsForOrganisation('non-existent-organisation')
  assert.deepEqual(unknownOrg, [])

  const unknownAuth = getNewsForAuthority('E99999999', 'unknown-authority', 'Unknown')
  assert.deepEqual(unknownAuth, [])

  const unknownLib = getNewsForLibrary('non-existent-lib-id')
  assert.deepEqual(unknownLib, [])
})

test('news summaries return high-level counts, presets, eras, and top categories', () => {
  const summaries = getNewsSummaries()
  assert.ok(summaries)
  assert.ok(summaries.organisations)
  assert.ok(summaries.authorities)
  assert.ok(summaries.libraries)

  const cilipSummary = getNewsSummaryForOrganisation('cilip')
  assert.ok(cilipSummary)
  assert.ok(cilipSummary.total >= 700)
  assert.equal(typeof cilipSummary.first_year, 'number')
  assert.equal(typeof cilipSummary.latest_year, 'number')
  assert.ok(cilipSummary.by_preset)
  assert.ok(cilipSummary.by_era)
  assert.ok(Array.isArray(cilipSummary.top_categories))

  const authSummary = getNewsSummaryForAuthority('E10000034', 'worcestershire', 'Worcestershire')
  assert.ok(authSummary)
  assert.ok(authSummary.total >= 300)
  assert.ok(authSummary.by_preset.all === authSummary.total)

  const unknownSummary = getNewsSummaryForOrganisation('non-existent-org')
  assert.equal(unknownSummary, null)
})

test('organisation content records pass schema requirements and have valid files', () => {
  const orgDir = new URL('../src/content/organisations', import.meta.url)
  assert.ok(existsSync(orgDir))
  const files = readdirSync(orgDir).filter((file) => file.endsWith('.md'))
  assert.ok(files.length >= 10, 'At least 10 organisation profiles exist')

  for (const file of files) {
    const raw = readFileSync(
      new URL(`../src/content/organisations/${file}`, import.meta.url),
      'utf8'
    )
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
    assert.ok(match, `${file}: valid frontmatter structure`)
    const data = parse(match[1])
    assert.ok(data.name, `${file}: has name`)
    assert.ok(data.slug, `${file}: has slug`)
    assert.equal(data.slug, file.replace(/\.md$/, ''), `${file}: slug matches filename`)
    assert.ok(data.description, `${file}: has description`)
    if (data.website) {
      assert.ok(data.website.startsWith('http'), `${file}: website is HTTP(S) URL`)
    }
    assert.ok(match[2].trim().length > 0, `${file}: has body content`)
  }
})

test('Decap CMS config includes organisations collection matching content fields', () => {
  const rawConfig = readFileSync(new URL('../public/admin/config.yml', import.meta.url), 'utf8')
  const config = parse(rawConfig)
  const orgCollection = config.collections.find((c) => c.name === 'organisations')
  assert.ok(orgCollection, 'organisations collection is registered in CMS')
  assert.equal(orgCollection.folder, 'src/content/organisations')

  const fieldNames = (orgCollection.fields || []).map((f) => f.name)
  assert.ok(fieldNames.includes('name'))
  assert.ok(fieldNames.includes('slug'))
  assert.ok(fieldNames.includes('acronym'))
  assert.ok(fieldNames.includes('role'))
  assert.ok(fieldNames.includes('country'))
  assert.ok(fieldNames.includes('website'))
  assert.ok(fieldNames.includes('description'))
  assert.ok(fieldNames.includes('tags'))
  assert.ok(fieldNames.includes('body'))
})

test('umbrella stakeholder pages exclude news coverage sections', () => {
  const nonNewsSlugs = ['local-authorities', 'the-public']
  for (const slug of nonNewsSlugs) {
    const summary = getNewsSummaryForOrganisation(slug)
    assert.equal(summary, null, `${slug} should not have an organisation news summary`)
    const stories = getNewsForOrganisation(slug)
    assert.deepEqual(stories, [], `${slug} should not have news stories`)
  }
})

test('news and stakeholders index pages exist as editable CMS markdown pages', () => {
  for (const [file, path] of [
    ['news.md', '/news'],
    ['organisations.md', '/organisations']
  ]) {
    const pagePath = new URL(`../src/content/pages/${file}`, import.meta.url)
    assert.ok(existsSync(pagePath), `src/content/pages/${file} exists`)
    const raw = readFileSync(pagePath, 'utf8')
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
    assert.ok(match, `${file} has frontmatter`)
    const data = parse(match[1])
    assert.equal(data.path, path)
    assert.equal(data.published, true)
    assert.ok(data.title, `${file} has title`)
    assert.ok(data.description, `${file} has description`)
    assert.ok(match[2].trim().length > 0, `${file} has intro content`)
  }
})

test('sync-news GitHub workflow is configured for automatic scheduled and dispatch updates', () => {
  const workflowPath = new URL('../.github/workflows/sync-news.yml', import.meta.url)
  assert.ok(existsSync(workflowPath), '.github/workflows/sync-news.yml exists')
  const content = readFileSync(workflowPath, 'utf8')
  const workflow = parse(content)
  assert.equal(workflow.name, 'Sync Public Libraries News')
  assert.ok(workflow.on.schedule, 'workflow has a schedule')
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'), 'workflow supports workflow_dispatch')
  assert.ok(workflow.on.repository_dispatch, 'workflow supports repository_dispatch')
  assert.equal(workflow.permissions.contents, 'write')
  const steps = workflow.jobs.sync.steps
  assert.ok(
    steps.some(
      (s) =>
        s.uses?.startsWith('actions/checkout') &&
        s.with?.repository?.includes('public-libraries-news')
    ),
    'checks out PLN repository'
  )
  assert.ok(
    steps.some((s) => s.run?.includes('npm run sync:news')),
    'runs npm run sync:news'
  )
  assert.ok(
    steps.some((s) => s.run?.includes('git commit')),
    'commits news changes'
  )
})
