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
   * @param {object} record - Canonical directory record matching Table Schema.
   */
  constructor(record = {}) {
    Object.assign(this, record)
    const flat = record.data ? { ...record.data, ...record } : record

    // Extract facilities and services from semicolon-delimited lists and explicit boolean fields
    const services = (flat.facilities_and_services || flat['Facilities and services'] || '')
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((service) => ({ service }))

    for (const [field, service] of [
      ['public_computers', 'Computers'],
      ['printing', 'Printing'],
      ['meeting_rooms', 'Meeting rooms'],
      ['quiet_study_space', 'Quiet study space'],
      ['guest_wifi', 'Guest wifi'],
      ['member_wifi', 'Member wifi'],
      ['makerspace', 'Makerspace'],
      ['cafe', 'Cafe']
    ]) {
      const val = flat[field]
      if (val === 'Yes' && !services.some((item) => item.service === service)) {
        services.push({ service })
      }
      if (val === 'No') {
        const index = services.findIndex((item) => item.service === service)
        if (index >= 0) services.splice(index, 1)
      }
    }

    // Extract accessibility features
    const accessibility = []
    for (const [field, label] of [
      ['step_free_access', 'step-free-access'],
      ['accessible_toilet', 'accessible-toilet'],
      ['hearing_loop', 'hearing-loop-system'],
      ['accessible_parking', 'accessible-parking'],
      ['changing_places_toilet', 'changing-places-toilet'],
      ['sensory_space', 'sensory-friendly-environment'],
      ['baby_changing', 'baby-changing-facilities']
    ]) {
      const val = flat[field]
      if (val === 'Yes' && !accessibility.includes(label)) {
        accessibility.push(label)
      }
      if (val !== 'Yes' && val !== undefined && accessibility.includes(label)) {
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
        const value =
          flat[`${day.toLowerCase()}_${kind}_hours`] || flat[`${day} ${kind} hours`]
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

    const operatingType = flat.type_of_library || flat['Type of library']

    this.name = flat.library_name || flat['Library name'] || flat.name || ''
    this.library_name = this.name
    this.address =
      [
        flat.address_1 || flat['Address 1'],
        flat.address_2 || flat['Address 2'],
        flat.address_3 || flat['Address 3']
      ]
        .filter(Boolean)
        .join(', ') ||
      flat.address ||
      ''
    this.town = flat.town || flat['Town or city'] || undefined
    this.postcode = flat.postcode || flat.Postcode || null
    this.uprn =
      flat.unique_property_reference_number ||
      flat['Unique property reference number'] ||
      flat['Unique Property Reference Number (UPRN)'] ||
      flat.uprn ||
      null
    this.unique_property_reference_number = this.uprn
    this.latitude = flat.latitude ?? flat.Latitude ?? null
    this.longitude = flat.longitude ?? flat.Longitude ?? null
    this.phone = flat.phone_number || flat['Phone number'] || flat.phone || ''
    this.phone_number = this.phone
    this.email = flat.email_address || flat['Email address'] || flat.email || ''
    this.email_address = this.email
    this.website = flat.url || flat.URL || flat['Website URL'] || flat.website || ''
    this.url = this.website
    this.catalogue = flat.catalogue_url || flat['Catalogue URL'] || flat.catalogue || ''
    this.catalogue_url = this.catalogue
    this.joinOnline = flat.join_online_url || flat['Join online URL'] || flat.joinOnline || ''
    this.join_online_url = this.joinOnline
    this.virtualTourUrl =
      flat.virtual_tour_url || flat['Virtual tour URL'] || flat.virtualTourUrl || ''
    this.virtual_tour_url = this.virtualTourUrl
    this.temporaryClosedUntil =
      flat.temporary_closed_until ||
      flat['Temporary closure expected reopening'] ||
      flat.tempClosedUntil ||
      null
    this.temporary_closed_until = this.temporaryClosedUntil
    this.notes = flat.notes || flat.Notes || ''
    this.coLocated =
      (flat.co_located || flat['Co-located']) === 'No'
        ? []
        : (flat.co_located_with || flat['Co-located with'] || '')
            .split(';')
            .map((value) => value.trim())
            .filter(Boolean)
    const status = flat.status || flat.Status
    this.facilityOperated =
      status === 'Closed (permanent)'
        ? 'Closed'
        : status === 'Closed (temporary)'
          ? 'Temporary Closure'
          : status === 'Planned'
            ? 'Facility Not Open'
            : operatingType
              ? operationMap[operatingType]
              : flat.facilityOperated || ''
    this.permanentlyClosed = Boolean(
      status === 'Closed (permanent)' || flat.permanentlyClosed
    )
    this.services = services.length ? services : flat.services || []
    this.accessibility = accessibility.length ? accessibility : flat.accessibility || []
    this.openingTimes = Object.keys(openingTimes).length ? openingTimes : flat.openingTimes || {}
    this.openingTimesNotes =
      flat.special_hours || flat['Special hours'] || flat.openingTimesNotes || ''
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
