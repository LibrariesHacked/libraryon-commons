/**
 * @fileoverview Domain model for individual UK library buildings, normalizing address, facilities, opening schedules, and spatial proximity for directory pages and search.
 */

import { days, compactOpeningHours } from '../openingHoursHelpers.mjs'
import { distanceMiles } from '../geoHelpers.mjs'

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
 * Encapsulates a library location, presentation properties, services, and operating schedule.
 */
export class Library {
  /**
   * Construct a Library instance from a canonical directory record.
   *
   * @param {object} record - Canonical directory record with `data` property matching Table Schema.
   */
  constructor(record) {
    Object.assign(this, record)
    const data = record?.data || {}

    // Extract facilities and services from semicolon-delimited lists and explicit boolean fields
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
      if (data[field] === 'Yes' && !services.some((item) => item.service === service)) {
        services.push({ service })
      }
      if (data[field] === 'No') {
        const index = services.findIndex((item) => item.service === service)
        if (index >= 0) services.splice(index, 1)
      }
    }

    // Extract accessibility features
    const accessibility = []
    for (const [field, label] of [
      ['Step-free access', 'step-free-access'],
      ['Accessible toilet', 'accessible-toilet'],
      ['Hearing loop', 'hearing-loop-system']
    ]) {
      if (data[field] === 'Yes' && !accessibility.includes(label)) {
        accessibility.push(label)
      }
      if (data[field] !== 'Yes' && accessibility.includes(label)) {
        accessibility.splice(accessibility.indexOf(label), 1)
      }
    }

    // Build structured weekly opening times
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
      if (known) {
        openingTimes[day.toLowerCase()] = {
          timeFrames: timeFrames.sort((first, second) =>
            first.startTime.localeCompare(second.startTime)
          )
        }
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
   * Whether the library is permanently closed or not yet open.
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
   * Whether the library has valid numeric latitude and longitude coordinates.
   * @type {boolean}
   */
  get hasCoordinates() {
    return Number.isFinite(this.latitude) && Number.isFinite(this.longitude)
  }

  /**
   * Human-readable operating model label for the library (e.g. 'Local authority staffed').
   * @type {string}
   */
  get operatingModel() {
    return operatingLabels[this.facilityOperated] || this.facilityOperated || ''
  }

  /**
   * Google Maps and Apple Maps navigation links for the library.
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
   * Compact weekly opening hours formatted for client-side directory search.
   * @type {Record<string, Array<[string, string]>>|null}
   */
  get compactHours() {
    return compactOpeningHours(this.openingTimes)
  }

  /**
   * Find the closest open libraries to this library by straight-line distance.
   *
   * @param {Library[]} candidates - Candidate libraries to evaluate.
   * @param {number} [count=5] - Maximum number of nearest neighbours to return.
   * @returns {Array<{library: Library, miles: number}>} Nearest libraries sorted ascending by distance.
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
