/**
 * @fileoverview Browser runtime client for rendering interactive news story cards and
 * handling time-period and theme filtering on entity news lists.
 */

import {
  authorityPageUrl,
  categoryColor,
  categoryLabel,
  changeTypeLabel,
  filterStoriesByDate,
  formatNewsDate,
  joinBaseUrl,
  organisationPageUrl
} from '../lib/content/newsFormatHelpers.mjs'

const ARROW_UP_RIGHT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>'

const ARROW_UP_RIGHT_LG_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>'

const PRESETS_BY_STEP = {
  1: { preset: '1y', label: 'Past year' },
  2: { preset: '2y', label: 'Past 2 years' },
  3: { preset: '3y', label: 'Past 3 years' },
  4: { preset: '5y', label: 'Past 5 years' },
  5: { preset: 'all', label: 'All time' }
}

/**
 * Render a news card `<li>` DOM element matching `NewsCard.astro` without nested `<a>` tags.
 * The headline `<a>` acts as the stretched primary card link while internal cross-links
 * (authority, mentioned library branches, sector organisations, and topic filter pills)
 * remain directly clickable at a higher stacking context.
 *
 * @param {object} story - Normalized news story record.
 * @param {object} [options={}] - Card rendering options.
 * @param {string} [options.baseUrl='/'] - Site base URL prefix.
 * @param {boolean} [options.showAuthority=true] - Whether to render the authority badge/link.
 * @param {(filterType: 'category'|'change_type'|'organisation', value: string) => void} [options.onTopicClick] - Optional interactive topic filter callback.
 * @returns {HTMLLIElement} Constructed list item element.
 */
export function createNewsStoryElement(story, options = {}) {
  const { baseUrl = '/', showAuthority = true, onTopicClick = null } = options
  const formattedDate = formatNewsDate(story.date)
  const firstLink = story.links && story.links.length > 0 ? story.links[0] : null
  const sourceDomain = story.domain || firstLink?.domain || null
  const sourceUrl = story.url || firstLink?.url || null
  const titleText = story.entity || story.authority_name || 'News update'

  const listItem = document.createElement('li')
  listItem.className = sourceUrl ? 'news-result-item news-result-item--linked' : 'news-result-item'
  if (story.id) listItem.setAttribute('data-id', story.id)

  const cardContainer = document.createElement('div')
  cardContainer.className = 'news-result-link'

  const header = document.createElement('div')
  header.className = 'library-result-header'

  const heading = document.createElement('h3')
  if (sourceUrl) {
    const primaryLink = document.createElement('a')
    primaryLink.href = sourceUrl
    primaryLink.className = 'news-card-primary-link'
    primaryLink.target = '_blank'
    primaryLink.rel = 'noopener noreferrer'
    const titleSpan = document.createElement('span')
    titleSpan.textContent = titleText
    primaryLink.appendChild(titleSpan)
    primaryLink.insertAdjacentHTML('beforeend', ' ' + ARROW_UP_RIGHT_LG_SVG)
    heading.appendChild(primaryLink)
  } else {
    const titleSpan = document.createElement('span')
    titleSpan.textContent = titleText
    heading.appendChild(titleSpan)
  }
  header.appendChild(heading)

  if (formattedDate) {
    const datePill = document.createElement('span')
    datePill.className = 'status-pill status-pill--plum'
    datePill.textContent = formattedDate
    header.appendChild(datePill)
  }
  cardContainer.appendChild(header)

  const summaryParagraph = document.createElement('p')
  summaryParagraph.className = 'news-result-text'
  summaryParagraph.textContent = story.text || ''
  cardContainer.appendChild(summaryParagraph)

  const metaRow = document.createElement('div')
  metaRow.className = 'library-result-meta'

  if (showAuthority && story.authority_name) {
    const authorityUrl = authorityPageUrl(story.authority_slug, baseUrl)
    if (authorityUrl) {
      const authorityWrap = document.createElement('span')
      authorityWrap.className = 'authority-label'
      const authorityLink = document.createElement('a')
      authorityLink.href = authorityUrl
      authorityLink.className = 'news-cross-link news-cross-link--authority'
      authorityLink.textContent = story.authority_name
      authorityWrap.appendChild(authorityLink)
      if (story.country) {
        authorityWrap.appendChild(document.createTextNode(` · ${story.country}`))
      }
      metaRow.appendChild(authorityWrap)
    } else {
      const authoritySpan = document.createElement('span')
      authoritySpan.className = 'authority-label'
      authoritySpan.textContent =
        story.authority_name + (story.country ? ` · ${story.country}` : '')
      metaRow.appendChild(authoritySpan)
    }
  } else if (story.country) {
    const countrySpan = document.createElement('span')
    countrySpan.className = 'authority-label'
    countrySpan.textContent = story.country
    metaRow.appendChild(countrySpan)
  }

  for (const library of (story.libraries || []).slice(0, 2)) {
    if (!library?.name) continue
    if (library.url) {
      const libraryLink = document.createElement('a')
      libraryLink.href = joinBaseUrl(library.url, baseUrl)
      libraryLink.className =
        'status-pill status-pill--plum news-library-pill news-cross-link news-cross-link--pill'
      libraryLink.textContent = library.name
      metaRow.appendChild(libraryLink)
    } else {
      const libraryPill = document.createElement('span')
      libraryPill.className = 'status-pill status-pill--plum news-library-pill'
      libraryPill.textContent = library.name
      metaRow.appendChild(libraryPill)
    }
  }

  if (story.change_type) {
    if (onTopicClick) {
      const changeButton = document.createElement('button')
      changeButton.type = 'button'
      changeButton.className =
        'status-pill status-pill--rose news-topic-filter-btn news-cross-link--interactive'
      changeButton.dataset.filterType = 'change_type'
      changeButton.dataset.filterValue = story.change_type
      changeButton.textContent = changeTypeLabel(story.change_type)
      changeButton.addEventListener('click', () => onTopicClick('change_type', story.change_type))
      metaRow.appendChild(changeButton)
    } else {
      const changePill = document.createElement('span')
      changePill.className = 'status-pill status-pill--rose'
      changePill.textContent = changeTypeLabel(story.change_type)
      metaRow.appendChild(changePill)
    }
  }

  for (const categoryKey of (story.categories || []).slice(0, 2)) {
    const color = categoryColor(categoryKey)
    if (onTopicClick) {
      const categoryButton = document.createElement('button')
      categoryButton.type = 'button'
      categoryButton.className = `status-pill status-pill--${color} news-topic-filter-btn news-cross-link--interactive`
      categoryButton.dataset.filterType = 'category'
      categoryButton.dataset.filterValue = categoryKey
      categoryButton.textContent = categoryLabel(categoryKey)
      categoryButton.addEventListener('click', () => onTopicClick('category', categoryKey))
      metaRow.appendChild(categoryButton)
    } else {
      const categoryPill = document.createElement('span')
      categoryPill.className = `status-pill status-pill--${color}`
      categoryPill.textContent = categoryLabel(categoryKey)
      metaRow.appendChild(categoryPill)
    }
  }

  for (const organisationName of (story.organisations || []).slice(0, 2)) {
    const organisationUrl = organisationPageUrl(organisationName, baseUrl)
    if (organisationUrl) {
      const organisationLink = document.createElement('a')
      organisationLink.href = organisationUrl
      organisationLink.className =
        'status-pill status-pill--green news-org-pill news-cross-link news-cross-link--pill'
      organisationLink.textContent = organisationName
      metaRow.appendChild(organisationLink)
    }
  }

  if (sourceDomain) {
    const domainSpan = document.createElement('span')
    domainSpan.className = 'news-source-domain'
    const labelSpan = document.createElement('span')
    labelSpan.textContent = `Source: ${sourceDomain}`
    domainSpan.appendChild(labelSpan)
    domainSpan.insertAdjacentHTML('beforeend', ' ' + ARROW_UP_RIGHT_SVG)
    metaRow.appendChild(domainSpan)
  }

  cardContainer.appendChild(metaRow)
  listItem.appendChild(cardContainer)
  return listItem
}

/**
 * Custom element controller for `<news-stories-list>`, providing interactive time-period
 * slider filtering, key theme filtering, and incremental pagination.
 */
export class NewsStoriesList extends HTMLElement {
  allStories = []
  filteredStories = []
  visibleCount = 10
  slider = null
  sliderLabel = null
  resultsList = null
  countText = null
  loadMoreButton = null
  activeTheme = null

  connectedCallback() {
    const dataElement = this.querySelector('[data-stories-json]')
    if (!dataElement) return
    try {
      this.allStories = JSON.parse(dataElement.textContent || '[]')
    } catch {
      this.allStories = []
    }

    this.slider = this.querySelector('[data-time-slider]')
    this.sliderLabel = this.querySelector('[data-time-slider-value]')
    this.resultsList = this.querySelector('[data-results-list]')
    this.countText = this.querySelector('[data-count-text]')
    this.loadMoreButton = this.querySelector('[data-load-more]')

    const themeButtons = this.querySelectorAll('[data-topic-key]')
    themeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const topicKey = button.dataset.topicKey
        if (this.activeTheme === topicKey) {
          this.activeTheme = null
          button.setAttribute('aria-pressed', 'false')
        } else {
          this.activeTheme = topicKey
          themeButtons.forEach((otherButton) => otherButton.setAttribute('aria-pressed', 'false'))
          button.setAttribute('aria-pressed', 'true')
        }
        this.handleFilter()
      })
    })

    this.slider?.addEventListener('input', () => this.handleFilter())
    this.slider?.addEventListener('change', () => this.handleFilter())
    this.loadMoreButton?.addEventListener('click', () => {
      this.visibleCount += 20
      this.render()
    })

    this.handleFilter(false)
  }

  handleFilter(shouldResetVisible = true) {
    if (shouldResetVisible) this.visibleCount = 10
    const sliderValue = this.slider ? parseInt(this.slider.value, 10) : 5
    const stepConfig = PRESETS_BY_STEP[sliderValue] || PRESETS_BY_STEP[5]

    if (this.sliderLabel) {
      this.sliderLabel.textContent = stepConfig.label
    }

    const dateFiltered = filterStoriesByDate(this.allStories, { preset: stepConfig.preset })
    if (this.activeTheme) {
      this.filteredStories = dateFiltered.filter((story) =>
        (story.categories || []).includes(this.activeTheme)
      )
    } else {
      this.filteredStories = dateFiltered
    }

    this.render()
  }

  render() {
    if (!this.resultsList) return
    const totalFiltered = this.filteredStories.length
    const shownCount = Math.min(this.visibleCount, totalFiltered)
    const remainingCount = Math.max(0, totalFiltered - shownCount)

    if (this.countText) {
      this.countText.textContent = `Showing ${shownCount.toLocaleString('en-GB')} of ${totalFiltered.toLocaleString('en-GB')} stories`
    }

    if (this.loadMoreButton) {
      this.loadMoreButton.hidden = remainingCount === 0
      if (remainingCount > 0) {
        this.loadMoreButton.textContent = `Show more stories (${remainingCount.toLocaleString('en-GB')} remaining)`
      }
    }

    if (totalFiltered === 0) {
      const sliderValue = this.slider ? parseInt(this.slider.value, 10) : 5
      let emptyMessage = 'No stories match your filter criteria.'
      if (sliderValue < 5) {
        emptyMessage =
          'No stories match this filter in the selected time period. Try expanding the time period above.'
      }
      this.resultsList.innerHTML = `<li class="news-empty-message">${emptyMessage}</li>`
      return
    }

    const baseUrl = this.dataset.baseUrl || '/'
    const visibleStories = this.filteredStories.slice(0, this.visibleCount)
    const fragment = document.createDocumentFragment()
    for (const story of visibleStories) {
      fragment.appendChild(createNewsStoryElement(story, { baseUrl }))
    }
    this.resultsList.replaceChildren(fragment)
  }
}

/**
 * Register the `<news-stories-list>` custom element in the browser.
 */
export function initNewsStoriesList() {
  if (typeof customElements !== 'undefined' && !customElements.get('news-stories-list')) {
    customElements.define('news-stories-list', NewsStoriesList)
  }
}

initNewsStoriesList()
