/**
 * @fileoverview Read-only archive selection alongside Decap's native community upload controls.
 */

/**
 * @typedef {object} ArchiveAsset
 * @property {string} name - Original archive filename.
 * @property {string} url - Encoded public URL, never a community repository path.
 * @property {boolean} image - Whether the file can be selected by an image widget.
 */

/**
 * Filter the build-time manifest without querying the Git backend.
 * @param {ArchiveAsset[]} manifest - Preserved archive assets.
 * @param {'image'|'file'} kind - Widget type; file widgets accept all assets.
 * @param {string} [query=''] - Case-insensitive filename search.
 * @returns {ArchiveAsset[]} Matching assets in manifest order.
 */
export function archiveOptions(manifest, kind, query = '') {
  const needle = query.trim().toLowerCase()
  return manifest.filter(
    (item) => (kind !== 'image' || item.image) && item.name.toLowerCase().includes(needle)
  )
}

/**
 * Keep archive previews on their public URLs while delegating other assets to Decap.
 * @param {object} props - Native widget properties, including its getAsset callback.
 * @returns {object} Copied properties with archive-aware asset resolution.
 */
export function archiveWidgetProps(props) {
  return {
    ...props,
    /** @param {string} value - Stored asset URL. @param {object} field - Decap field configuration. @returns {object|string} Native asset proxy or archive URL. */
    getAsset: (value, field) =>
      typeof value === 'string' && value.startsWith('/uploads/archive/')
        ? value
        : props.getAsset(value, field)
  }
}

/**
 * Register archive selectors alongside, rather than in place of, native upload controls.
 * @param {object} cms - Decap registry exposing getWidget and registerWidget.
 * @param {ArchiveAsset[]} manifest - Build-time archive assets.
 * @param {object} react - React helpers exposed by the standalone Decap bundle.
 * @param {Function} react.h - React element factory.
 * @param {Function} react.createClass - React component class factory.
 * @returns {void}
 */
export function registerArchiveWidgets(cms, manifest, { h, createClass }) {
  for (const kind of ['image', 'file']) {
    const NativeControl = cms.getWidget(kind).control
    const NativePreview = cms.getWidget(kind).preview
    const Control = createClass({
      /** @returns {{query: string}} Initial filename filter for this widget instance. */
      getInitialState() {
        return { query: '' }
      },
      /** @returns {object} Native media control and separate read-only archive selector. */
      render() {
        const { forID, onChange, value } = this.props
        const options = archiveOptions(manifest, kind, this.state.query)
        return h(
          'div',
          {},
          h(NativeControl, archiveWidgetProps(this.props)),
          h(
            'details',
            {},
            h('summary', {}, 'Choose a preserved archive file'),
            h('p', {}, 'Read-only archive. New uploads still go into the community Media Library.'),
            h('label', { htmlFor: `${forID}-archive-search` }, 'Filter archive filenames'),
            h('input', {
              id: `${forID}-archive-search`,
              type: 'search',
              value: this.state.query,
              onChange: (event) => this.setState({ query: event.target.value })
            }),
            h('label', { htmlFor: `${forID}-archive-file` }, 'Archive file'),
            h(
              'select',
              {
                id: `${forID}-archive-file`,
                value: manifest.some((item) => item.url === value) ? value : '',
                onChange: (event) => {
                  const selected = event.target.value
                  if (!selected) return
                  const existing = Array.isArray(value) ? value : value?.toArray?.()
                  onChange(existing ? [...new Set([...existing, selected])] : selected)
                }
              },
              h('option', { value: '' }, 'Select an archive file'),
              ...options.map((item) => h('option', { key: item.url, value: item.url }, item.name))
            ),
            !options.length && h('p', { role: 'status' }, 'No matching archive files.'),
            typeof value === 'string' &&
              value.startsWith('/uploads/archive/') &&
              !manifest.some((item) => item.url === value) &&
              h(
                'p',
                { role: 'status' },
                'This archive URL is not in the current build. It has been kept unchanged.'
              )
          )
        )
      }
    })
    cms.registerWidget(
      `archive-${kind}`,
      Control,
      NativePreview ? (props) => h(NativePreview, archiveWidgetProps(props)) : undefined
    )
  }
}

/**
 * Copy config/editor definitions, replacing only image and file widget names.
 * Preserve functions and non-plain objects such as Markdown matching expressions.
 * @param {*} value - Config, editor definition or nested value.
 * @returns {*} Prepared copy, or the original scalar/non-plain value.
 */
export function withArchiveWidgets(value) {
  if (Array.isArray(value)) return value.map(withArchiveWidgets)
  if (!value || typeof value !== 'object') return value
  if (Object.getPrototypeOf(value) !== Object.prototype) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === 'widget' && ['image', 'file'].includes(item)
        ? `archive-${item}`
        : withArchiveWidgets(item)
    ])
  )
}
