import { days } from './directory-data.mjs'
import type { LibraryData, LibraryRecord, LibraryServiceRecord } from './directory-types.ts'

type Service = { service: string; url?: string }
type Social = { channel: string; url: string }
type TimeFrame = { startTime: string; endTime: string; type: string }

/**
 * Derive template/search properties solely from canonical library fields.
 * This transient view is never written back as a second persisted data model.
 * @param record - Validated canonical library, including retained review metadata.
 * @returns Public presentation fields with separated staffed/self-service sessions.
 */
export function libraryView(record: LibraryRecord) {
  const { data } = record
  const services: Service[] = (data['Facilities and services'] || '')
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
  ] as const) {
    if (data[field] === 'Yes' && !services.some((item) => item.service === service))
      services.push({ service })
    if (data[field] === 'No') {
      const index = services.findIndex((item) => item.service === service)
      if (index >= 0) services.splice(index, 1)
    }
  }
  const accessibility: string[] = []
  for (const [field, label] of [
    ['Step-free access', 'step-free-access'],
    ['Accessible toilet', 'accessible-toilet'],
    ['Hearing loop', 'hearing-loop-system']
  ] as const) {
    if (data[field] === 'Yes' && !accessibility.includes(label)) accessibility.push(label)
    if (data[field] !== 'Yes' && accessibility.includes(label))
      accessibility.splice(accessibility.indexOf(label), 1)
  }
  const openingTimes: Record<string, { timeFrames: TimeFrame[] }> = {}
  for (const day of days) {
    const timeFrames: TimeFrame[] = []
    let known = false
    for (const [kind, type] of [
      ['staffed', 'Staffed'],
      ['unstaffed', 'Self-service']
    ] as const) {
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
  const operation: Record<NonNullable<LibraryData['Type of library']>, string> = {
    LAL: 'Local Authority Run',
    'LAL-': 'Local Authority Run Unstaffed',
    CL: 'Commissioned',
    CRL: 'Community Run',
    ICL: 'Independent Community'
  }
  const operatingType = data['Type of library']
  return {
    ...record,
    name: data['Library name'],
    address: [data['Address 1'], data['Address 2'], data['Address 3']].filter(Boolean).join(', '),
    postcode: data.Postcode,
    uprn: data['Unique property reference number'],
    latitude: data.Latitude,
    longitude: data.Longitude,
    phone: data['Phone number'],
    email: data['Email address'],
    website: data.URL,
    notes: data.Notes || '',
    coLocated:
      data['Co-located'] === 'No'
        ? []
        : (data['Co-located with'] || '')
            .split(';')
            .map((value) => value.trim())
            .filter(Boolean),
    facilityOperated:
      data.Status === 'Closed (permanent)'
        ? 'Closed'
        : data.Status === 'Closed (temporary)'
          ? 'Temporary Closure'
          : data.Status === 'Planned'
            ? 'Facility Not Open'
            : operatingType
              ? operation[operatingType]
              : '',
    permanentlyClosed: data.Status === 'Closed (permanent)',
    services,
    accessibility,
    openingTimes,
    openingTimesNotes: data['Special hours'] || ''
  }
}

/**
 * Adapt a canonical service record to the shared contact and authority templates.
 * @param record - Validated service with schema-owned contact and social URLs.
 * @returns A transient presentation view; no legacy-source fallback is consulted.
 */
export function authorityView(record: LibraryServiceRecord) {
  const { data } = record
  const channels = [
    ['Twitter URL', 'twitter'],
    ['Facebook URL', 'facebook'],
    ['Instagram URL', 'instagram'],
    ['YouTube URL', 'youtube']
  ] as const
  const social: Social[] = []
  for (const [field, channel] of channels) {
    const url = data[field]
    if (url) social.push({ channel, url })
  }
  return {
    ...record,
    name: data['Local authority'],
    gss: data['Local authority code'],
    country: data.Country,
    website: data['Service URL'],
    phone: data['Phone number'],
    email: data['Email address'],
    catalogue: data['Catalogue URL'],
    joinOnline: data['Join online URL'],
    androidApp: data['Android app URL'],
    iOSApp: data['iOS app URL'],
    operatingOrganisation: data['Operating organisation'],
    social
  }
}
