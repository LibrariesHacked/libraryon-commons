import { facilitySelections, serializeFacilities } from './directoryControlValues.mjs'

/**
 * Register the facility multi-select while preserving legacy options in existing records.
 * @param {object} cms - Decap widget registry.
 * @param {{h: Function, createClass: Function}} react - Standalone bundle React helpers.
 * @returns {void}
 */
export function registerFacilityWidget(cms, { h, createClass }) {
  const Select = cms.getWidget('select').control
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
}
