/**
 * @fileoverview Browser runtime handler for interactive social share buttons and clipboard copying.
 */

export function initShareButtons() {
  const shareContainers = document.querySelectorAll('[data-share-container]')

  for (const container of shareContainers) {
    if (container.dataset.initialized) continue
    container.dataset.initialized = 'true'

    const url = container.dataset.shareUrl || window.location.href
    const title = container.dataset.shareTitle || document.title
    const text = container.dataset.shareDescription || ''

    // Native Web Share API progressive enhancement
    const nativeShareBtn = container.querySelector('[data-share-action="native"]')
    if (nativeShareBtn) {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        nativeShareBtn.hidden = false
        nativeShareBtn.addEventListener('click', async () => {
          try {
            await navigator.share({ title, text, url })
          } catch (err) {
            if (err?.name !== 'AbortError') {
              console.debug('Web share aborted or failed:', err)
            }
          }
        })
      } else {
        nativeShareBtn.remove()
      }
    }

    // Clipboard copy action
    const copyBtn = container.querySelector('[data-share-action="copy"]')
    if (copyBtn) {
      const defaultLabel = copyBtn.querySelector('.share-btn-label')
      const successFeedback = copyBtn.querySelector('.share-feedback')
      const copyIcon = copyBtn.querySelector('.share-icon-copy')
      const checkIcon = copyBtn.querySelector('.share-icon-check')

      copyBtn.addEventListener('click', async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(url)
          } else {
            const input = document.createElement('input')
            input.value = url
            document.body.appendChild(input)
            input.select()
            document.execCommand('copy')
            document.body.removeChild(input)
          }

          copyBtn.classList.add('is-copied')
          if (defaultLabel) defaultLabel.hidden = true
          if (successFeedback) successFeedback.hidden = false
          if (copyIcon) copyIcon.hidden = true
          if (checkIcon) checkIcon.hidden = false

          setTimeout(() => {
            copyBtn.classList.remove('is-copied')
            if (defaultLabel) defaultLabel.hidden = false
            if (successFeedback) successFeedback.hidden = true
            if (copyIcon) copyIcon.hidden = false
            if (checkIcon) checkIcon.hidden = true
          }, 2500)
        } catch (err) {
          console.error('Failed to copy link:', err)
        }
      })
    }
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShareButtons)
  } else {
    initShareButtons()
  }
}
