/** Normalise names and postcode text without requiring geocoding or map services. */
export function normalise(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Match all search terms, including postcodes entered without spaces. */
export function matchesLibrary(record, { query = '', authority = '', country = '' } = {}) {
  if (authority && record.authority !== authority) return false;
  if (country && record.country !== country) return false;
  const text = normalise(
    `${record.name} ${record.address} ${record.town || ''} ${record.postcode} ${record.authorityName}`
  );
  const compact = text.replace(/\s/g, '');
  return normalise(query)
    .split(/\s+/)
    .every((term) => text.includes(term) || compact.includes(term));
}
