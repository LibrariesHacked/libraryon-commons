/** Select a named presentation template without changing original content metadata. */
export function templateFor(entry) {
  if (entry.data.path === '/') return 'home';
  if (entry.data.kind !== 'page') return entry.data.kind;
  if (entry.data.path.startsWith('/grants')) return 'grant';
  if (entry.data.path.startsWith('/legal/')) return 'legal';
  return 'article';
}
