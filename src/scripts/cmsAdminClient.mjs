import { parse as parseYaml } from 'yaml'
import { prepareDirectoryEdit } from '../lib/directory/schemaHelpers.mjs'
import { registerEditorComponents } from '../lib/cms/cmsHelpers.mjs'
import { registerArchiveWidgets, withArchiveWidgets } from '../lib/cms/archiveMedia.mjs'
import {
  registerDirectoryControls,
  prepareLibraryAuthority
} from '../lib/cms/directoryControls.mjs'
import { serializeSpecialHoursForSave } from '../lib/directory/specialHoursHelpers.mjs'
import authorityLookups from '../data/cms-lookups/authorities.json'
import {
  directoryCollectionKind,
  expandLibraryCollections
} from '../lib/cms/libraryCollections.mjs'
import {
  parseDomainPermissions,
  resolveUserPermissions,
  validateEntrySave,
  filterCollectionsForPermissions
} from '../lib/cms/cmsAuthHelpers.mjs'
import { sitePath } from '../lib/site/siteHelpers.mjs'
import domainPermissionsCsv from '../data/auth/domain-permissions.csv?raw'
import cmsConfigRaw from '../../public/admin/config.yml?raw'
import previewStyles from '../styles/global.css?inline'

const domainPermissions = parseDomainPermissions(domainPermissionsCsv)
const saveError = document.getElementById('cms-save-error')
const saveErrorMessage = document.getElementById('cms-save-error-message')
const clearSaveError = () => {
  if (saveError) saveError.hidden = true
  if (saveErrorMessage) saveErrorMessage.textContent = ''
}
const showSaveError = (error) => {
  if (!saveError || !saveErrorMessage) return
  const message = error instanceof Error ? error.message : String(error)
  const messages = new Set(saveErrorMessage.textContent.split('\n').filter(Boolean))
  messages.add(message)
  saveErrorMessage.textContent = [...messages].join('\n')
  saveError.hidden = false
}
document.getElementById('cms-save-error-dismiss')?.addEventListener('click', clearSaveError)
document.addEventListener('input', clearSaveError, true)
document.addEventListener('change', clearSaveError, true)

/**
 * Surface initialization failures without replacing Decap's backend error handling.
 * @param {Error} error - CMS bundle or archive manifest failure.
 * @returns {void}
 */
const reportError = (error) => {
  console.error('Decap CMS initialization failed:', error)
  const alert = document.getElementById('cms-load-error')
  if (alert) {
    alert.textContent = 'The CMS could not initialize. Reload to retry. ' + error.message
    alert.hidden = false
  }
}

/**
 * Resolve the signed-in editor's scope, retaining the existing local-development profile.
 * @returns {ReturnType<typeof resolveUserPermissions>} Effective editor permissions.
 */
const getCurrentPermissions = () => {
  const user = Reflect.get(window, 'netlifyIdentity')?.currentUser?.()
  if (!user) {
    return {
      allowed: true,
      email: 'local@dev',
      domain: 'dev',
      role: 'general-editor',
      gssCodes: ['*'],
      isGeneralEditor: true,
      notes: 'Local development editor'
    }
  }
  return resolveUserPermissions(user, domainPermissions)
}

/**
 * Synchronize the role badge and collection-link visibility.
 * @param {ReturnType<typeof resolveUserPermissions>} permissions - Current editor scope.
 * @returns {void}
 */
const syncUserScopeUI = (permissions) => {
  document.body.classList.toggle(
    'is-service-editor',
    !permissions.isGeneralEditor && permissions.role === 'service-editor'
  )
  const badge = document.getElementById('cms-user-badge')
  if (badge && permissions.email && permissions.email !== 'local@dev') {
    const scope = permissions.isGeneralEditor
      ? 'General Editor'
      : `Service Editor (${permissions.gssCodes.join(', ') || 'unassigned'})`
    badge.textContent = `${permissions.email} • ${scope}`
    badge.style.display = 'inline-block'
  }
}

const stampedFields = {
  pages: ['updated_on'],
  faqs: ['updated_on'],
  resources: ['updated_on'],
  sessions: ['updated_on'],
  contributors: ['updated_on'],
  organisations: ['updated_on'],
  authorities: ['updated_on', 'reviewed_on'],
  libraries: ['updated_on', 'reviewed_on']
}

/**
 * Register supported extensions and initialize the stock backend from embedded config.
 * @returns {Promise<void>} Resolves after initialization has been requested.
 * @throws {Error} When Decap or the archive manifest cannot be loaded.
 */
const initialize = async () => {
  await Reflect.get(window, 'CMS_IDENTITY_READY')
  const cms = Reflect.get(window, 'CMS')
  if (!cms) throw new Error('Decap CMS failed to load.')
  const response = await fetch(sitePath('/admin/archive-media.json'))
  if (!response.ok) throw new Error(`Archive manifest failed to load (${response.status}).`)
  const manifest = await response.json()
  registerArchiveWidgets(cms, manifest, {
    h: Reflect.get(window, 'h'),
    createClass: Reflect.get(window, 'createClass')
  })
  registerDirectoryControls(cms, {
    h: Reflect.get(window, 'h'),
    createClass: Reflect.get(window, 'createClass'),
    onValidationError: showSaveError
  })
  const enLocale = cms.getLocale('en')
  cms.registerLocale('en', {
    ...enLocale,
    editor: {
      ...enLocale.editor,
      editorToolbar: {
        ...enLocale.editor.editorToolbar,
        changesSaved: 'No unsaved changes'
      }
    }
  })
  registerEditorComponents(cms, withArchiveWidgets)
  const initialPermissions = getCurrentPermissions()
  syncUserScopeUI(initialPermissions)
  const identity = Reflect.get(window, 'netlifyIdentity')
  identity?.on('login', () => syncUserScopeUI(getCurrentPermissions()))
  identity?.on('logout', () => syncUserScopeUI(getCurrentPermissions()))
  cms.registerEventListener({
    name: 'preSave',
    /**
     * Validate the editor scope and directory fields, then stamp actual edit dates.
     * @param {{entry: object}} context - Decap immutable entry.
     * @returns {object} Prepared immutable entry data.
     * @throws {Error} When authorization or directory validation fails.
     */
    handler: ({ entry }) => {
      clearSaveError()
      try {
        const permissions = getCurrentPermissions()
        const collection = entry.get('collection')
        const kind = directoryCollectionKind(collection)
        let data = entry.get('data')
        if (kind === 'libraries' || kind === 'authorities') {
          const input =
            kind === 'libraries'
              ? prepareLibraryAuthority(data.toJS(), authorityLookups.items)
              : data.toJS()
          if (kind === 'libraries' && 'special_hours' in input) {
            input.special_hours = serializeSpecialHoursForSave(input.special_hours)
          }
          const prepared = prepareDirectoryEdit(input, kind)
          validateEntrySave(prepared, collection, permissions)
          for (const [field, value] of Object.entries(prepared)) data = data.set(field, value)
          if (data.has('data')) data = data.delete('data')
        } else {
          validateEntrySave(data.toJS(), collection, permissions)
        }
        const today = new Date().toLocaleDateString('en-CA')
        return (stampedFields[kind] || []).reduce((data, field) => data.set(field, today), data)
      } catch (error) {
        console.error('Decap CMS preSave handler failed:', error)
        showSaveError(error)
        throw error
      }
    }
  })
  cms.registerPreviewStyle(previewStyles, { raw: true })
  const config = withArchiveWidgets(
    expandLibraryCollections(parseYaml(cmsConfigRaw), authorityLookups.items)
  )
  config.load_config_file = false
  config.collections = filterCollectionsForPermissions(
    config.collections,
    initialPermissions,
    authorityLookups.items
  )
  cms.init({ config })
}

initialize().catch(reportError)
