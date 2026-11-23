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
    const data = record?.data || record || {}

    // Extract facilities and services from semicolon-delimited lists and explicit boolean fields
    const services = (data['Facilities and services'] || data.facilities_and_services || '')
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((service) => ({ service }))

    for (const [fields, service] of [
      [['Public computers', 'public_computers'], 'Computers'],
      [['Printing', 'printing'], 'Printing'],
      [['Meeting rooms', 'meeting_rooms'], 'Meeting rooms'],
      [['Quiet study space', 'quiet_study_space'], 'Quiet study space'],
      [['Guest wifi', 'guest_wifi'], 'Guest wifi'],
      [['Member wifi', 'member_wifi'], 'Member wifi'],
      [['Makerspace', 'makerspace'], 'Makerspace'],
      [['Café', 'cafe'], 'Cafe']
    ]) {
      const val = fields.map((f) => data[f]).find((v) => v !== undefined)
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
    for (const [fields, label] of [
      [['Step-free access', 'step_free_access'], 'step-free-access'],
      [['Accessible toilet', 'accessible_toilet'], 'accessible-toilet'],
      [['Hearing loop', 'hearing_loop'], 'hearing-loop-system'],
      [['Accessible parking', 'accessible_parking'], 'accessible-parking'],
      [['Changing Places toilet', 'changing_places_toilet'], 'changing-places-toilet'],
      [['Sensory space', 'sensory_space'], 'sensory-friendly-environment'],
      [['Baby changing', 'baby_changing'], 'baby-changing-facilities']
    ]) {
      const val = fields.map((f) => data[f]).find((v) => v !== undefined)
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
          data[`${day} ${kind} hours`] || data[`${day.toLowerCase()}_${kind}_hours`]
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

    const operatingType = data['Type of library'] || data.type_of_library

    if (data && Object.keys(data).length > 0) {
      this.name = data['Library name'] || data.library_name || record.name || ''
      this.library_name = this.name
      this.address =
        [
          data['Address 1'] || data.address_1,
          data['Address 2'] || data.address_2,
          data['Address 3'] || data.address_3
        ]
          .filter(Boolean)
          .join(', ') ||
        record.address ||
        ''
      this.town = data['Town or city'] || data.town || record.town || undefined
      this.postcode = data.Postcode || data.postcode || record.postcode || null
      this.uprn =
        data['Unique property reference number'] ||
        data.unique_property_reference_number ||
        record.uprn ||
        null
      this.unique_property_reference_number = this.uprn
      this.latitude = data.Latitude ?? data.latitude ?? record.latitude ?? null
      this.longitude = data.Longitude ?? data.longitude ?? record.longitude ?? null
      this.phone = data['Phone number'] || data.phone_number || record.phone || ''
      this.phone_number = this.phone
      this.email = data['Email address'] || data.email_address || record.email || ''
      this.email_address = this.email
      this.website = data.URL || data.url || record.website || ''
      this.url = this.website
      this.catalogue =
        data['Catalogue URL'] || data.catalogue_url || record.catalogue || ''
      this.catalogue_url = this.catalogue
      this.joinOnline =
        data['Join online URL'] || data.join_online_url || record.joinOnline || ''
      this.join_online_url = this.joinOnline
      this.virtualTourUrl =
        data['Virtual tour URL'] || data.virtual_tour_url || record.virtualTourUrl || ''
      this.virtual_tour_url = this.virtualTourUrl
      this.temporaryClosedUntil =
        data['Temporary closure expected reopening'] ||
        data.temporary_closed_until ||
        record.tempClosedUntil ||
        null
      this.temporary_closed_until = this.temporaryClosedUntil
      this.notes = data.Notes || data.notes || record.notes || ''
      this.coLocated =
        (data['Co-located'] || data.co_located) === 'No'
          ? []
          : (data['Co-located with'] || data.co_located_with || '')
              .split(';')
              .map((value) => value.trim())
              .filter(Boolean)
      this.facilityOperated =
        (data.Status || data.status) === 'Closed (permanent)'
          ? 'Closed'
          : (data.Status || data.status) === 'Closed (temporary)'
            ? 'Temporary Closure'
            : (data.Status || data.status) === 'Planned'
              ? 'Facility Not Open'
              : operatingType
                ? operationMap[operatingType]
                : record.facilityOperated || ''
      this.permanentlyClosed = Boolean(
        (data.Status || data.status) === 'Closed (permanent)' || record.permanentlyClosed
      )
      this.services = services.length ? services : record.services || []
      this.accessibility = accessibility.length ? accessibility : record.accessibility || []
      this.openingTimes = Object.keys(openingTimes).length
        ? openingTimes
        : record.openingTimes || {}
      this.openingTimesNotes = data['Special hours'] || record.openingTimesNotes || ''
    }

    if (!record?.data) {
      Object.defineProperty(this, 'data', {
        value: this,
        enumerable: false,
        configurable: true,
        writable: true
      })
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
