/**
 * @fileoverview Domain authorization and permission resolution for Decap CMS editors and Netlify Identity.
 */
import {
  directoryCollectionKind,
  libraryCollectionName,
  validateLibraryCollection
} from './libraryCollections.mjs'

/**
 * Split a single CSV line into cell values, respecting double quotes and commas.
 * @param {string} line - Raw CSV line.
 * @returns {string[]} Array of trimmed cell values.
 */
function parseCsvLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values
}

/**
 * Parse domain-to-GSS permission mapping records from CSV text.
 * Expects columns: domain, gss_codes, role, notes.
 *
 * @param {string} csvText - Raw CSV content from repository data.
 * @returns {Array<{
 *   domains: string[],
 *   gssCodes: string[],
 *   role: 'general-editor'|'service-editor',
 *   notes: string
 * }>} Parsed permission rules.
 */
export function parseDomainPermissions(csvText) {
  if (!csvText || typeof csvText !== 'string') return []

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  if (lines.length < 2) return []

  const header = parseCsvLine(lines[0]).map((col) => col.toLowerCase())
  const domainIndex = header.indexOf('domain')
  const gssIndex = header.indexOf('gss_codes')
  const roleIndex = header.indexOf('role')
  const notesIndex = header.indexOf('notes')

  if (domainIndex === -1) return []

  const rules = []

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const rawDomains = cells[domainIndex] || ''
    const rawGss = gssIndex !== -1 ? cells[gssIndex] || '' : ''
    const rawRole = roleIndex !== -1 ? cells[roleIndex] || '' : 'service-editor'
    const notes = notesIndex !== -1 ? cells[notesIndex] || '' : ''

    const domains = rawDomains
      .split(/[;,]/)
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean)

    if (domains.length === 0) continue

    const gssCodes = rawGss
      .split(/[;,]/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean)

    const normalizedRole =
      rawRole.trim().toLowerCase() === 'general-editor' || rawRole.trim().toLowerCase() === 'admin'
        ? 'general-editor'
        : 'service-editor'

    rules.push({
      domains,
      gssCodes,
      role: normalizedRole,
      notes
    })
  }

  return rules
}

/**
 * Extract normalized lowercase domain from an email address.
 * @param {string} email - Raw user email address.
 * @returns {string|null} Lowercase domain part, or null if invalid.
 */
export function extractDomainFromEmail(email) {
  if (!email || typeof email !== 'string') return null
  const parts = email.trim().toLowerCase().split('@')
  if (parts.length !== 2 || !parts[1]) return null
  return parts[1]
}

/**
 * Resolve effective permissions and GSS scopes for a user from repository domain permissions.
 * Netlify Identity metadata is a cached assignment; the CSV remains authoritative.
 *
 * @param {object|string} userOrEmail - Netlify Identity user object or plain email string.
 * @param {Array<object>} permissionsList - Parsed domain permission records.
 * @returns {{
 *   allowed: boolean,
 *   email: string,
 *   domain: string|null,
 *   role: 'general-editor'|'service-editor'|null,
 *   gssCodes: string[],
 *   isGeneralEditor: boolean,
 *   notes: string
 * }} Resolved user authorization profile.
 */
export function resolveUserPermissions(userOrEmail, permissionsList = []) {
  const isObject = typeof userOrEmail === 'object' && userOrEmail !== null
  const email = (isObject ? userOrEmail.email : userOrEmail) || ''
  const domain = extractDomainFromEmail(email)

  // Match domain in repository rules (exact match or subdomain)
  const matchedRules = domain
    ? permissionsList.filter((rule) =>
        rule.domains.some((d) => domain === d || domain.endsWith(`.${d}`))
      )
    : []

  const hasGeneralEditorRule = matchedRules.some((rule) => rule.role === 'general-editor')
  const ruleGssCodes = matchedRules.flatMap((rule) => rule.gssCodes)

  // Resolve role exclusively from current domain rules.
  let role = null
  if (hasGeneralEditorRule) {
    role = 'general-editor'
  } else if (matchedRules.length > 0) {
    role = 'service-editor'
  }

  const gssCodes = Array.from(new Set(ruleGssCodes.map((code) => String(code).toUpperCase())))

  const isGeneralEditor = role === 'general-editor' || gssCodes.includes('*')
  const allowed = Boolean(role) || isGeneralEditor || gssCodes.length > 0
  const notes = matchedRules
    .map((rule) => rule.notes)
    .filter(Boolean)
    .join('; ')

  return {
    allowed,
    email,
    domain,
    role: role || (allowed ? 'service-editor' : null),
    gssCodes,
    isGeneralEditor,
    notes
  }
}

/**
 * Determine whether a target local authority GSS code is within the user's allowed scopes.
 *
 * @param {string[]} allowedGssCodes - List of GSS codes the user is permitted to edit.
 * @param {string} targetGssCode - Target GSS code of the record being edited.
 * @returns {boolean} True if the code is permitted or user has wildcard access.
 */
export function isGssAllowed(allowedGssCodes = [], targetGssCode = '') {
  if (!targetGssCode) return false
  if (allowedGssCodes.includes('*')) return true
  return allowedGssCodes.includes(targetGssCode.trim().toUpperCase())
}

/**
 * Validate that a proposed CMS entry save complies with the user's assigned role and GSS permissions.
 * Generated lookup collections cannot be saved by any editor.
 * Throws an Error with a user-facing explanation when access is denied.
 *
 * @param {object} entryData - Decap CMS entry data object (e.g. prepared JS object).
 * @param {string} collection - Target Decap CMS collection name.
 * @param {object} userPermissions - Resolved user permissions from resolveUserPermissions.
 * @throws {Error} When the save violates editorial or authority boundaries.
 * @returns {boolean} True if the save is permitted.
 */
export function validateEntrySave(entryData, collection, userPermissions) {
  validateLibraryCollection(entryData, collection)
  if (collection === 'resource_lookups' || collection === 'authority_lookups') {
    throw new Error(
      'Permission denied: CMS lookups are generated automatically. Edit the original resource or authority instead.'
    )
  }
  if (!userPermissions || !userPermissions.allowed) {
    throw new Error(
      'Permission denied: Your account is not authorised to save changes in this CMS.'
    )
  }

  if (userPermissions.isGeneralEditor) {
    return true
  }
  if (collection === libraryCollectionName('')) {
    throw new Error('Permission denied: Only general editors can edit unassigned libraries.')
  }

  // Service editors are strictly confined to directory collections
  if (directoryCollectionKind(collection) !== 'libraries' && collection !== 'authorities') {
    throw new Error(
      `Permission denied: Service editors are only permitted to edit library directory records, not "${collection}".`
    )
  }

  // Extract authority GSS code from directory entry structure
  const rawGss =
    entryData?.local_authority_code ??
    (typeof entryData?.get === 'function' ? entryData.get('local_authority_code') : null) ??
    null

  const targetGss = rawGss ? String(rawGss).trim().toUpperCase() : null

  if (!targetGss || !isGssAllowed(userPermissions.gssCodes, targetGss)) {
    const allowedDisplay = userPermissions.gssCodes.length
      ? userPermissions.gssCodes.join(', ')
      : 'none'
    throw new Error(
      `Permission denied: Your account is restricted to authority GSS code(s) [${allowedDisplay}]. You cannot save changes for authority "${targetGss || 'unassigned'}".`
    )
  }

  return true
}

/**
 * Filter CMS collections based on user permissions.
 * Service editors only see library directory collections; general editors see all.
 *
 * @param {Array<object>} collections - Full Decap CMS collection configurations.
 * @param {object} userPermissions - Resolved user permissions.
 * @param {Array<object>} [authorities=[]] - Authority records used to scope service-editor collections.
 * @returns {Array<object>} Permitted collections for this user session.
 */
export function filterCollectionsForPermissions(collections, userPermissions, authorities = []) {
  if (!Array.isArray(collections)) return []
  if (userPermissions?.allowed && userPermissions.isGeneralEditor) {
    return collections
  }

  if (userPermissions?.allowed && userPermissions.role === 'service-editor') {
    const permitted = authorities.filter(({ code }) => isGssAllowed(userPermissions.gssCodes, code))
    const names = new Set(permitted.map(({ id }) => libraryCollectionName(id)))
    return collections.flatMap((col) => {
      if (names.has(col.name) || ['authority_lookups', 'resource_lookups'].includes(col.name)) {
        return [col]
      }
      if (col.name !== 'authorities' || !permitted.length) return []
      const { folder, fields, slug, create, filter, ...metadata } = col
      return [
        {
          ...metadata,
          files: permitted.map(({ id, name }) => ({
            name: id,
            label: name,
            file: `${folder}/${id}.json`,
            fields
          }))
        }
      ]
    })
  }

  return []
}
