import EmblaCarousel from 'embla-carousel'
import Autoplay from 'embla-carousel-autoplay'

;(() => {
  const root = document.querySelector('[data-hero-carousel]')
  if (!root) return
  const viewport = root.querySelector('[data-carousel-viewport]')
  const slides = [...root.querySelectorAll('[data-carousel-slide]')]
  const dots = [...root.querySelectorAll('[data-carousel-dot]')]
  const prevBtn = root.querySelector('[data-carousel-prev]')
  const nextBtn = root.querySelector('[data-carousel-next]')
  const toggleBtn = root.querySelector('[data-carousel-toggle]')
  const pauseIcon = root.querySelector('[data-icon-pause]')
  const playIcon = root.querySelector('[data-icon-play]')
  if (!viewport || slides.length < 2) return

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let userPaused = reducedMotion.matches

  const autoplay = Autoplay({
    delay: 4500,
    playOnInit: !reducedMotion.matches,
    stopOnInteraction: true,
    stopOnMouseEnter: true,
    stopOnFocusIn: true
  })
  viewport.dataset.carouselInitialized = 'true'
  const carousel = EmblaCarousel(
    viewport,
    {
      align: 'start',
      containScroll: 'trimSnaps',
      loop: false,
      duration: reducedMotion.matches ? 0 : 25
    },
    [autoplay]
  )

  const syncToggleUI = () => {
    if (!toggleBtn) return
    toggleBtn.setAttribute('aria-pressed', String(userPaused))
    const label = userPaused ? 'Play carousel' : 'Pause carousel'
    toggleBtn.setAttribute('aria-label', label)
    toggleBtn.setAttribute('title', label)
    if (pauseIcon) pauseIcon.hidden = userPaused
    if (playIcon) playIcon.hidden = !userPaused
  }

  const syncDots = () => {
    const selected = carousel.selectedScrollSnap()
    dots.forEach((dot, index) => dot.setAttribute('aria-current', String(index === selected)))
  }

  carousel.on('select', syncDots).on('reInit', syncDots)
  carousel.on('pointerDown', () => {
    userPaused = true
    syncToggleUI()
  })

  prevBtn?.addEventListener('click', () => {
    carousel.scrollPrev(reducedMotion.matches)
    userPaused = true
    autoplay.stop()
    syncToggleUI()
  })

  nextBtn?.addEventListener('click', () => {
    carousel.scrollNext(reducedMotion.matches)
    userPaused = true
    autoplay.stop()
    syncToggleUI()
  })

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      carousel.scrollTo(index, reducedMotion.matches)
      userPaused = true
      autoplay.stop()
      syncToggleUI()
    })
  })

  toggleBtn?.addEventListener('click', () => {
    userPaused = !userPaused
    syncToggleUI()
    if (userPaused) autoplay.stop()
    else autoplay.play()
  })

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) {
        autoplay.stop()
      } else if (!userPaused && !reducedMotion.matches) {
        autoplay.play()
      }
    },
    { threshold: 0.1 }
  )
  observer.observe(root)

  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      userPaused = true
      autoplay.stop()
    }
    carousel.reInit({ duration: reducedMotion.matches ? 0 : 25 })
    syncToggleUI()
  })

  syncDots()
  syncToggleUI()
})()
