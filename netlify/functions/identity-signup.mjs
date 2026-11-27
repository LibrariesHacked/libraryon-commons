/**
 * @fileoverview Netlify Identity signup hook: assigns GSS codes and editorial roles upon user registration.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  parseDomainPermissions,
  resolveUserPermissions
} from '../../src/lib/cms/cmsAuthHelpers.mjs'

/**
 * Load and parse domain permissions from repository CSV.
 * @returns {Array<object>} Parsed permission rules.
 */
function loadPermissions() {
  const candidates = [
    new URL('../../src/data/auth/domain-permissions.csv', import.meta.url),
    path.resolve(process.cwd(), 'src/data/auth/domain-permissions.csv')
  ]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return parseDomainPermissions(fs.readFileSync(candidate, 'utf8'))
      }
    } catch {}
  }
  return []
}

/**
 * Handle Netlify Identity user signup.
 * Stamps app_metadata with editorial roles and assigned local authority GSS codes.
 *
 * @param {{ body?: string }} event - Netlify function invocation event.
 * @returns {Promise<{ statusCode: number, body: string }>} Signed response with updated app_metadata.
 */
export async function handler(event) {
  try {
    const payload = JSON.parse(event.body || '{}')
    const user = payload.user || {}
    const permissions = loadPermissions()
    const resolved = resolveUserPermissions(user, permissions)

    const roles = resolved.role ? [resolved.role] : []

    return {
      statusCode: 200,
      body: JSON.stringify({
        app_metadata: {
          roles,
          gss_codes: resolved.gssCodes
        }
      })
    }
  } catch (error) {
    console.error('identity-signup error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to assign user permissions.' })
    }
  }
}
