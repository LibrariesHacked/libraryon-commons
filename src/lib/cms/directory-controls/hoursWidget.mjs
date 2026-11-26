import {
  hourSessionRows,
  serializeHourSessions,
  validateHoursControl
} from './directoryControlValues.mjs'

/**
 * Register the daily opening-hours editor.
 * @param {object} cms - Decap widget registry.
 * @param {{h: Function, createClass: Function, onValidationError: Function}} react - React helpers and alert callback.
 * @returns {void}
 */
export function registerHoursWidget(cms, { h, createClass, onValidationError }) {
  const StringPreview = cms.getWidget('string').preview
  cms.registerWidget(
    'directory-hours',
    createClass({
      /** @returns {{error: false|{message: string}}} Session validation used by Decap before saving. */
      isValid() {
        const result = validateHoursControl(this.props.value)
        if (result.error) onValidationError(result.error)
        return result
      },
      /** @returns {object} Separate opening and closing inputs for each daily session. */
      render() {
        const rows = hourSessionRows(this.props.value)
        const update = (nextRows) => this.props.onChange(serializeHourSessions(nextRows))
        return h(
          'div',
          { className: 'directory-hours-control' },
          h(
            'div',
            { className: 'directory-hours-rows' },
            rows.map((row, index) =>
              h(
                'fieldset',
                { className: 'directory-hours-row', key: `session-${index}` },
                h('legend', {}, `Period ${index + 1}`),
                ...['open', 'close'].map((key) => {
                  const label = key === 'open' ? 'Opens' : 'Closes'
                  return h(
                    'label',
                    { className: 'directory-control-field', key },
                    h('span', {}, label),
                    h('input', {
                      type: 'text',
                      inputMode: 'numeric',
                      placeholder: '09:00',
                      pattern: '(?:[01]\\d|2[0-4]):[0-5]\\d',
                      value: row[key],
                      'aria-label': `${label} for period ${index + 1}`,
                      onChange: (event) => {
                        const nextRows = rows.map((item, rowIndex) =>
                          rowIndex === index ? { ...item, [key]: event.currentTarget.value } : item
                        )
                        update(nextRows)
                      }
                    })
                  )
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => update(rows.filter((_, rowIndex) => rowIndex !== index))
                  },
                  'Remove period'
                )
              )
            )
          ),
          h(
            'button',
            { type: 'button', onClick: () => update([...rows, { open: '', close: '' }]) },
            'Add time period'
          )
        )
      }
    }),
    StringPreview
  )
}
