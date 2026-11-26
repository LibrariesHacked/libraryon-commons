/**
 * Prepare the selected authority before schema and permission validation.
 * Blank associations preserve unresolved legacy name/code evidence rather than guessing.
 * @param {object} record - Plain library entry data.
 * @param {Array<{id: string, name: string, code: string}>} authorities - Generated authority index.
 * @returns {object} Copied data with consistent authority name and code.
 * @throws {Error} When the selection is absent from the deployed lookup or its identity is invalid.
 */
export function prepareLibraryAuthority(record, authorities) {
  if (!record.authority) return { ...record }
  const authority = authorities.find(({ id }) => id === record.authority)
  if (!authority || !authority.name || !/^[ELMNSW][0-9]{8}$/.test(authority.code)) {
    throw new Error(
      'The selected authority is not in this CMS deployment. Wait for lookup regeneration and reload the CMS.'
    )
  }
  return { ...record, local_authority: authority.name, local_authority_code: authority.code }
}
