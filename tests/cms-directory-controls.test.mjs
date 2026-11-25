/**
 * @fileoverview Native directory-control compatibility, authority scoping and full existing-data coverage.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { parse } from 'yaml'
import {
  facilitySelections,
  serializeFacilities,
  prepareLibraryAuthority,
  validateHoursControl,
  registerDirectoryControls
} from '../src/lib/cms/directoryControls.mjs'
import { validateEntrySave } from '../src/lib/cms/cmsAuthHelpers.mjs'
import { prepareDirectoryEdit } from '../src/lib/directory/schemaHelpers.mjs'
import { Library } from '../src/lib/directory/models/Library.mjs'
import facilities from '../src/data/cms-facilities.json' with { type: 'json' }
import authorities from '../src/data/cms-lookups/authorities.json' with { type: 'json' }

const config = parse(readFileSync('public/admin/config.yml', 'utf8'))
const libraries = readdirSync('src/content/libraries')
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(`src/content/libraries/${file}`, 'utf8')))

test('all existing library facilities, identities and daily sessions survive the controls', () => {
  assert.equal(new Set(facilities).size, 27)
  for (const record of libraries) {
    const selected = facilitySelections(record.facilities_and_services)
    assert.ok(
      selected.every((item) => facilities.includes(item)),
      record.slug
    )
    assert.deepEqual(facilitySelections(serializeFacilities(selected)), selected)
    assert.deepEqual(
      new Library({ ...record, facilities_and_services: serializeFacilities(selected) }).services,
      new Library(record).services
    )
    const prepared = prepareLibraryAuthority(record, authorities.items)
    assert.equal(prepared.local_authority, record.local_authority)
    assert.equal(prepared.local_authority_code, record.local_authority_code)
    for (const [name, value] of Object.entries(record)) {
      if (/_(un)?staffed_hours$/.test(name)) {
        assert.equal(validateHoursControl(value).error, false, `${record.slug}: ${name}`)
      }
    }
  }
})

test('authority selection fills name/code before existing schema and scope validation', () => {
  const source = libraries.find((record) => record.authority === 'aberdeen-city')
  const input = { ...source, authority: 'aberdeenshire' }
  const prepared = prepareDirectoryEdit(
    prepareLibraryAuthority(input, authorities.items),
    'libraries'
  )
  const authority = authorities.items.find(({ id }) => id === 'aberdeenshire')
  assert.equal(prepared.local_authority, authority.name)
  assert.equal(prepared.local_authority_code, authority.code)
  assert.equal(source.authority, 'aberdeen-city')
  assert.throws(
    () =>
      validateEntrySave(prepared, 'libraries', {
        allowed: true,
        isGeneralEditor: false,
        gssCodes: [source.local_authority_code]
      }),
    /Permission denied/
  )
  assert.doesNotThrow(() =>
    validateEntrySave(prepared, 'libraries', {
      allowed: true,
      isGeneralEditor: false,
      gssCodes: [authority.code]
    })
  )
  const unknown = { ...source, authority: '', local_authority: 'Unresolved' }
  assert.deepEqual(prepareLibraryAuthority(unknown, authorities.items), unknown)
  assert.throws(
    () => prepareLibraryAuthority({ ...source, authority: 'missing' }, authorities.items),
    /reload the CMS/
  )
})

test('facility conversion supports native immutable lists, clearing and preserves legacy choices', () => {
  assert.equal(serializeFacilities({ toArray: () => ['Books', 'Printing'] }), 'Books; Printing')
  assert.equal(serializeFacilities(null), null)
  assert.equal(serializeFacilities([]), null)
  assert.equal(serializeFacilities(['Books', 'Books']), 'Books; Books')
  assert.throws(() => serializeFacilities(['Books; Printing']), /Invalid facility/)
  assert.throws(() => facilitySelections([]), /Facilities must/)
  const widgets = new Map()
  const native = () => null
  registerDirectoryControls(
    {
      getWidget: () => ({ control: native, preview: native }),
      registerWidget: (name, control) => widgets.set(name, control)
    },
    { createClass: (definition) => definition, h: (type, props) => ({ type, props }) }
  )
  let saved
  const field = { get: () => ['Books'], set: (name, options) => ({ options }) }
  const control = widgets.get('directory-facilities').render.call({
    props: {
      value: 'Books; Historic service',
      field,
      onChange: (value) => {
        saved = value
      }
    }
  })
  assert.equal(control.type, native)
  assert.deepEqual(control.props.value, ['Books', 'Historic service'])
  assert.deepEqual(control.props.field.options, ['Books', 'Historic service'])
  control.props.onChange(['Books', 'Historic service', 'Printing'])
  assert.equal(saved, 'Books; Historic service; Printing')
  assert.equal(
    widgets
      .get('directory-hours')
      .isValid.call({ props: { value: '12:00-11:00' } })
      .error.message.includes('end after'),
    true
  )
})

test('opening-hours validation handles midnight, split sessions and unknowns without guessing', () => {
  for (const value of [null, undefined, '', '00:00-24:00', '09:00-12:30,13:30-17:00']) {
    assert.equal(validateHoursControl(value).error, false)
  }
  for (const value of [
    '24:00-24:00',
    '09:00-24:01',
    '17:00-09:00',
    '09:00-12:00,11:00-13:00',
    '9am-5pm',
    'Closed',
    '09:00 - 17:00'
  ]) {
    assert.equal(typeof validateHoursControl(value).error.message, 'string', value)
  }
})

test('directory forms use one authority picker, fixed facilities and native date-only controls', () => {
  const library = config.collections.find(({ name }) => name === 'libraries')
  assert.equal(library.fields[0].name, 'authority')
  assert.match(library.fields[0].label, /name and GSS code/)
  for (const name of ['local_authority', 'local_authority_code']) {
    assert.equal(library.fields.find((field) => field.name === name).widget, 'hidden')
  }
  const choices = library.fields.find(({ name }) => name === 'facilities_and_services')
  assert.equal(choices.widget, 'directory-facilities')
  assert.equal(choices.multiple, true)
  assert.deepEqual(choices.options, facilities)
  const date = library.fields.find(({ name }) => name === 'temporary_closed_until')
  assert.equal(date.widget, 'datetime')
  assert.equal(date.time_format, false)
  assert.equal(date.format, 'YYYY-MM-DD')
  for (const collection of ['libraries', 'authorities']) {
    const schema = JSON.parse(
      readFileSync(
        `src/data/schemas/${collection === 'libraries' ? 'libraries' : 'library-services'}.json`
      )
    )
    const fields = config.collections.find(({ name }) => name === collection).fields
    for (const field of schema.fields.filter((field) => field.constraints.enum)) {
      assert.equal(fields.find(({ name }) => name === field.name).widget, 'select', field.name)
    }
  }
  const admin = readFileSync('src/pages/admin/index.astro', 'utf8')
  assert.ok(admin.indexOf('registerDirectoryControls(cms,') < admin.indexOf('cms.init({ config })'))
  assert.ok(
    admin.indexOf('prepareLibraryAuthority(data.toJS()') <
      admin.indexOf('validateEntrySave(prepared')
  )
})

test('field hints stay concise and opening-hours examples appear only once', () => {
  for (const collection of config.collections) {
    for (const field of collection.fields || []) {
      assert.ok(!field.hint || field.hint.length <= 140, `${collection.name}.${field.name}`)
      assert.doesNotMatch(field.hint || '', /do not invent|rather than guessing|src\/data/)
    }
  }
  const hours = config.collections
    .find(({ name }) => name === 'libraries')
    .fields.filter((field) => field.widget === 'directory-hours')
  assert.equal(hours.filter((field) => field.hint.includes('09:00-17:00')).length, 1)
  assert.ok(hours.slice(1).every((field) => field.hint.length <= 70))
})
