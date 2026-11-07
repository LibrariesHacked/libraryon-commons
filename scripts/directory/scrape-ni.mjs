/**
 * Scrape all 98 branch libraries from https://www.librariesni.org.uk/
 * and save a validated, structured snapshot to migration/directory/libraries-ni-scraped.json.
 */

import { fetch } from 'undici'
import * as cheerio from 'cheerio'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outputFile = join(__dirname, '../../migration/directory/libraries-ni-scraped.json')

function parseTime12(str) {
  str = str.trim().toLowerCase()
  if (str === '12 noon' || str === '12:00 noon' || str === 'noon') return '12:00'
  if (str === '12 midnight' || str === 'midnight') return '00:00'
  const m = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (!m) return null
  let hour = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  const ampm = m[3]
  if (ampm === 'pm' && hour < 12) hour += 12
  if (ampm === 'am' && hour === 12) hour = 0
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function parseSessionRange(rangeStr) {
  const m = rangeStr.match(
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)/i
  )
  if (!m) return null
  const start = parseTime12(m[1])
  const end = parseTime12(m[2])
  if (!start || !end) return null
  return `${start}-${end}`
}

export function parseLibraryPage(html, url) {
  const $ = cheerio.load(html)

  const name = $('h1').first().text().trim() || $('title').text().replace(/\|.*/, '').trim()

  let latitude = null
  let longitude = null
  const mapScript = $('script:contains("google.maps.LatLng")').text()
  const coordMatch = mapScript.match(/LatLng\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/)
  if (coordMatch) {
    latitude = parseFloat(coordMatch[1])
    longitude = parseFloat(coordMatch[2])
  }

  let phone = null
  const phoneLink = $('a[href^="tel:"]').first()
  if (phoneLink.length) {
    phone = phoneLink.text().replace(/^[^\d+]+/, '').replace(/\s+/g, ' ').trim()
  }

  let email = null
  const emailLink = $('a[href^="mailto:"]').first()
  if (emailLink.length) {
    email = emailLink.text().replace(/^mailto:\s*/i, '').replace(/^[^\w+]+/, '').trim()
  }

  let address = null
  let postcode = null
  const addressHeading = $('h4:contains("Address")')
  if (addressHeading.length) {
    const p = addressHeading.next('p')
    if (p.length) {
      const lines = p
        .html()
        .split(/<br\s*\/?>/i)
        .map((l) => cheerio.load(l).text().replace(/^[,\s]+|[,\s]+$/g, '').trim())
        .filter(Boolean)
      address = lines.join(', ')
      for (const line of lines) {
        const pcM = line.match(/\b(BT\d{1,2}\s*\d[A-Z]{2})\b/i)
        if (pcM) postcode = pcM[1].toUpperCase()
      }
    }
  }

  const servicesList = []
  const servicesHeading = $('h3:contains("Library Services")')
  if (servicesHeading.length) {
    const parent = servicesHeading.parent()
    parent.find('li, div, p').each((i, el) => {
      if ($(el).children().length === 0) {
        const text = $(el).text().trim()
        if (
          text &&
          !text.includes('Branch Manager') &&
          !text.includes('Opening Hours') &&
          !text.includes('@') &&
          !text.startsWith('http')
        ) {
          servicesList.push(text)
        }
      }
    })
  }

  const uniqueServices = [...new Set(servicesList)]

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const hours = { staffed: {}, unstaffed: {} }
  for (const d of days) {
    hours.staffed[d] = []
    hours.unstaffed[d] = []
  }

  const hoursH3 = $('h3:contains("Opening Hours")')
  if (hoursH3.length) {
    const container = hoursH3.parent()
    container.find('span.break, strong').each((i, el) => {
      const text = $(el).text().trim()
      const dayMatch = text.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday):?/i)
      if (dayMatch) {
        const day = dayMatch[1].toLowerCase()
        let curr = $(el).is('span.break') ? $(el) : $(el).closest('span.break')
        if (!curr.length) curr = $(el)
        let next = curr.next()
        while (
          next.length &&
          !next.is('span.break') &&
          !next
            .find('strong')
            .text()
            .match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday):?/i)
        ) {
          if (next.hasClass('open')) {
            const t = next.text().trim()
            if (t && !/closed/i.test(t)) {
              const session = parseSessionRange(t)
              if (session) hours.staffed[day].push(session)
            }
          } else if (next.hasClass('ooh')) {
            const t = next.text().trim()
            if (t && !/closed/i.test(t)) {
              const session = parseSessionRange(t)
              if (session) hours.unstaffed[day].push(session)
            }
          } else {
            next.find('.open').each((_, child) => {
              const t = $(child).text().trim()
              if (t && !/closed/i.test(t)) {
                const session = parseSessionRange(t)
                if (session) hours.staffed[day].push(session)
              }
            })
            next.find('.ooh').each((_, child) => {
              const t = $(child).text().trim()
              if (t && !/closed/i.test(t)) {
                const session = parseSessionRange(t)
                if (session) hours.unstaffed[day].push(session)
              }
            })
          }
          next = next.next()
        }
      }
    })
  }

  const schemaHours = {}
  for (const d of days) {
    const dayCap = d.charAt(0).toUpperCase() + d.slice(1)
    const staffedSlots = [...new Set(hours.staffed[d])].sort()
    const unstaffedSlots = [...new Set(hours.unstaffed[d])].sort()
    schemaHours[`${dayCap} staffed hours`] = staffedSlots.length ? staffedSlots.join(',') : null
    schemaHours[`${dayCap} unstaffed hours`] = unstaffedSlots.length
      ? unstaffedSlots.join(',')
      : null
  }

  const facilities = {
    'Public computers': uniqueServices.some((s) => /use of computers|computers/i.test(s))
      ? 'Yes'
      : null,
    Printing: uniqueServices.some((s) => /printer|printing/i.test(s)) ? 'Yes' : null,
    'Meeting rooms': uniqueServices.some((s) => /room hire|bookable space|meeting rooms?/i.test(s))
      ? 'Yes'
      : null,
    'Quiet study space': uniqueServices.some((s) => /study area|study space/i.test(s))
      ? 'Yes'
      : null,
    'Step-free access': uniqueServices.some((s) =>
      /disabled access|step-free|public lift/i.test(s)
    )
      ? 'Yes'
      : null,
    'Accessible toilet': uniqueServices.some((s) => /disabled toilet/i.test(s)) ? 'Yes' : null,
    'Hearing loop': uniqueServices.some((s) => /loop system|hearing loop/i.test(s)) ? 'Yes' : null
  }

  return {
    name,
    url,
    latitude,
    longitude,
    address,
    postcode,
    phone,
    email,
    services: uniqueServices,
    facilities,
    hours: schemaHours
  }
}

async function scrapeAll() {
  console.log('Fetching LibrariesNI index...')
  const res = await fetch('https://www.librariesni.org.uk/libraries/', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  const html = await res.text()
  const $ = cheerio.load(html)

  const counties = [
    'county-antrim',
    'county-armagh',
    'county-down',
    'county-fermanagh',
    'county-londonderry',
    'county-tyrone',
    'greater-belfast',
    'derry-city'
  ]
  const branchUrls = new Set()
  $('a[href*="/libraries/"]').each((i, el) => {
    const href = $(el).attr('href')
    if (href) {
      const parts = href.split('/').filter(Boolean)
      if (parts.length === 3 && parts[0] === 'libraries' && counties.includes(parts[1])) {
        const fullUrl = 'https://www.librariesni.org.uk' + (href.startsWith('/') ? href : '/' + href)
        branchUrls.add(fullUrl)
      }
    }
  })

  const sortedUrls = [...branchUrls].sort()
  console.log(`Found ${sortedUrls.length} library branches. Fetching details...`)

  const results = []
  // Fetch with concurrency of 5
  const concurrency = 5
  for (let i = 0; i < sortedUrls.length; i += concurrency) {
    const batch = sortedUrls.slice(i, i + concurrency)
    const promises = batch.map(async (url) => {
      try {
        const pageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        const pageHtml = await pageRes.text()
        const parsed = parseLibraryPage(pageHtml, url)
        console.log(`✓ Parsed ${parsed.name} (${url})`)
        return parsed
      } catch (err) {
        console.error(`✗ Error fetching ${url}:`, err.message)
        return null
      }
    })
    const batchResults = await Promise.all(promises)
    results.push(...batchResults.filter(Boolean))
  }

  console.log(`Successfully scraped ${results.length} libraries. Saving to ${outputFile}...`)
  writeFileSync(outputFile, JSON.stringify(results, null, 2) + '\n', 'utf8')
  console.log('Done.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeAll().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
