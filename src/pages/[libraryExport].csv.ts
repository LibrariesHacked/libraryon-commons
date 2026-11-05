import type { APIRoute } from 'astro'
import { libraries } from '../lib/directory.mjs'
import { libraryCsvResponse } from '../lib/directory-export.mjs'

/** @returns Static routes for the complete library CSV and the strictly validated subset. */
export function getStaticPaths() {
  return [false, true].map((validOnly) => ({
    params: { libraryExport: validOnly ? 'libraries.validated' : 'libraries' },
    props: { validOnly }
  }))
}

/** @param context - Static route props selecting complete or strict output. @returns The schema-ordered CSV attachment. */
export const GET: APIRoute = ({ props }) =>
  libraryCsvResponse(libraries, {
    validOnly: props.validOnly,
    filename: props.validOnly ? 'libraries.validated.csv' : 'libraries.csv'
  })
