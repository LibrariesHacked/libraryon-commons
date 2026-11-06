/**
 * @fileoverview Endpoint serving the authoritative Table Schema definition for library datasets.
 */

import schema from '../../data/schemas/libraries.json' with { type: 'json' }

/**
 * Handle GET requests for the library Table Schema JSON specification.
 * @returns {Response} The unchanged supplied library Table Schema used by validation and CSV column ordering.
 */
export function GET() {
  return Response.json(schema)
}
