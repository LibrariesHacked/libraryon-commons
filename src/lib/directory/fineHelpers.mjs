/**
 * @fileoverview Display known fine amounts without interpreting missing values as fine-free.
 */

/**
 * Format only known fines; declare a service fine-free only when both fines are zero.
 * @param {{adultFine?: number|null, childFine?: number|null, fineInterval?: string|null}} record - Service model.
 * @param {{fine_free: string, adult_fine_label: string, child_fine_label: string, fine_interval_prefix: string}} copy - Configured UI labels.
 * @returns {string} Fine summary, or empty text when neither amount is known.
 */
export function fineSummary(record, copy) {
  /** @param {unknown} value - Candidate amount. @returns {boolean} Whether it is a finite, nonnegative number. */
  const known = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
  const adult = known(record.adultFine)
  const child = known(record.childFine)
  if (!adult && !child) return ''
  if (adult && child && record.adultFine === 0 && record.childFine === 0) return copy.fine_free
  const amounts = [
    adult ? `£${record.adultFine.toFixed(2)} ${copy.adult_fine_label}` : '',
    child ? `£${record.childFine.toFixed(2)} ${copy.child_fine_label}` : ''
  ].filter(Boolean)
  return `${amounts.join(' / ')}${record.fineInterval ? ` ${copy.fine_interval_prefix} ${record.fineInterval.toLowerCase()}` : ''}`
}
