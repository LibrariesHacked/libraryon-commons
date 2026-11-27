/**
 * @fileoverview Decap CMS control for editing dated special opening hours and notes.
 */

import {
  parseSpecialHours,
  serializeSpecialHoursDraft
} from '../../directory/specialHoursHelpers.mjs'
import { validateSpecialHoursControl } from './directoryControlValues.mjs'

/**
 * Register the dated special-hours editor.
 * @param {object} cms - Decap widget registry.
 * @param {{h: Function, createClass: Function, onValidationError: Function}} react - React helpers and alert callback.
 * @returns {void}
 */
export function registerSpecialHoursWidget(cms, { h, createClass, onValidationError }) {
  const StringPreview = cms.getWidget('string').preview
  cms.registerWidget(
    'directory-special-hours',
    createClass({
      /** @returns {{error: false|{message: string}}} Dated exception validation before saving. */
      isValid() {
        const result = validateSpecialHoursControl(this.props.value)
        if (result.error) onValidationError(result.error)
        return result
      },
      /** @returns {object} Dated periods with Google-style hours plus preserved legacy notes. */
      render() {
        const parsed = parseSpecialHours(this.props.value)
        const { periods, notes } = parsed
        const update = (nextPeriods, nextNotes = notes) =>
          this.props.onChange(serializeSpecialHoursDraft(nextPeriods, nextNotes))
        return h(
          'div',
          { className: 'directory-special-hours-control' },
          h(
            'p',
            { className: 'directory-control-help' },
            'Add one row per time period. Add the same date again for split hours, or mark the date closed.'
          ),
          parsed.invalid &&
            h(
              'p',
              { role: 'alert' },
              'These saved special hours could not be read. Remove and re-enter the dated periods.'
            ),
          h(
            'div',
            { className: 'directory-special-hours-rows' },
            periods.map((period, index) =>
              h(
                'fieldset',
                { className: 'directory-special-hours-row', key: `special-${index}` },
                h('legend', {}, `Special period ${index + 1}`),
                h(
                  'label',
                  { className: 'directory-control-field' },
                  h('span', {}, 'Date'),
                  h('input', {
                    type: 'date',
                    value: period.date || '',
                    'aria-label': `Date for special period ${index + 1}`,
                    onChange: (event) =>
                      update(
                        periods.map((item, rowIndex) =>
                          rowIndex === index ? { ...item, date: event.currentTarget.value } : item
                        )
                      )
                  })
                ),
                !period.isClosed &&
                  h(
                    'label',
                    { className: 'directory-control-field' },
                    h('span', {}, 'End date (if closing next day)'),
                    h('input', {
                      type: 'date',
                      value: period.endDate || '',
                      'aria-label': `End date for special period ${index + 1}`,
                      onChange: (event) =>
                        update(
                          periods.map((item, rowIndex) =>
                            rowIndex === index
                              ? {
                                  ...item,
                                  endDate: event.currentTarget.value,
                                  invalidEndDate: false
                                }
                              : item
                          )
                        )
                    })
                  ),
                h(
                  'label',
                  { className: 'directory-special-hours-closed' },
                  h('input', {
                    type: 'checkbox',
                    checked: period.isClosed === true,
                    onChange: (event) =>
                      update(
                        periods.map((item, rowIndex) =>
                          rowIndex === index
                            ? {
                                ...item,
                                isClosed: event.currentTarget.checked,
                                endDate: event.currentTarget.checked ? '' : item.endDate,
                                invalidEndDate: false,
                                openTime: event.currentTarget.checked ? '' : item.openTime,
                                closeTime: event.currentTarget.checked ? '' : item.closeTime
                              }
                            : item
                        )
                      )
                  }),
                  'Closed all day'
                ),
                !period.isClosed &&
                  h(
                    'div',
                    { className: 'directory-special-hours-times' },
                    ...[
                      ['openTime', 'Opens'],
                      ['closeTime', 'Closes']
                    ].map(([key, label]) =>
                      h(
                        'label',
                        { className: 'directory-control-field', key },
                        h('span', {}, label),
                        h('input', {
                          type: 'text',
                          inputMode: 'numeric',
                          placeholder: '09:00',
                          pattern: '(?:[01]\\d|2[0-4]):[0-5]\\d',
                          value: period[key] || '',
                          'aria-label': `${label} for special period ${index + 1}`,
                          onChange: (event) =>
                            update(
                              periods.map((item, rowIndex) =>
                                rowIndex === index
                                  ? { ...item, [key]: event.currentTarget.value }
                                  : item
                              )
                            )
                        })
                      )
                    )
                  ),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => update(periods.filter((_, rowIndex) => rowIndex !== index))
                  },
                  'Remove date'
                )
              )
            )
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: () => update([...periods, { date: '', endDate: '', isClosed: false }])
            },
            'Add special date'
          ),
          h(
            'label',
            { className: 'directory-control-field directory-special-hours-notes' },
            h('span', {}, 'Other opening-hours notes'),
            h('textarea', {
              rows: 3,
              value: notes,
              onChange: (event) => update(periods, event.currentTarget.value)
            })
          )
        )
      }
    }),
    StringPreview
  )
}
