/**
 * @fileoverview Netlify Identity login hook: keeps user GSS codes and roles synchronised with repository CSV.
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
 * Handle Netlify Identity user login.
 * Refreshes user app_metadata so domain CSV updates apply to existing accounts without re-registration.
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
    console.error('identity-login error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to refresh user permissions on login.' })
    }
  }
}
