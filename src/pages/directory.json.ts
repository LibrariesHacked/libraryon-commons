import { searchRecords } from '../lib/directory.mjs';

/** Publish only fields needed by browser search, never the full source snapshot. */
export function GET() {
  return new Response(JSON.stringify(searchRecords), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
