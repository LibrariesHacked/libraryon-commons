import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildAuthorityActivitySummary,
  formatActivityPeriod,
  getActivityForAuthority
} from '../src/lib/content/activityHelpers.mjs'
import { resolveEffectiveMetric, monthToFinancialPeriod } from '../scripts/sync-activity.mjs'

describe('activityHelpers and sync-activity', () => {
  it('formats financial year periods into compact form', () => {
    assert.equal(formatActivityPeriod('2025/2026'), '2025/26')
    assert.equal(formatActivityPeriod('2024/2025'), '2024/25')
    assert.equal(formatActivityPeriod('2023/2024'), '2023/24')
    assert.equal(formatActivityPeriod(''), '')
  })

  it('resolves effective metrics and maps months to financial periods', () => {
    assert.equal(resolveEffectiveMetric(1000, null, null), 1000)
    assert.equal(resolveEffectiveMetric(999999, 45000, 'replaced'), 45000)
    assert.equal(resolveEffectiveMetric(999999, null, 'excluded'), null)
    assert.equal(resolveEffectiveMetric(0, null, null), null)

    assert.equal(monthToFinancialPeriod('2025-04'), '2025/2026')
    assert.equal(monthToFinancialPeriod('2026-03'), '2025/2026')
    assert.equal(monthToFinancialPeriod('2025-01'), '2024/2025')
  })

  it('returns activity data for English authorities and null for non-English authorities', () => {
    const barnsley = getActivityForAuthority('E08000016')
    assert.ok(barnsley, 'Expected Barnsley to have activity data')
    assert.equal(barnsley.period, '2025/2026')
    assert.equal(barnsley.metrics.visits.total, 626063)
    assert.equal(barnsley.metrics.loans.total, 355299)
    assert.equal(barnsley.metrics.computerHours.devices_count, 98)

    assert.equal(getActivityForAuthority('S12000033'), null)
    assert.equal(getActivityForAuthority('W06000015'), null)
    assert.equal(getActivityForAuthority(''), null)
  })

  it('applies completeness guards to avoid partial outreach-only or duplicate returns', () => {
    // Wirral 2025/26 reported outreach-only visits (3,932); should fall back to complete 2024/25 (472,101)
    const wirral = getActivityForAuthority('E08000015')
    assert.ok(wirral)
    assert.equal(wirral.metrics.visits.total, 472101)
    assert.equal(wirral.metrics.visits.period, '2024/2025')

    // Torbay 2024/25 & 2025/26 had Devon's 2.2M combined total; should fall back to 2023/24 (325,506)
    const torbay = getActivityForAuthority('E06000027')
    assert.ok(torbay)
    assert.equal(torbay.metrics.visits.total, 325506)
    assert.equal(torbay.metrics.visits.period, '2023/2024')

    // South Gloucestershire 2025/26 had partial computerHours (2,052); should fall back to 2024/25 (48,138)
    const southGlos = getActivityForAuthority('E06000025')
    assert.ok(southGlos)
    assert.equal(southGlos.metrics.computerHours.total, 48138)
    assert.equal(southGlos.metrics.computerHours.period, '2024/2025')

    // Bracknell Forest 2023/24 reported cumulative registrations (>65% of population); should omit users
    const bracknell = getActivityForAuthority('E06000036')
    assert.ok(bracknell)
    assert.equal(bracknell.metrics.users, undefined)
  })

  it('builds an advocacy-focused summary and caps cards at 6 for grid balance', () => {
    const manchester = getActivityForAuthority('E08000003')
    const summary = buildAuthorityActivitySummary(manchester, 'Manchester')
    assert.ok(summary)
    assert.equal(summary.periodLabel, '2024/25')
    assert.match(summary.leadText, /Manchester libraries welcomed 3,001,206 visits/)
    assert.match(summary.leadText, /issued 1,053,859 books and digital loans/)
    assert.equal(summary.cards.length, 6)

    const digitalCard = summary.cards.find((c) => c.key === 'computerHours')
    assert.ok(digitalCard)
    assert.match(digitalCard.primaryContext, /455 free public computers/)
    assert.match(digitalCard.secondaryContext, /264,982 free public Wi-Fi sessions/)

    // Authority with fewer than 6 other metrics shows wifiSessions as its own card
    const redcar = getActivityForAuthority('E06000003')
    const redcarSummary = buildAuthorityActivitySummary(redcar, 'Redcar and Cleveland')
    assert.ok(redcarSummary)
    assert.ok(redcarSummary.cards.some((c) => c.key === 'wifiSessions'))
  })
})
