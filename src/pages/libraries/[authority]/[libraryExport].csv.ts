import type { APIRoute } from 'astro'
import { authorities, libraries } from '../../../lib/directory.mjs'
import { libraryCsvResponse } from '../../../lib/directory-export.mjs'

/** @returns Complete/strict CSV routes scoped to each authority's current and closed buildings. */
export function getStaticPaths() {
  return authorities.flatMap((authority) =>
    [false, true].map((validOnly) => ({
      params: {
        authority: authority.slug,
        libraryExport: validOnly ? 'libraries.validated' : 'libraries'
      },
      props: {
        entries: libraries.filter((library) => library.authority === authority.slug),
        validOnly,
        slug: authority.slug
      }
    }))
  )
}

/** @param context - Prerendered authority records and export mode. @returns An authority-named CSV attachment without CMS metadata. */
export const GET: APIRoute = ({ props }) =>
  libraryCsvResponse(props.entries, {
    validOnly: props.validOnly,
    filename: `libraries-${props.slug}${props.validOnly ? '.validated' : ''}.csv`
  })
