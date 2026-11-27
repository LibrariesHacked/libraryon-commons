/**
 * @fileoverview Native directory-control compatibility, authority scoping and full existing-data coverage.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { jsonRecordFiles } from '../src/lib/directory/recordFiles.mjs'
import { parse } from 'yaml'
import {
  facilitySelections,
  serializeFacilities,
  prepareLibraryAuthority,
  validateHoursControl,
  hourSessionRows,
  serializeHourSessions,
  validateOptionalYear,
  validateSpecialHoursControl,
  registerDirectoryControls
} from '../src/lib/cms/directoryControls.mjs'
import { validateEntrySave } from '../src/lib/cms/cmsAuthHelpers.mjs'
import { prepareDirectoryEdit } from '../src/lib/directory/schemaHelpers.mjs'
import { Library } from '../src/lib/directory/models/Library.mjs'
import {
  formatSpecialHours,
  parseSpecialHours,
  serializeSpecialHoursDraft,
  serializeSpecialHoursForSave
} from '../src/lib/directory/specialHoursHelpers.mjs'
import facilities from '../src/data/cms-facilities.json' with { type: 'json' }
import authorities from '../src/data/cms-lookups/authorities.json' with { type: 'json' }

const config = parse(readFileSync('public/admin/config.yml', 'utf8'))
const libraries = jsonRecordFiles('src/content/libraries').map((file) =>
  JSON.parse(readFileSync(`src/content/libraries/${file}`, 'utf8'))
)

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
  let validationAlert = ''
  registerDirectoryControls(
    {
      getWidget: () => ({ control: native, preview: native }),
      registerWidget: (name, control) => widgets.set(name, control)
    },
    {
      createClass: (definition) => definition,
      h: (type, props) => ({ type, props }),
      onValidationError: ({ message }) => (validationAlert = message)
    }
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
  assert.match(validationAlert, /end after/)
  widgets.get('directory-year').isValid.call({ props: { value: 10000 } })
  assert.match(validationAlert, /four-digit year/)
  let yearValue = 2026
  const yearControl = widgets.get('directory-year').render.call({
    props: { value: yearValue, onChange: (value) => (yearValue = value) }
  })
  assert.equal(yearControl.type, native)
  yearControl.props.onChange(Number.NaN)
  assert.equal(yearValue, null)
  yearControl.props.onChange('')
  assert.equal(yearValue, null)
  yearControl.props.onChange(2026)
  assert.equal(yearValue, 2026)
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
  const adminClient = readFileSync('src/scripts/cmsAdminClient.mjs', 'utf8')
  assert.match(admin, /id="cms-save-error"[^>]*role="alert"/)
  assert.match(adminClient, /showSaveError\(error\)/)
  assert.ok(
    adminClient.indexOf('registerDirectoryControls(cms,') <
      adminClient.indexOf('cms.init({ config })')
  )
  assert.ok(
    adminClient.indexOf('prepareLibraryAuthority(data.toJS()') <
      adminClient.indexOf('validateEntrySave(prepared')
  )
})

test('daily hours are edited as separate sessions without comma entry', () => {
  assert.deepEqual(hourSessionRows('09:00-12:30,13:30-17:00'), [
    { open: '09:00', close: '12:30' },
    { open: '13:30', close: '17:00' }
  ])
  assert.equal(serializeHourSessions([{ open: '09:00', close: '12:30' }]), '09:00-12:30')
  assert.equal(
    serializeHourSessions([
      { open: '09:00', close: '12:30' },
      { open: '13:30', close: '24:00' }
    ]),
    '09:00-12:30,13:30-24:00'
  )
  assert.equal(serializeHourSessions([{ open: '', close: '' }]), null)
  assert.equal(validateHoursControl('09:00-12:30,13:30-24:00').error, false)
})

test('adding a daily-hours period displays a new editable row', () => {
  const widgets = new Map()
  const h = (type, props, ...children) => ({ type, props: props || {}, children })
  registerDirectoryControls(
    {
      getWidget: () => ({ preview: () => null }),
      registerWidget: (name, control) => widgets.set(name, control)
    },
    { createClass: (definition) => definition, h }
  )
  const control = widgets.get('directory-hours')
  const instance = {
    props: {
      value: undefined,
      onChange: (value) => {
        const nextProps = { ...instance.props, value }
        control.componentWillReceiveProps.call(instance, nextProps)
        instance.props = nextProps
      }
    },
    state: {},
    setState(nextState) {
      this.state = { ...this.state, ...nextState }
    }
  }
  const findNodes = (node, type) =>
    Array.isArray(node)
      ? node.flatMap((child) => findNodes(child, type))
      : node && typeof node === 'object'
        ? [
            ...(node.type === type ? [node] : []),
            ...(node.children || []).flatMap((child) => findNodes(child, type))
          ]
        : []

  const initial = control.render.call(instance)
  findNodes(initial, 'button')[0].props.onClick()

  assert.equal(instance.props.value, null)
  const updated = control.render.call(instance)
  assert.equal(findNodes(updated, 'li').length, 1)
  assert.equal(findNodes(updated, 'input').length, 2)
})

test('special-hours add and remove buttons update editable rows', () => {
  const widgets = new Map()
  const h = (type, props, ...children) => ({ type, props: props || {}, children })
  registerDirectoryControls(
    {
      getWidget: () => ({ preview: () => null }),
      registerWidget: (name, control) => widgets.set(name, control)
    },
    { createClass: (definition) => definition, h }
  )
  const control = widgets.get('directory-special-hours')
  const instance = {
    props: {
      value: null,
      onChange: (value) => {
        instance.props = { ...instance.props, value }
      }
    }
  }
  const findNodes = (node, type) =>
    Array.isArray(node)
      ? node.flatMap((child) => findNodes(child, type))
      : node && typeof node === 'object'
        ? [
            ...(node.type === type ? [node] : []),
            ...(node.children || []).flatMap((child) => findNodes(child, type))
          ]
        : []

  findNodes(control.render.call(instance), 'button')[0].props.onClick()
  assert.equal(parseSpecialHours(instance.props.value).periods.length, 1)
  assert.equal(findNodes(control.render.call(instance), 'fieldset').length, 1)

  const remove = findNodes(control.render.call(instance), 'button').find((button) =>
    button.children.includes('Remove date')
  )
  remove.props.onClick()
  assert.equal(instance.props.value, null)
  assert.equal(findNodes(control.render.call(instance), 'fieldset').length, 0)
})

test('special hours preserve legacy notes and serialize dated periods in Google format', () => {
  const legacy = 'Closed on bank holidays'
  assert.deepEqual(parseSpecialHours(legacy), { periods: [], notes: legacy, invalid: false })
  const draft = serializeSpecialHoursDraft(
    [
      { date: '2026-12-25', isClosed: true },
      { date: '2026-12-26', isClosed: false, openTime: '10:00', closeTime: '13:00' },
      { date: '2026-12-26', isClosed: false, openTime: '14:00', closeTime: '17:00' },
      {
        date: '2026-12-27',
        endDate: '2026-12-28',
        isClosed: false,
        openTime: '22:00',
        closeTime: '02:00'
      }
    ],
    legacy
  )
  assert.equal(validateSpecialHoursControl(draft).error, false)
  const saved = serializeSpecialHoursForSave(draft)
  assert.deepEqual(JSON.parse(saved), {
    specialHourPeriods: [
      { startDate: { year: 2026, month: 12, day: 25 }, isClosed: true },
      {
        startDate: { year: 2026, month: 12, day: 26 },
        openTime: '10:00',
        closeTime: '13:00'
      },
      {
        startDate: { year: 2026, month: 12, day: 26 },
        openTime: '14:00',
        closeTime: '17:00'
      },
      {
        startDate: { year: 2026, month: 12, day: 27 },
        endDate: { year: 2026, month: 12, day: 28 },
        openTime: '22:00',
        closeTime: '02:00'
      }
    ],
    notes: legacy
  })
  assert.match(formatSpecialHours(saved), /Closed on bank holidays/)
  assert.match(formatSpecialHours(saved), /25 December 2026: Closed/)
  assert.match(formatSpecialHours(saved), /26 December 2026: 10:00–13:00, 14:00–17:00/)
  assert.match(
    formatSpecialHours(saved),
    /27 December 2026: 22:00–02:00 \(until 28 December 2026\)/
  )
  assert.equal(serializeSpecialHoursForSave(legacy), legacy)
  assert.equal(new Library({ special_hours: saved }).openingTimesNotes, formatSpecialHours(saved))
  assert.equal(
    validateSpecialHoursControl(serializeSpecialHoursDraft([{ date: '', isClosed: true }], ''))
      .error.message,
    'Choose a valid date for each special-hours period.'
  )
  const overlap = serializeSpecialHoursDraft(
    [
      { date: '2026-12-26', isClosed: false, openTime: '10:00', closeTime: '14:00' },
      { date: '2026-12-26', isClosed: false, openTime: '13:00', closeTime: '17:00' }
    ],
    ''
  )
  assert.match(validateSpecialHoursControl(overlap).error.message, /must not overlap/)
  const overnightOverlap = serializeSpecialHoursDraft(
    [
      {
        date: '2026-12-26',
        endDate: '2026-12-27',
        isClosed: false,
        openTime: '23:00',
        closeTime: '02:00'
      },
      { date: '2026-12-27', isClosed: false, openTime: '01:00', closeTime: '03:00' }
    ],
    ''
  )
  assert.match(validateSpecialHoursControl(overnightOverlap).error.message, /must not overlap/)
  const tooLong = serializeSpecialHoursDraft(
    [
      {
        date: '2026-12-26',
        endDate: '2026-12-27',
        isClosed: false,
        openTime: '00:00',
        closeTime: '00:00'
      }
    ],
    ''
  )
  assert.match(validateSpecialHoursControl(tooLong).error.message, /less than 24 hours/)
})

test('optional year validation accepts blanks and rejects invalid years', () => {
  for (const value of [null, undefined, '', Number.NaN]) {
    assert.equal(validateOptionalYear(value).error, false)
  }
  for (const value of [999, 10000, 2026.5, 'not a year']) {
    assert.match(validateOptionalYear(value).error.message, /four-digit year/)
  }
  assert.equal(validateOptionalYear(2026).error, false)
  const saved = prepareDirectoryEdit({ ...libraries[0], year_opened: '' }, 'libraries')
  assert.equal(saved.year_opened, null)
})

test('library hours use structured controls and year fields remain optional', () => {
  const library = config.collections.find(({ name }) => name === 'libraries')
  const fields = new Map(library.fields.map((field) => [field.name, field]))
  for (const field of library.fields.filter((item) =>
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)_(un)?staffed_hours$/.test(
      item.name
    )
  )) {
    assert.equal(field.widget, 'directory-hours', field.name)
  }
  assert.equal(fields.get('special_hours').widget, 'directory-special-hours')
  for (const name of ['year_opened', 'year_closed']) {
    assert.equal(fields.get(name).widget, 'directory-year')
    assert.equal(fields.get(name).required, false)
  }
  assert.match(fields.get('year_opened').hint, /optional|leave blank/i)
  assert.match(fields.get('member_wifi').hint, /registered members\.$/)
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
