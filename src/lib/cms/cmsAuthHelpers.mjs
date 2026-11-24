/**
 * @fileoverview Domain authorization and permission resolution for Decap CMS editors and Netlify Identity.
 */

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
 * Resolve effective permissions and GSS scopes for a user based on their email or Netlify Identity record.
 * Combines explicit Netlify Identity metadata with repository domain permissions.
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

  const appMetadata = isObject ? userOrEmail.app_metadata || {} : {}
  const explicitRoles = Array.isArray(appMetadata.roles) ? appMetadata.roles : []
  const explicitGssCodes = Array.isArray(appMetadata.gss_codes) ? appMetadata.gss_codes : []

  // Match domain in repository rules (exact match or subdomain)
  const matchedRules = domain
    ? permissionsList.filter((rule) =>
        rule.domains.some((d) => domain === d || domain.endsWith(`.${d}`))
      )
    : []

  const hasGeneralEditorRule = matchedRules.some((rule) => rule.role === 'general-editor')
  const ruleGssCodes = matchedRules.flatMap((rule) => rule.gssCodes)

  // Resolve role: explicit metadata takes precedence, then domain rule match
  let role = null
  if (explicitRoles.includes('general-editor') || explicitRoles.includes('admin')) {
    role = 'general-editor'
  } else if (explicitRoles.includes('service-editor')) {
    role = 'service-editor'
  } else if (hasGeneralEditorRule) {
    role = 'general-editor'
  } else if (matchedRules.length > 0) {
    role = 'service-editor'
  }

  // Aggregate GSS codes from explicit claims and matched rules
  const gssSet = new Set([
    ...explicitGssCodes.map((code) => String(code).toUpperCase()),
    ...ruleGssCodes
  ])
  const gssCodes = Array.from(gssSet)

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
 * Throws an Error with a user-facing explanation when access is denied.
 *
 * @param {object} entryData - Decap CMS entry data object (e.g. prepared JS object).
 * @param {string} collection - Target Decap CMS collection name.
 * @param {object} userPermissions - Resolved user permissions from resolveUserPermissions.
 * @throws {Error} When the save violates editorial or authority boundaries.
 * @returns {boolean} True if the save is permitted.
 */
export function validateEntrySave(entryData, collection, userPermissions) {
  if (!userPermissions || !userPermissions.allowed) {
    throw new Error(
      'Permission denied: Your account is not authorised to save changes in this CMS.'
    )
  }

  if (userPermissions.isGeneralEditor) {
    return true
  }

  // Service editors are strictly confined to directory collections
  if (collection !== 'libraries' && collection !== 'authorities') {
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
 * @returns {Array<object>} Permitted collections for this user session.
 */
export function filterCollectionsForPermissions(collections, userPermissions) {
  if (!Array.isArray(collections)) return []
  if (!userPermissions || userPermissions.isGeneralEditor) {
    return collections
  }

  if (userPermissions.role === 'service-editor') {
    return collections.filter((col) => col.name === 'libraries' || col.name === 'authorities')
  }

  return []
}
