import { libraries } from '../lib/directory.mjs'
import { libraryValidationReport } from '../lib/directory-export.mjs'
import { sitePath } from '../lib/site.mjs'

/** @returns {Response} Strict field failures for the complete CSV, including schema URL and original CSV record numbers. */
export function GET() {
  return Response.json({
    schema: sitePath('/schemas/libraries.json'),
    ...libraryValidationReport(libraries)
  })
}
