/** @fileoverview Explicit, reviewed library slug corrections for migration replay. */
import audit from '../../../migration/directory/library-slug-changes.json' with { type: 'json' }

export function applyLibrarySlugCorrection(record) {
  const correction = audit.changes.find(({ id }) => id === record.id)
  if (!correction || record.slug === correction.after) return record
  if (record.slug !== correction.before || record.authority !== correction.authority) {
    throw new Error(
      `Slug correction no longer matches library ${record.id}; review the audit entry.`
    )
  }

  return { ...record, slug: correction.after }
}

export const librarySlugRedirects = Object.fromEntries(
  audit.changes.map(({ authority, before, after }) => [
    `/libraries/${authority}/${before}/`,
    `/libraries/${authority}/${after}/`
  ])
)
