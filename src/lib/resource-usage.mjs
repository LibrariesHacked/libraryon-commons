import { articleTitle } from './site.mjs';

export function resourceUsage(resources, pages, sessions) {
  const usage = new Map(resources.map(({ id }) => [id, []]));

  for (const page of pages) {
    if (page.data.published === false) continue;
    for (const id of page.data.resources || []) {
      usage.get(id)?.push({
        label: articleTitle(page),
        href: page.data.path,
      });
    }
  }

  for (const session of sessions) {
    for (const id of session.data.resources || []) {
      usage.get(id)?.push({
        label: session.data.title,
        href: `/sessions/${session.id}/`,
      });
    }
  }

  return usage;
}