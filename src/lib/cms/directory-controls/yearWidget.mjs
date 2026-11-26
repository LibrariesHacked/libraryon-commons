import { validateOptionalYear } from './directoryControlValues.mjs'

/**
 * Register the optional year number editor.
 * @param {object} cms - Decap widget registry.
 * @param {{h: Function, createClass: Function, onValidationError: Function}} react - React helpers and alert callback.
 * @returns {void}
 */
export function registerYearWidget(cms, { h, createClass, onValidationError }) {
  const NumberWidget = cms.getWidget('number')
  cms.registerWidget(
    'directory-year',
    createClass({
      /** @returns {{error: false|{message: string}}} Optional year validation. */
      isValid() {
        const result = validateOptionalYear(this.props.value)
        if (result.error) onValidationError(result.error)
        return result
      },
      /** @returns {object} Native number input with an explicitly optional blank value. */
      render() {
        return h(NumberWidget.control, {
          ...this.props,
          value: this.props.value ?? '',
          onChange: (value) =>
            this.props.onChange(
              value == null || value === '' || (typeof value === 'number' && Number.isNaN(value))
                ? null
                : value
            )
        })
      }
    }),
    NumberWidget.preview
  )
}
