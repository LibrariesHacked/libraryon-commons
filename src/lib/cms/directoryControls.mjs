/**
 * @fileoverview Public registration entry point for the directory CMS controls.
 */

import { registerFacilityWidget } from './directory-controls/facilityWidget.mjs'
import { registerHoursWidget } from './directory-controls/hoursWidget.mjs'
import { registerSpecialHoursWidget } from './directory-controls/specialHoursWidget.mjs'
import { registerYearWidget } from './directory-controls/yearWidget.mjs'

export {
  facilitySelections,
  hourSessionRows,
  serializeFacilities,
  serializeHourSessions,
  validateHoursControl,
  validateOptionalYear,
  validateSpecialHoursControl
} from './directory-controls/directoryControlValues.mjs'
export { prepareLibraryAuthority } from './directory-controls/libraryAuthority.mjs'

/**
 * Register the schema-compatible directory widgets with Decap CMS.
 * @param {object} cms - Decap widget registry.
 * @param {{h: Function, createClass: Function, onValidationError?: Function}} react - React helpers and alert callback.
 * @returns {void}
 */
export function registerDirectoryControls(cms, { h, createClass, onValidationError = () => {} }) {
  const react = { h, createClass, onValidationError }
  registerFacilityWidget(cms, react)
  registerHoursWidget(cms, react)
  registerSpecialHoursWidget(cms, react)
  registerYearWidget(cms, react)
}
