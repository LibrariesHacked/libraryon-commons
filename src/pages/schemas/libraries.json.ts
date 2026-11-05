import schema from '../../data/schemas/libraries.json' with { type: 'json' }

/** @returns {Response} The unchanged supplied library Table Schema used by validation and CSV column ordering. */
export function GET() {
  return Response.json(schema)
}
