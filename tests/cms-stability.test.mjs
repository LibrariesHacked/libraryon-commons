/**
 * @fileoverview Regressions for stock Git Gateway configuration, archive widgets and audited service fines.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { parse } from 'yaml'
import {
  archiveOptions,
  archiveWidgetProps,
  withArchiveWidgets,
  registerArchiveWidgets
} from '../src/lib/cms/archiveMedia.mjs'
import { createEditorComponents } from '../src/lib/cms/cmsHelpers.mjs'
import { GET as archiveManifest } from '../src/pages/admin/archive-media.json.js'
import { fineSummary } from '../src/lib/directory/fineHelpers.mjs'
import {
  serviceFieldSnapshot,
  planServiceFields,
  importServiceFields
} from '../scripts/directory/import-service-fields.mjs'
import { convertAuthority } from '../scripts/directory/migrate.mjs'
import { LibraryService } from '../src/lib/directory/models/LibraryService.mjs'

test('CMS keeps Git Gateway, disables global search and never replaces fetch or rewrites saved URLs', () => {
  const config = parse(readFileSync('public/admin/config.yml', 'utf8'))
  assert.equal(config.backend.name, 'git-gateway')
  assert.equal(config.search, false)
  assert.equal(config.local_backend, true)
  assert.equal(config.media_folder, 'public/uploads/community')
  for (const name of ['libraries', 'authorities']) {
    assert.equal(config.collections.find((item) => item.name === name).delete, false)
  }
  const source = readFileSync('src/pages/admin/index.astro', 'utf8')
  assert.doesNotMatch(source, /window\.fetch\s*=|__archiveMediaNames|normalizeArchiveUploadPaths/)
  assert.match(source, /config\.load_config_file = false/)
  assert.doesNotMatch(
    source,
    /registerBackend|registerGatewayBackend|gatewayBackend|config\.backend\.name\s*=/
  )
  assert.match(source, /identity\.netlify\.com\/v1\/netlify-identity-widget\.js/)
  assert.match(source, /https:\/\/unpkg\.com\/decap-cms@3\.18\.0\/dist\/decap-cms\.js/)
  const prepared = withArchiveWidgets(config)
  assert.equal(config.collections[0].files[0].fields[0].widget, 'object')
  assert.equal(prepared.backend.name, 'git-gateway')
  for (const component of createEditorComponents()) {
    const preparedComponent = withArchiveWidgets(component)
    assert.equal(preparedComponent.pattern, component.pattern)
    assert.equal(preparedComponent.toBlock, component.toBlock)
  }
})

test('archive manifest represents real files and selection inserts genuine paths without rewriting community URLs', async () => {
  const manifest = await archiveManifest().json()
  assert.equal(
    manifest.length,
    readdirSync('public/uploads/archive').filter((name) => !name.startsWith('.')).length
  )
  assert.ok(
    manifest.every((item) => item.url === `/uploads/archive/${encodeURIComponent(item.name)}`)
  )
  assert.ok(archiveOptions(manifest, 'image').every((item) => item.image))
  assert.equal(archiveOptions(manifest, 'file', 'NO-SUCH-ARCHIVE-FILE').length, 0)
  const widgets = new Map()
  const native = () => null
  const h = (type, props, ...children) => ({ type, props, children })
  registerArchiveWidgets(
    {
      getWidget: () => ({ control: native, preview: native }),
      registerWidget: (name, control) => widgets.set(name, control)
    },
    manifest,
    { h, createClass: (definition) => definition }
  )
  let selected
  const widget = widgets.get('archive-image')
  const instance = {
    state: { query: '' },
    props: {
      forID: 'image',
      value: '/uploads/community/shared.jpg',
      onChange: (value) => {
        selected = value
      }
    }
  }
  const rendered = widget.render.call(instance)
  assert.equal(rendered.children[0].type, native)
  assert.equal(rendered.children[0].props.value, '/uploads/community/shared.jpg')
  const select = rendered.children[1].children.find((node) => node?.type === 'select')
  select.props.onChange({ target: { value: archiveOptions(manifest, 'image')[0].url } })
  assert.ok(selected.startsWith('/uploads/archive/'))
  const props = archiveWidgetProps({ getAsset: (url) => `native:${url}` })
  assert.equal(props.getAsset('/uploads/archive/shared.jpg'), '/uploads/archive/shared.jpg')
  assert.equal(
    props.getAsset('/uploads/community/shared.jpg'),
    'native:/uploads/community/shared.jpg'
  )
})

test('fine display treats missing values as unknown and supports child-only and zero amounts', () => {
  const copy = {
    fine_free: 'Fine-free',
    adult_fine_label: 'adult',
    child_fine_label: 'child',
    fine_interval_prefix: 'per'
  }
  assert.equal(fineSummary({ adultFine: null, childFine: null }, copy), '')
  assert.equal(fineSummary({ adultFine: 0, childFine: null }, copy), '£0.00 adult')
  assert.equal(fineSummary({ adultFine: 0, childFine: 0 }, copy), 'Fine-free')
  assert.equal(fineSummary({ childFine: 0.1, fineInterval: 'Day' }, copy), '£0.10 child per day')
  assert.equal(fineSummary({ adultFine: NaN, childFine: undefined }, copy), '')
  const service = new LibraryService({ adult_fine: 0, child_fine: null })
  assert.equal(service.adultFine, 0)
  assert.equal(service.childFine, null)
})

test('service import is source-pinned, fill-only, replayable and preserves editorial values and dates', async () => {
  const snapshot = JSON.parse(readFileSync('migration/directory/service-fields.json', 'utf8'))
  assert.equal(Object.keys(snapshot.records).length, 208)
  const record = JSON.parse(readFileSync('src/content/authorities/isles-of-scilly.json', 'utf8'))
  const source = snapshot.records[record.local_authority_code]
  const subset = { ...snapshot, records: { [record.local_authority_code]: source } }
  const original = { ...record, adult_fine: null, child_fine: 0.99 }
  const plan = planServiceFields([{ file: 'record.json', record: original }], subset)
  assert.equal(plan.records[0].record.adult_fine, source.fields.adult_fine)
  assert.equal(plan.records[0].record.child_fine, 0.99)
  assert.equal(plan.records[0].record.updated_on, original.updated_on)
  assert.equal(plan.conflicts.length, 1)
  assert.equal(planServiceFields(plan.records, subset).changes.length, 0)
  assert.equal((await importServiceFields()).changes.length, 0)
  assert.throws(
    () => serviceFieldSnapshot([{ fields: { Code: 'bad' } }], 'source', 'sha'),
    /authority code/
  )
  const converted = convertAuthority({
    slug: record.slug,
    gss: record.local_authority_code,
    name: record.local_authority
  })
  assert.equal(converted.data['Adult fine'], source.fields.adult_fine)
  for (const slug of ['guernsey', 'jersey', 'isle-of-man']) {
    const current = JSON.parse(readFileSync(`src/content/authorities/${slug}.json`, 'utf8'))
    assert.equal(current.adult_fine, null)
    assert.equal(current.child_fine, null)
  }
})
