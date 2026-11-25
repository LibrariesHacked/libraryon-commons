/**
 * @fileoverview Small compatibility helpers around native Decap select and string controls.
 * Preserve the directory's flat string schema without backend overrides or extra lookup requests.
 */

import { openingHours } from '../directory/openingHoursHelpers.mjs'

/**
 * Read existing semicolon-separated facilities without changing the stored value.
 * @param {string|null|undefined} value - Canonical stored facilities.
 * @returns {string[]} Display selections, in their original order.
 * @throws {Error} When the stored field is not a string.
 */
export function facilitySelections(value) {
  if (value == null || value === '') return []
  if (typeof value !== 'string') throw new Error('Facilities must be a semicolon-separated string.')
  return value
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * Serialize a native select result back into the existing directory string format.
 * @param {string[]|object|null} value - Array or Decap immutable list; null means cleared.
 * @returns {string|null} Semicolon-separated selections, or null when none are selected.
 * @throws {Error} When a selection cannot be represented safely.
 */
export function serializeFacilities(value) {
  const items = value == null ? [] : Array.isArray(value) ? value : value.toArray?.()
  if (
    !Array.isArray(items) ||
    items.some((item) => typeof item !== 'string' || !item.trim() || item.includes(';'))
  ) {
    throw new Error('Invalid facility selection.')
  }
  return items.length ? items.join('; ') : null
}

/**
 * Resolve a library's selected authority before schema and permission validation.
 * Blank associations preserve unresolved legacy name/code evidence rather than guessing.
 * @param {object} record - Plain library entry data.
 * @param {Array<{id: string, name: string, code: string}>} authorities - Generated authority index.
 * @returns {object} Copied data with consistent authority name and code.
 * @throws {Error} When the selection is absent from the deployed lookup or its identity is invalid.
 */
export function prepareLibraryAuthority(record, authorities) {
  if (!record.authority) return { ...record }
  const authority = authorities.find(({ id }) => id === record.authority)
  if (!authority || !authority.name || !/^[ELMNSW][0-9]{8}$/.test(authority.code)) {
    throw new Error(
      'The selected authority is not in this CMS deployment. Wait for lookup regeneration and reload the CMS.'
    )
  }
  return { ...record, local_authority: authority.name, local_authority_code: authority.code }
}

/**
 * Validate native opening-hours text without normalizing it or changing closed/unknown data.
 * @param {string|null|undefined} value - Existing daily sessions.
 * @returns {{error: false|{message: string}}} Decap validation result.
 */
export function validateHoursControl(value) {
  try {
    if (openingHours(value) === (value || null)) return { error: false }
  } catch {
    // The native form displays a specific validation message; no save fallback is used.
  }
  return {
    error: {
      message:
        'Use 09:00-17:00 or comma-separated sessions. Times must be in order, not overlap, and end after they start. Midnight closing is 24:00.'
    }
  }
}

/**
 * Register schema-compatible controls delegating all input UI to Decap's native widgets.
 * @param {object} cms - Decap widget registry.
 * @param {{h: Function, createClass: Function}} react - Standalone bundle React helpers.
 * @returns {void}
 */
export function registerDirectoryControls(cms, { h, createClass }) {
  const Select = cms.getWidget('select').control
  const StringControl = cms.getWidget('string').control
  const StringPreview = cms.getWidget('string').preview
  cms.registerWidget(
    'directory-facilities',
    createClass({
      /** @returns {object} Native multi-select, retaining any legacy choices not in the fixed list. */
      render() {
        const selected = facilitySelections(this.props.value)
        const options = this.props.field.get('options')
        const legacy = selected.filter((item) => !options.includes(item))
        const field = this.props.field.set('options', options.concat(legacy))
        return h(Select, {
          ...this.props,
          field,
          value: selected,
          onChange: (value) => this.props.onChange(serializeFacilities(value))
        })
      }
    }),
    StringPreview
  )
  cms.registerWidget(
    'directory-hours',
    createClass({
      /** @returns {{error: false|{message: string}}} Session validation used by Decap before saving. */
      isValid() {
        return validateHoursControl(this.props.value)
      },
      /** @returns {object} Unmodified native text input for split-session daily hours. */
      render() {
        return h(StringControl, this.props)
      }
    }),
    StringPreview
  )
}
