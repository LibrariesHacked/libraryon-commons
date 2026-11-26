/**
 * @fileoverview Schema generator and Decap CMS config updater for directory collections.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseDocument, Scalar } from 'yaml'
import facilities from '../src/data/cms-facilities.json' with { type: 'json' }

/**
 * Regenerate only directory CMS forms from the supplied schemas, preserving other collections.
 * Metadata/review controls stay outside canonical data; unknown required values remain editable.
 * @param {URL} [root] - Repository root or an isolated generation fixture.
 * @returns {void} Updates the tracked Decap configuration without touching records.
 */
export function updateDirectoryCms(root = new URL('../', import.meta.url)) {
  const file = new URL('public/admin/config.yml', root)
  const document = parseDocument(readFileSync(file, 'utf8'))
  const collections = document.get('collections')
  for (const [kind, schemaFile, title] of [
    ['libraries', 'libraries', 'library_name'],
    ['authorities', 'library-services', 'local_authority']
  ]) {
    const index = collections.items.findIndex((item) => item.get('name') === kind)
    const collection = collections.items[index]
    const schema = JSON.parse(
      readFileSync(new URL(`src/data/schemas/${schemaFile}.json`, root), 'utf8')
    )
    const fields = collection.get('fields').toJSON()
    const metadata = fields.filter((field) =>
      [
        'slug',
        'id',
        'source_id',
        'source_url',
        'imported_on',
        'updated_on',
        'reviewed_on',
        'authority'
      ].includes(field.name)
    )
    const relation = metadata.find((field) => field.name === 'authority')
    if (relation?.collection === 'authorities') {
      relation.search_fields = ['local_authority']
      relation.display_fields = ['local_authority']
    }
    if (relation && kind === 'libraries') {
      relation.label = 'Library authority (name and GSS code)'
      relation.hint =
        'Sets the authority name and code together. New authorities appear after the site updates; reload to see them.'
    }
    const dataFields = schema.fields.map((field) => {
      const constraints = field.constraints || {}
      const fieldName = field.name
      const fieldLabel = field.title || field.name
      const multilineFields = new Set([
        'about',
        'notes',
        'special_hours',
        'facilities_and_services',
        'online_reference_subscriptions',
        'co_located_with'
      ])
      const libraryTypeLabels = {
        LAL: 'Local authority run — staffed (LAL)',
        'LAL-': 'Local authority run — unstaffed (LAL-)',
        CL: 'Commissioned library (CL)',
        CRL: 'Community-run library (CRL)',
        ICL: 'Independent community library (ICL)'
      }
      const result = {
        name: fieldName,
        label: fieldLabel,
        widget: constraints.enum
          ? 'select'
          : ['integer', 'number', 'year'].includes(field.type)
            ? 'number'
            : field.type === 'date'
              ? 'date'
              : multilineFields.has(fieldName)
                ? 'text'
                : 'string',
        required: false,
        hint: field.description
      }
      if (field.type === 'date') {
        result.widget = 'datetime'
        result.format = 'YYYY-MM-DD'
        result.date_format = 'YYYY-MM-DD'
        result.time_format = false
      }
      if (kind === 'libraries' && field.type === 'year') {
        result.widget = 'directory-year'
        result.hint = 'Optional. Leave blank if the year is unknown.'
      }
      if (constraints.enum) {
        const options =
          fieldName === 'Country' || field.name === 'country'
            ? Array.from(new Set([...constraints.enum, 'Crown Dependencies']))
            : fieldName === 'type_of_library'
              ? constraints.enum.map((value) => ({
                  label: libraryTypeLabels[value] || value,
                  value
                }))
              : constraints.enum
        const hasOtherStringOption = options.some(
          (option) => typeof option === 'string' && option !== 'Yes' && option !== 'No'
        )
        result.options = options.map((option) => {
          if (!hasOtherStringOption || (option !== 'Yes' && option !== 'No')) return option
          const scalar = new Scalar(option)
          scalar.type = Scalar.QUOTE_DOUBLE
          return scalar
        })
      }
      if (result.widget === 'number') {
        result.value_type = field.type === 'number' ? 'float' : 'int'
        if (constraints.minimum !== undefined) result.min = constraints.minimum
        if (constraints.maximum !== undefined) result.max = constraints.maximum
        if (field.type === 'year') {
          result.min = 1000
          result.max = 9999
        }
      }
      if (constraints.pattern) result.pattern = [constraints.pattern, field.description]
      if (
        field.type === 'string' &&
        (/ (un)?staffed hours$/.test(field.title || field.name) ||
          /_(un)?staffed_hours$/.test(field.name))
      ) {
        result.widget = 'directory-hours'
        result.hint =
          fieldName === 'monday_staffed_hours'
            ? 'Use 09:00-17:00 or 09:00-12:30,13:30-17:00 for split sessions. Midnight closing is 24:00. Blank means closed or not recorded.'
            : '24-hour times, as above. Blank means closed or not recorded.'
      }
      if (fieldName === 'special_hours') {
        result.widget = 'directory-special-hours'
        result.hint =
          'Add dated periods, mark full-day closures or set a next-day end date; existing notes are preserved.'
      }
      if (kind === 'libraries' && ['local_authority', 'local_authority_code'].includes(fieldName)) {
        result.widget = 'hidden'
      }
      if (fieldName === 'facilities_and_services') {
        result.widget = 'directory-facilities'
        result.multiple = true
        result.options = facilities
        result.hint = 'Choose all that apply.'
      }
      if (['adult_fine', 'child_fine'].includes(fieldName)) {
        result.label = `${fieldLabel} (GBP)`
        result.hint = 'Pounds per fine interval. Use 0 for fine-free, or leave blank if unknown.'
      }
      if (fieldName === 'co_located_with') {
        result.hint =
          'Separate building partners with semicolons, e.g. Community centre; Post office.'
      }
      if (field.format === 'uri')
        result.hint = 'Full web address, starting with https:// or http://.'
      if (field.format === 'email') result.hint = 'Email address, e.g. library@example.gov.uk.'
      if (fieldName === 'phone_number') result.hint = 'Include the area code and any extension.'
      const shortHints = {
        local_authority_code: 'Nine-character GSS code, e.g. E08000003.',
        operating_organisation: 'Organisation running the service, if different from the council.',
        consortium: 'Shared partnership, e.g. LibrariesWest or The Libraries Consortium.',
        online_reference_subscriptions:
          'Separate resources with semicolons, e.g. Findmypast; BFI Replay.',
        automated_access_system: 'Self-service access system, e.g. Open+.',
        special_hours:
          'Add dated periods, mark full-day closures or set a next-day end date; existing notes are preserved.',
        member_wifi: 'Whether Wi-Fi is available to registered members.',
        type_of_library: 'How the library is run.',
        temporary_closed_until: 'Expected reopening date.',
        library_management_system_supplier: 'Supplier of the library management software.',
        library_management_system: 'Library management software name.',
        online_catalogue_system: 'Catalogue or discovery software name.',
        ebook_supplier: 'Ebook provider, e.g. Bolinda or OverDrive.',
        audiobook_supplier: 'Audiobook provider, e.g. Bolinda or OverDrive.',
        emagazine_supplier: 'Digital magazine provider.',
        enewspaper_supplier: 'Digital newspaper provider.'
      }
      if (shortHints[fieldName]) result.hint = shortHints[fieldName]
      if (fieldName === 'monday_staffed_hours') {
        result.hint =
          'Add one period per opening interval, using 24-hour times such as 09:00-17:00. Midnight closing is 24:00. Blank means closed or not recorded.'
      } else if (
        /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)_(un)?staffed_hours$/.test(
          fieldName
        )
      ) {
        result.hint = '24-hour times as above. Add another period for split hours.'
      }
      return result
    })
    collection.set('fields', [
      ...(kind === 'libraries' && relation ? [relation] : []),
      ...dataFields,
      ...metadata.filter((field) => kind !== 'libraries' || field.name !== 'authority'),
      {
        name: 'manual_checks',
        label: 'Manual checks',
        widget: 'list',
        required: false,
        collapsed: true,
        allow_add: false,
        summary: '{{fields.kind}}: {{fields.reason}}',
        hint: 'See Data review for details. Remove a check when the review is complete.',
        fields: [
          { name: 'kind', label: 'Check type', widget: 'string' },
          { name: 'reason', label: 'Reason', widget: 'text' },
          {
            name: 'audit_refs',
            label: 'Audit references',
            widget: 'list',
            field: { name: 'reference', widget: 'string' }
          }
        ]
      },
      {
        name: 'validation_exceptions',
        label: 'Validation exceptions',
        widget: 'list',
        required: false,
        collapsed: true,
        allow_add: false,
        summary: '{{fields.field}}: {{fields.reason}}',
        hint: 'Correct the field above. Resolved issues clear when you save.',
        fields: [
          { name: 'field', label: 'Schema field', widget: 'string' },
          { name: 'code', label: 'Issue', widget: 'string' },
          { name: 'value', widget: 'hidden', required: false },
          { name: 'reason', label: 'Reason', widget: 'text' }
        ]
      }
    ])
    collection.set('delete', false)
    collection.set('identifier_field', title)
    collection.delete('summary')
    collection.set('sortable_fields', [title, 'reviewed_on'])
  }
  writeFileSync(file, document.toString({ lineWidth: 0, flowCollectionPadding: false }))
}

/**
 * Copy authoritative Table Schemas to src/data/schemas/.
 * @param {URL} [root] - Repository root containing specifications.
 * @returns {Promise<void>} Writes deterministic schema artifacts, not directory data.
 */
export async function generateSchemas(root = new URL('../', import.meta.url)) {
  const output = new URL('src/data/schemas/', root)
  mkdirSync(output, { recursive: true })
  for (const [file] of [
    ['libraries', 'LibraryData'],
    ['library-services', 'LibraryServiceData']
  ]) {
    const schema = JSON.parse(readFileSync(new URL(`tempdata/${file}.json`, root), 'utf8'))
    writeFileSync(new URL(`${file}.json`, output), `${JSON.stringify(schema, null, 2)}\n`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateDirectoryCms()
}
