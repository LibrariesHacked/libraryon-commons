/**
 * @fileoverview Client-side interactive media controllers for carousels, lightboxes, accordions, and timelines.
 */

import EmblaCarousel from 'embla-carousel'

let lightbox

/**
 * Retrieve or create the singleton DOM lightbox viewer dialog.
 * @returns {{dialog: HTMLDialogElement, image: HTMLImageElement, caption: HTMLElement}} Lightbox elements.
 */
function getLightbox() {
  if (lightbox) return lightbox

  const dialog = document.createElement('dialog')
  dialog.className = 'collection-lightbox'
  dialog.setAttribute('aria-label', 'Image viewer')
  const close = document.createElement('button')
  close.className = 'collection-lightbox-close'
  close.type = 'button'
  close.textContent = 'Close image'
  const figure = document.createElement('figure')
  const image = document.createElement('img')
  const caption = document.createElement('figcaption')
  figure.append(image, caption)
  dialog.append(close, figure)
  document.body.append(dialog)
  close.addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  lightbox = { dialog, image, caption }
  return lightbox
}

/**
 * Open a figure's image inside the shared lightbox modal viewer.
 * @param {HTMLButtonElement} button - Trigger button inside or associated with a figure.
 * @returns {void}
 */
function openImage(button) {
  const figure = button.closest('figure')
  const image = figure?.querySelector('img')
  if (!image) return
  const viewer = getLightbox()
  viewer.image.src = image.currentSrc || image.src
  viewer.image.alt = image.alt
  viewer.caption.textContent = figure.querySelector('figcaption')?.innerText.trim() || image.alt
  viewer.dialog.showModal()
}

/**
 * Initialize an Embla Carousel instance on a collection carousel DOM element.
 * @param {HTMLElement} root - Carousel container element with data-collection-carousel.
 * @returns {void}
 */
function setupCarousel(root) {
  const viewport = root.querySelector('[data-carousel-viewport]')
  const track = root.querySelector('.collection-carousel-track')
  const previous = root.querySelector('[data-carousel-previous]')
  const next = root.querySelector('[data-carousel-next]')
  const status = root.querySelector('[data-carousel-status]')
  const hotspotVisibility = root.querySelector('[data-hotspot-visibility-toggle]')
  if (!viewport || !track || !previous || !next || !status) return

  const slides = [...track.children]
  if (!slides.length) return
  const carousel = EmblaCarousel(viewport, {
    align: 'start',
    containScroll: 'trimSnaps',
    loop: false
  })
  const update = () => {
    const selected = carousel.selectedScrollSnap()
    viewport.style.height = `${slides[selected].getBoundingClientRect().height}px`
    status.textContent = `${selected + 1} / ${slides.length}`
    previous.disabled = !carousel.canScrollPrev()
    next.disabled = !carousel.canScrollNext()
    slides.forEach((slide, index) => {
      slide.inert = index !== selected
      slide.setAttribute('aria-hidden', String(index !== selected))
    })
  }
  const resizeObserver = new ResizeObserver(update)
  slides.forEach((slide) => resizeObserver.observe(slide))
  previous.addEventListener('click', () => carousel.scrollPrev())
  next.addEventListener('click', () => carousel.scrollNext())
  if (hotspotVisibility) {
    const updateHotspotVisibility = () => {
      root.classList.toggle('collection-carousel--hotspots-hidden', !hotspotVisibility.checked)
    }
    hotspotVisibility.addEventListener('change', updateHotspotVisibility)
    updateHotspotVisibility()
  }
  carousel.on('select', update)
  carousel.on('reInit', update)
  update()
}

/**
 * Initialize event listeners for carousels, accordions, book recommendations, timelines, and zoom buttons.
 * @returns {void}
 */
export function initializeCollectionMedia() {
  if (document.documentElement.dataset.collectionMediaReady) return
  document.documentElement.dataset.collectionMediaReady = 'true'

  document.addEventListener(
    'toggle',
    (event) => {
      const opened = event.target
      if (!(opened instanceof HTMLDetailsElement) || !opened.open) {
        return
      }
      if (opened.matches('.collection-accordion-item')) {
        const accordion = opened.closest('.collection-accordion, .collection-accordion-items')
        accordion?.querySelectorAll('details.collection-accordion-item[open]').forEach((item) => {
          if (item !== opened) item.open = false
        })
      }
      if (opened.matches('.collection-recommendation-item')) {
        const list = opened.closest('.collection-recommendations-list')
        list?.querySelectorAll('details.collection-recommendation-item[open]').forEach((item) => {
          if (item !== opened) item.open = false
        })
      }
    },
    true
  )

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return

    const summary = target.closest('.collection-recommendation-select')
    if (summary) {
      const details = summary.closest('details.collection-recommendation-item')
      if (details?.open) {
        event.preventDefault()
        return
      }
    }

    const zoom = target.closest('[data-collection-zoom]')
    if (zoom) {
      openImage(zoom)
      return
    }

    const timelineYear = target.closest('[data-timeline-select]')
    if (timelineYear) {
      const timeline = timelineYear.closest('[data-collection-timeline]')
      if (!timeline) return
      const selected = timelineYear.dataset.timelineSelect
      timeline.querySelectorAll('[data-timeline-select]').forEach((button) => {
        button.setAttribute('aria-expanded', String(button.dataset.timelineSelect === selected))
      })
      timeline
        .querySelectorAll('[data-timeline-detail], [data-timeline-image]')
        .forEach((panel) => {
          panel.hidden =
            panel.dataset.timelineDetail !== selected && panel.dataset.timelineImage !== selected
        })
      return
    }

    const marker = target.closest('[data-hotspot-select]')
    if (!marker) return
    const slide = marker.closest('.collection-hotspot-slide')
    if (!slide) return
    const selected = marker.dataset.hotspotSelect
    slide.querySelectorAll('[data-hotspot-select]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.hotspotSelect === selected))
    })
    slide.querySelectorAll('[data-hotspot-note]').forEach((note) => {
      note.hidden = note.dataset.hotspotNote !== selected
    })
  })

  document.querySelectorAll('[data-collection-carousel]').forEach(setupCarousel)
}
