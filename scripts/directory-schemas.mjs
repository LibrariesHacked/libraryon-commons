import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseDocument } from 'yaml'
import { format } from 'prettier'

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
    ['libraries', 'libraries', 'Library name'],
    ['authorities', 'library-services', 'Local authority']
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
    if (relation) {
      relation.search_fields = ['data.Local authority']
      relation.display_fields = ['data.Local authority']
    }
    const dataFields = schema.fields.map((field) => {
      const constraints = field.constraints || {}
      const result = {
        name: field.name,
        label: field.name,
        widget: constraints.enum
          ? 'select'
          : ['integer', 'number', 'year'].includes(field.type)
            ? 'number'
            : 'string',
        required: false,
        hint: field.description
      }
      if (constraints.enum)
        result.options =
          field.name === 'Country' ? [...constraints.enum, 'Crown Dependencies'] : constraints.enum
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
      if (field.type === 'string' && / (un)?staffed hours$/.test(field.name))
        result.hint = `${field.description}. Use 09:00-17:00 or 09:00-12:00,13:00-17:00. Leave blank when closed; saved as null.`
      return result
    })
    collection.set('fields', [
      {
        name: 'data',
        label: kind === 'libraries' ? 'Library data' : 'Library service data',
        widget: 'object',
        fields: dataFields
      },
      ...metadata,
      {
        name: 'manual_checks',
        label: 'Manual checks',
        widget: 'list',
        required: false,
        collapsed: true,
        allow_add: false,
        summary: '{{fields.kind}}: {{fields.reason}}',
        hint: 'Review evidence in the Data review worklist. Remove a check only after completing the review; the original audit is retained.',
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
        hint: 'Correct the data field; resolved exceptions disappear automatically when saved.',
        fields: [
          { name: 'field', label: 'Schema field', widget: 'string' },
          { name: 'code', label: 'Issue', widget: 'string' },
          { name: 'value', widget: 'hidden', required: false },
          { name: 'reason', label: 'Reason', widget: 'text' }
        ]
      }
    ])
    collection.set('identifier_field', `data.${title}`)
    collection.set('summary', `{{data.${title}}}`)
    collection.set('sortable_fields', [`data.${title}`, 'reviewed_on'])
  }
  writeFileSync(file, document.toString({ lineWidth: 0, flowCollectionPadding: false }))
}

/**
 * Copy authoritative Table Schemas and generate matching nullable TypeScript interfaces.
 * @param {URL} [root] - Repository root containing specifications and formatter options.
 * @returns {Promise<void>} Writes deterministic schema and type artifacts, not directory data.
 */
export async function generateSchemas(root = new URL('../', import.meta.url)) {
  const output = new URL('src/data/schemas/', root)
  mkdirSync(output, { recursive: true })
  let types = ''
  for (const [file, name] of [
    ['libraries', 'LibraryData'],
    ['library-services', 'LibraryServiceData']
  ]) {
    const schema = JSON.parse(readFileSync(new URL(`tempdata/${file}.json`, root), 'utf8'))
    writeFileSync(new URL(`${file}.json`, output), `${JSON.stringify(schema, null, 2)}\n`)
    types += `export interface ${name} {\n`
    for (const field of schema.fields) {
      const type =
        field.constraints?.enum?.map((value) => JSON.stringify(value)).join(' | ') ||
        { integer: 'number', number: 'number', year: 'number' }[field.type] ||
        'string'
      types += `  ${JSON.stringify(field.name)}: ${type} | null\n`
    }
    types += '}\n\n'
  }
  types += `export interface ValidationException {\n  field: string\n  code: string\n  value: unknown\n  reason: string\n}\n\nexport interface ManualCheck {\n  kind: string\n  reason: string\n  audit_refs: string[]\n}\n\nexport interface DirectoryRecord<Data> {\n  id?: string | number\n  slug: string\n  authority?: string\n  source_id?: string | number\n  source_url?: string\n  updated_on?: string | null\n  reviewed_on?: string | null\n  imported_on?: string\n  data: Data\n  validation_exceptions: ValidationException[]\n  manual_checks?: ManualCheck[]\n}\n\nexport type LibraryRecord = DirectoryRecord<LibraryData>\nexport type LibraryServiceRecord = DirectoryRecord<LibraryServiceData>\n`
  const options = JSON.parse(readFileSync(new URL('.prettierrc.json', root), 'utf8'))
  writeFileSync(
    new URL('src/lib/directory-types.ts', root),
    await format(types, { ...options, filepath: 'src/lib/directory-types.ts' })
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generateSchemas()
  updateDirectoryCms()
}
