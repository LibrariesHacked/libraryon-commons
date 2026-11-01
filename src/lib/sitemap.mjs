import { articleTitle } from './site.mjs';

const segmentLabel = (segment) =>
  segment
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function buildPageTree(pages) {
  const root = { children: [], lookup: new Map() };

  for (const page of pages) {
    const path = page.data.path.replace(/\/+$/, '') || '/';
    const segments = path.split('/').filter(Boolean);
    let parent = root;
    let currentPath = '';

    for (const segment of segments) {
      currentPath += `/${segment}`;
      let node = parent.lookup.get(segment);
      if (!node) {
        node = {
          label: segmentLabel(segment),
          href: null,
          children: [],
          lookup: new Map(),
        };
        parent.lookup.set(segment, node);
        parent.children.push(node);
      }
      if (currentPath === path) {
        node.label = articleTitle(page);
        node.href = page.data.path;
      }
      parent = node;
    }
  }

  const sort = (nodes) => {
    nodes.sort((first, second) => first.label.localeCompare(second.label, 'en'));
    for (const node of nodes) {
      delete node.lookup;
      sort(node.children);
    }
  };
  sort(root.children);
  return root.children;
}