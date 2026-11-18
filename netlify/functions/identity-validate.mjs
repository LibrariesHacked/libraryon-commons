/**
 * @fileoverview Netlify Identity validate hook: checks registrant's email domain against authorised repository list.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  parseDomainPermissions,
  resolveUserPermissions,
  extractDomainFromEmail
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
 * Handle Netlify Identity registration validation.
 * Rejects registrations from unauthorised email domains with HTTP 400.
 *
 * @param {{ body?: string }} event - Netlify function invocation event.
 * @returns {Promise<{ statusCode: number, body?: string }>} Validation response.
 */
export async function handler(event) {
  try {
    const payload = JSON.parse(event.body || '{}')
    const email = payload.user?.email || ''
    const domain = extractDomainFromEmail(email)

    if (!domain) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'A valid email address is required for registration.' })
      }
    }

    const permissions = loadPermissions()
    const resolved = resolveUserPermissions(email, permissions)

    if (!resolved.allowed) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: `Registration restricted: email domain @${domain} is not pre-authorised. Please contact an administrator.`
        })
      }
    }

    return { statusCode: 200 }
  } catch (error) {
    console.error('identity-validate error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'An internal error occurred while validating registration.' })
    }
  }
}
