/**
 * @fileoverview Automated tests for live directory opening hours helpers and UK time evaluation.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  timeStringToMinutes,
  getUkDayAndTime,
  getLiveOpeningStatus,
  isHoursOpenNow,
  hasRecordedHours
} from '../src/lib/helpers/openingHoursHelpers.mjs'

test('timeStringToMinutes parses 24-hour time strings accurately', () => {
  assert.equal(timeStringToMinutes('00:00'), 0)
  assert.equal(timeStringToMinutes('09:30'), 570)
  assert.equal(timeStringToMinutes('17:45'), 1065)
  assert.equal(timeStringToMinutes('23:59'), 1439)
  assert.equal(timeStringToMinutes('invalid'), null)
  assert.equal(timeStringToMinutes(''), null)
  assert.equal(timeStringToMinutes(null), null)
})

test('getUkDayAndTime returns lowercase day name and minute offset', () => {
  // Test with fixed UTC date: Wednesday 12:30 UTC
  const fixed = new Date('2026-11-04T12:30:00Z')
  const { day, minutes } = getUkDayAndTime(fixed)
  assert.equal(day, 'wednesday')
  assert.equal(minutes, 12 * 60 + 30)
})

test('getLiveOpeningStatus identifies currently open session and closing time', () => {
  const openingTimes = {
    wednesday: {
      timeFrames: [
        { startTime: '09:00', endTime: '13:00', type: 'Staffed' },
        { startTime: '14:00', endTime: '18:00', type: 'Staffed' }
      ]
    }
  }

  // Wednesday at 10:30 UTC (during morning session)
  const morning = new Date('2026-11-04T10:30:00Z')
  const morningStatus = getLiveOpeningStatus(openingTimes, morning)
  assert.equal(morningStatus.isOpen, true)
  assert.equal(morningStatus.currentFrame.startTime, '09:00')
  assert.equal(morningStatus.statusText, 'Open now · Closes at 13:00')

  // Wednesday at 13:30 UTC (between sessions)
  const lunchtime = new Date('2026-11-04T13:30:00Z')
  const lunchStatus = getLiveOpeningStatus(openingTimes, lunchtime)
  assert.equal(lunchStatus.isOpen, false)
  assert.equal(lunchStatus.nextTodayFrame.startTime, '14:00')
  assert.equal(lunchStatus.statusText, 'Closed now · Opens at 14:00')

  // Wednesday at 19:00 UTC (after closing)
  const evening = new Date('2026-11-04T19:00:00Z')
  const eveningStatus = getLiveOpeningStatus(openingTimes, evening)
  assert.equal(eveningStatus.isOpen, false)
  assert.equal(eveningStatus.currentFrame, null)
  assert.equal(eveningStatus.statusText, 'Closed now')
})

test('isHoursOpenNow supports both full directory model and compact search index formats', () => {
  const wednesdayOpen = new Date('2026-11-04T11:00:00Z')

  // Full model format
  const fullModel = {
    wednesday: {
      timeFrames: [{ startTime: '09:00', endTime: '17:00' }]
    }
  }
  assert.equal(isHoursOpenNow(fullModel, wednesdayOpen), true)

  // Compact search index format
  const compactModel = {
    wednesday: [['09:00', '17:00']]
  }
  assert.equal(isHoursOpenNow(compactModel, wednesdayOpen), true)

  // Outside opening hours
  const nightTime = new Date('2026-11-04T22:00:00Z')
  assert.equal(isHoursOpenNow(fullModel, nightTime), false)
  assert.equal(isHoursOpenNow(compactModel, nightTime), false)
})

test('hasRecordedHours detects when any day has valid time frames', () => {
  assert.equal(
    hasRecordedHours({ monday: { timeFrames: [{ startTime: '10:00', endTime: '16:00' }] } }),
    true
  )
  assert.equal(hasRecordedHours({ monday: [['10:00', '16:00']] }), true)
  assert.equal(hasRecordedHours({ monday: { timeFrames: [] } }), false)
  assert.equal(hasRecordedHours({}), false)
  assert.equal(hasRecordedHours(null), false)
})
