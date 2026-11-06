/**
 * @fileoverview Data models representing library buildings and library services (authorities).
 */

import { days } from './directory-data.mjs'

const operationMap = {
  LAL: 'Local Authority Run',
  'LAL-': 'Local Authority Run Unstaffed',
  CL: 'Commissioned',
  CRL: 'Community Run',
  ICL: 'Independent Community'
}

const operatingLabels = {
  'Local Authority Run': 'Local authority staffed',
  'Local Authority Run Unstaffed': 'Local authority run, unstaffed',
  'Community Run': 'Community-run',
  'Independent Community': 'Community-run',
  Commissioned: 'Commissioned',
  'Temporary Closure': 'Temporarily closed',
  'Facility Not Open': 'Closed/Not open',
  Closed: 'Permanently closed'
}

/**
 * Convert degrees to radians.
 * @param {number} degrees - Angle in degrees.
 * @returns {number} Angle in radians.
 */
const toRadians = (degrees) => (degrees * Math.PI) / 180
const earthMiles = 3958.8
const weekDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Calculate straight-line distance in miles between two coordinate objects.
 * @param {{latitude?: number, longitude?: number}} first
 * @param {{latitude?: number, longitude?: number}} second
 * @returns {number|null} Distance in miles, or null when either coordinate is missing.
 */
export function distanceMiles(first, second) {
  if (
    !Number.isFinite(first?.latitude) ||
    !Number.isFinite(first?.longitude) ||
    !Number.isFinite(second?.latitude) ||
    !Number.isFinite(second?.longitude)
  ) {
    return null
  }
  const lat = toRadians(first.latitude)
  const otherLat = toRadians(second.latitude)
  const haversine =
    Math.sin((otherLat - lat) / 2) ** 2 +
    Math.cos(lat) *
      Math.cos(otherLat) *
      Math.sin(toRadians(second.longitude - first.longitude) / 2) ** 2
  return 2 * earthMiles * Math.asin(Math.sqrt(haversine))
}

/**
 * Extract compact weekly [startTime, endTime] pairs for search filtering.
 * @param {object} openingTimes
 * @returns {Record<string, Array<[string, string]>>|null}
 */
export function compactOpeningHours(openingTimes) {
  if (!openingTimes || typeof openingTimes !== 'object') return null
  const hours = {}
  for (const day of weekDays) {
    const slots = (openingTimes[day]?.timeFrames || [])
      .filter((frame) => frame?.startTime && frame?.endTime)
      .map((frame) => [frame.startTime, frame.endTime])
    if (slots.length) hours[day] = slots
  }
  return Object.keys(hours).length ? hours : null
}

/**
 * Encapsulates a library location, presentation properties, services and operating schedule.
 */
export class Library {
  /**
   * @param {object} record - Canonical library record.
   */
  constructor(record) {
    Object.assign(this, record)
    const data = record?.data || {}

    const services = (data['Facilities and services'] || '')
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((service) => ({ service }))

    for (const [field, service] of [
      ['Public computers', 'Computers'],
      ['Printing', 'Printing'],
      ['Meeting rooms', 'Meeting rooms'],
      ['Quiet study space', 'Quiet study space'],
      ['Guest wifi', 'Guest wifi'],
      ['Member wifi', 'Member wifi']
    ]) {
      if (data[field] === 'Yes' && !services.some((item) => item.service === service))
        services.push({ service })
      if (data[field] === 'No') {
        const index = services.findIndex((item) => item.service === service)
        if (index >= 0) services.splice(index, 1)
      }
    }

    const accessibility = []
    for (const [field, label] of [
      ['Step-free access', 'step-free-access'],
      ['Accessible toilet', 'accessible-toilet'],
      ['Hearing loop', 'hearing-loop-system']
    ]) {
      if (data[field] === 'Yes' && !accessibility.includes(label)) accessibility.push(label)
      if (data[field] !== 'Yes' && accessibility.includes(label))
        accessibility.splice(accessibility.indexOf(label), 1)
    }

    const openingTimes = {}
    for (const day of days) {
      const timeFrames = []
      let known = false
      for (const [kind, type] of [
        ['staffed', 'Staffed'],
        ['unstaffed', 'Self-service']
      ]) {
        const value = data[`${day} ${kind} hours`]
        if (!value) continue
        known = true
        for (const slot of value.split(',')) {
          const [startTime, endTime] = slot.split('-')
          timeFrames.push({ startTime, endTime, type })
        }
      }
      if (known)
        openingTimes[day.toLowerCase()] = {
          timeFrames: timeFrames.sort((first, second) =>
            first.startTime.localeCompare(second.startTime)
          )
        }
    }

    const operatingType = data['Type of library']

    if (data && Object.keys(data).length > 0) {
      this.name = data['Library name']
      this.address = [data['Address 1'], data['Address 2'], data['Address 3']]
        .filter(Boolean)
        .join(', ')
      this.postcode = data.Postcode
      this.uprn = data['Unique property reference number']
      this.latitude = data.Latitude
      this.longitude = data.Longitude
      this.phone = data['Phone number']
      this.email = data['Email address']
      this.website = data.URL
      this.notes = data.Notes || ''
      this.coLocated =
        data['Co-located'] === 'No'
          ? []
          : (data['Co-located with'] || '')
              .split(';')
              .map((value) => value.trim())
              .filter(Boolean)
      this.facilityOperated =
        data.Status === 'Closed (permanent)'
          ? 'Closed'
          : data.Status === 'Closed (temporary)'
            ? 'Temporary Closure'
            : data.Status === 'Planned'
              ? 'Facility Not Open'
              : operatingType
                ? operationMap[operatingType]
                : ''
      this.permanentlyClosed = data.Status === 'Closed (permanent)'
      this.services = services
      this.accessibility = accessibility
      this.openingTimes = openingTimes
      this.openingTimesNotes = data['Special hours'] || ''
    }
  }

  /**
   * Whether the library is permanently closed or facilities are not open.
   * @type {boolean}
   */
  get isClosed() {
    return Boolean(
      this.permanentlyClosed ||
      this.facilityOperated === 'Closed' ||
      this.facilityOperated === 'Facility Not Open'
    )
  }

  /**
   * Whether the library has valid numeric coordinates.
   * @type {boolean}
   */
  get hasCoordinates() {
    return Number.isFinite(this.latitude) && Number.isFinite(this.longitude)
  }

  /**
   * Human-readable operating model label for the library.
   * @type {string}
   */
  get operatingModel() {
    return operatingLabels[this.facilityOperated] || this.facilityOperated || ''
  }

  /**
   * Google Maps and Apple Maps search links for the library.
   * @type {{google: string, apple: string}|null}
   */
  get mapLinks() {
    const address = this.address || ''
    const hasPoint = this.hasCoordinates
    if (!address && !hasPoint) return null
    const point = `${this.latitude},${this.longitude}`
    return {
      google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        hasPoint && !address ? point : `library ${address}`
      )}`,
      apple: hasPoint
        ? `https://maps.apple.com/?ll=${point}`
        : `https://maps.apple.com/?q=${encodeURIComponent(address)}`
    }
  }

  /**
   * Compact weekly opening hours formatted for directory search.
   * @type {Record<string, Array<[string, string]>>|null}
   */
  get compactHours() {
    return compactOpeningHours(this.openingTimes)
  }

  /**
   * Find the closest open libraries to this library by straight-line distance.
   * @param {Library[]} candidates - Candidate libraries.
   * @param {number} [count=5] - Number of neighbours to return.
   * @returns {Array<{library: Library, miles: number}>} Nearest first.
   */
  nearby(candidates, count = 5) {
    if (!this.hasCoordinates) return []
    const nearest = []
    for (const other of candidates) {
      if (other.id === this.id || other.permanentlyClosed) continue
      const miles = distanceMiles(this, other)
      if (miles === null) continue
      if (nearest.length === count && miles >= nearest[count - 1].miles) continue
      nearest.push({ library: other, miles })
      nearest.sort((first, second) => first.miles - second.miles)
      if (nearest.length > count) nearest.pop()
    }
    return nearest
  }
}

/**
 * Encapsulates a library service / local authority and its shared links and channels.
 */
export class LibraryService {
  /**
   * @param {object} record - Canonical library service record.
   */
  constructor(record) {
    Object.assign(this, record)
    const data = record?.data || {}

    const channels = [
      ['Twitter URL', 'twitter'],
      ['Facebook URL', 'facebook'],
      ['Instagram URL', 'instagram'],
      ['YouTube URL', 'youtube']
    ]
    const social = []
    for (const [field, channel] of channels) {
      const url = data[field]
      if (url) social.push({ channel, url })
    }

    if (data && Object.keys(data).length > 0) {
      this.name = data['Local authority']
      this.gss = data['Local authority code']
      this.country = data.Country
      this.website = data['Service URL']
      this.phone = data['Phone number']
      this.email = data['Email address']
      this.catalogue = data['Catalogue URL']
      this.joinOnline = data['Join online URL']
      this.androidApp = data['Android app URL']
      this.iOSApp = data['iOS app URL']
      this.operatingOrganisation = data['Operating organisation']
      this.social = social
    }

    if (!this.library_ids) {
      this.library_ids = []
    }
  }

  /**
   * Whether the authority has one or more social media channels recorded.
   * @type {boolean}
   */
  get hasSocial() {
    return Array.isArray(this.social) && this.social.length > 0
  }

  /**
   * Relative public URL for the authority directory page.
   * @type {string}
   */
  get url() {
    return `/libraries/${this.slug}/`
  }
}
