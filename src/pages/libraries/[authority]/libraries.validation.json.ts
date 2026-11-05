import type { APIRoute } from 'astro'
import { authorities, libraries } from '../../../lib/directory.mjs'
import { libraryValidationReport } from '../../../lib/directory-export.mjs'
import { sitePath } from '../../../lib/site.mjs'

/** @returns Validation-report routes containing only the selected authority's library records. */
export function getStaticPaths() {
  return authorities.map((authority) => ({
    params: { authority: authority.slug },
    props: { entries: libraries.filter((library) => library.authority === authority.slug) }
  }))
}

/** @param context - Prerendered authority-scoped records. @returns Unwaived schema failures with a downloadable schema reference. */
export const GET: APIRoute = ({ props }) =>
  Response.json({
    schema: sitePath('/schemas/libraries.json'),
    ...libraryValidationReport(props.entries)
  })
