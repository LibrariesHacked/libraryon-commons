/** @fileoverview Shared form expansion into native, service-sized Decap collections. */
const prefix = 'libraries--'

export function libraryCollectionName(authority) {
  const folder = authority || 'unassigned'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folder)) {
    throw new Error(`Invalid library authority folder: "${folder}".`)
  }
  return `${prefix}${folder}`
}

export function directoryCollectionKind(name) {
  return name.startsWith(prefix) ? 'libraries' : name
}

export function libraryRecordFile(file, record) {
  const folder = libraryCollectionName(record.authority).slice(prefix.length)
  if (typeof record.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug)) {
    throw new Error(`Invalid library slug in ${file}: "${record.slug}".`)
  }
  return `${folder}/${record.slug}.json`
}

export function expandLibraryCollections(config, authorities) {
  const template = config.collections.find(({ name }) => name === 'libraries')
  if (!template) throw new Error('Missing Libraries form template.')
  const ids = authorities.map(({ id }) => id)
  if (new Set(ids).size !== ids.length || ids.includes('unassigned')) {
    throw new Error('Duplicate or reserved authority identifier in CMS lookups.')
  }
  const libraries = [...authorities, { id: '', name: 'Unassigned' }].map(({ id, name }) => {
    const collectionName = libraryCollectionName(id)
    return {
      ...template,
      name: collectionName,
      label: `Libraries — ${name}`,
      folder: `${template.folder}/${id || 'unassigned'}`,
      slug: '{{fields.slug}}',
      fields: template.fields.map((field) =>
        field.name === 'authority'
          ? { name: 'authority', widget: 'hidden', default: id, required: false }
          : field
      )
    }
  })
  return {
    ...config,
    collections: config.collections.flatMap((collection) =>
      collection.name === 'libraries' ? libraries : [collection]
    )
  }
}

export function validateLibraryCollection(record, collection) {
  if (collection.startsWith(prefix) && collection !== libraryCollectionName(record.authority)) {
    throw new Error(
      'This library belongs to a different service folder. Ask a maintainer to move it before changing its authority.'
    )
  }
}
