import { canonicalInternalPath } from './site.mjs';

/**
 * Rewrite preserved links during the static build, without changing source files.
 * Rehype provides the parsed HTML tree; no regex replacement of rendered HTML is used.
 * @param {{base?: string}} options - Astro deployment base path.
 * @returns {(tree: object) => void} Rehype transformer.
 */
export function preservedLinks({ base = '/' } = {}) {
  const prefix = base.replace(/\/$/, '');
  return (tree) => {
    function normalizeLinks(node) {
      if (node.type === 'element' && node.properties) {
        if (node.tagName === 'img' && /^https?:/.test(node.properties.src || '')) {
          node.tagName = 'a';
          node.children = [{ type: 'text', value: node.properties.alt || 'Original image' }];
          node.properties = { href: node.properties.src };
        }
        for (const attribute of ['href', 'src', 'poster']) {
          let value = node.properties[attribute];
          if (typeof value !== 'string') continue;
          value = decodeProtectedEmail(value);
          if (value.startsWith('/www.equalityadvisoryservice.com')) value = `https:/${value}`;
          if (attribute === 'href') value = canonicalInternalPath(value);
          if (
            prefix &&
            value.startsWith('/') &&
            !value.startsWith('//') &&
            !value.startsWith(`${prefix}/`)
          )
            value = `${prefix}${value}`;
          node.properties[attribute] = value;
        }
      }
      for (const child of node.children || []) normalizeLinks(child);
    }
    normalizeLinks(tree);
    transformImportedMarkup(tree, prefix);
  };
}

function nodeText(node) {
  if (node.type === 'text') return node.value;
  return (node.children || []).map(nodeText).join('');
}

function paragraph(node, value) {
  return node?.type === 'element' && node.tagName === 'p' && nodeText(node).trim() === value;
}

function imageParagraph(node) {
  return (
    node?.type === 'element' &&
    node.tagName === 'p' &&
    node.children?.length === 1 &&
    node.children[0].type === 'element' &&
    node.children[0].tagName === 'img'
  );
}

function nextContentIndex(nodes, index) {
  while (index < nodes.length && nodes[index].type === 'text' && !nodes[index].value.trim())
    index += 1;
  return index;
}

function carouselControl(node) {
  if (node?.type !== 'element' || node.tagName !== 'p') return false;
  const text = nodeText(node).trim();
  return text === 'View' || /^\d+\/\d+$/.test(text) || text === '12345';
}

function videoFrame(link) {
  const href = link.properties?.href;
  const label = nodeText(link).trim();
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (
    !['youtube.com', 'www.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(
      url.hostname
    ) ||
    !url.pathname.startsWith('/embed/')
  )
    return null;
  return {
    type: 'element',
    tagName: 'iframe',
    properties: {
      src: href,
      title: label && label.toLowerCase() !== 'view iframe' ? `Video: ${label}` : 'Embedded YouTube video',
      loading: 'lazy',
      referrerPolicy: 'strict-origin-when-cross-origin',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      allowFullScreen: true
    },
    children: []
  };
}

function importedCardGrid(nodes, prefix) {
  const cards = [];
  let index = 0;
  let contentStart = -1;

  while (index < nodes.length) {
    if (contentStart < 0) {
      if (!paragraph(nodes[index], '[')) return null;
      contentStart = index + 1;
    }
    let end = contentStart;
    let match;
    while (end < nodes.length) {
      const text = nodeText(nodes[end]).trim();
      match = /^\]\(([^)]+)\)(\[)?$/.exec(text);
      if (nodes[end].type === 'element' && nodes[end].tagName === 'p' && match) break;
      end += 1;
    }
    if (!match || end === contentStart) return null;
    let href = canonicalInternalPath(match[1]);
    if (prefix && href.startsWith('/') && !href.startsWith('//') && !href.startsWith(`${prefix}/`))
      href = `${prefix}${href}`;
    cards.push({
      type: 'element',
      tagName: 'a',
      properties: { href, className: ['imported-content-card'] },
      children: nodes.slice(contentStart, end)
    });
    if (!match[2]) break;
    index = end;
    contentStart = end + 1;
  }

  if (!cards.length) return null;
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['imported-content-card-grid'] },
    children: cards
  };
}

function faqSection(nodes, start, end) {
  const firstQuestion = nodes.findIndex(
    (node, index) => index > start && index < end && node.type === 'element' && node.tagName === 'h3'
  );
  if (firstQuestion < 0) return null;
  const items = [];
  let index = firstQuestion;
  while (index < end) {
    const question = nodes[index];
    if (question.type !== 'element' || question.tagName !== 'h3') {
      index += 1;
      continue;
    }
    let next = index + 1;
    while (next < end && !(nodes[next].type === 'element' && nodes[next].tagName === 'h3'))
      next += 1;
    items.push({
      type: 'element',
      tagName: 'details',
      properties: { className: ['faq-item'] },
      children: [
        {
          type: 'element',
          tagName: 'summary',
          properties: {},
          children: question.children
        },
        ...nodes.slice(index + 1, next)
      ]
    });
    index = next;
  }
  return {
    type: 'element',
    tagName: 'section',
    properties: { className: ['faq-section'] },
    children: [
      nodes[start],
      ...nodes.slice(start + 1, firstQuestion),
      { type: 'element', tagName: 'div', properties: { className: ['faq-list'] }, children: items }
    ]
  };
}

function transformChildren(nodes, prefix) {
  const cleaned = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (carouselControl(node)) continue;
    if (imageParagraph(node) && node.children[0].properties.alt === 'Image') {
      const next = nextContentIndex(nodes, index + 1);
      const viewIndex = paragraph(nodes[next], 'View') ? next : -1;
      const captionIndex = nextContentIndex(nodes, viewIndex >= 0 ? viewIndex + 1 : next);
      const caption = nodeText(nodes[captionIndex] || {}).trim();
      if (caption) node.children[0].properties.alt = caption;
    }
    if (paragraph(node, '[')) {
      const cards = importedCardGrid(nodes.slice(index), prefix);
      if (cards) {
        cleaned.push(cards);
        let consumed = 1;
        while (index + consumed < nodes.length) {
          const text = nodeText(nodes[index + consumed]).trim();
          const close = /^\]\(([^)]+)\)(\[)?$/.exec(text);
          if (nodes[index + consumed].type === 'element' && nodes[index + consumed].tagName === 'p' && close) {
            consumed += 1;
            if (!close[2]) break;
          } else consumed += 1;
        }
        index += consumed - 1;
        continue;
      }
    }
    if (node.type === 'element' && node.tagName === 'p' && /^•\s*/.test(nodeText(node))) {
      const items = [];
      while (index < nodes.length && nodes[index].type === 'element' && nodes[index].tagName === 'p' && /^•\s*/.test(nodeText(nodes[index]))) {
        const item = nodes[index].children;
        const firstText = item.find((child) => child.type === 'text');
        if (firstText) firstText.value = firstText.value.replace(/^•\s*/, '');
        items.push({ type: 'element', tagName: 'li', properties: {}, children: item });
        index += 1;
      }
      cleaned.push({ type: 'element', tagName: 'ul', properties: {}, children: items });
      index -= 1;
      continue;
    }
    if (
      node.type === 'element' &&
      node.tagName === 'p' &&
      node.children?.length === 1 &&
      node.children[0].type === 'element' &&
      node.children[0].tagName === 'iframe'
    ) {
      cleaned.push({
        type: 'element',
        tagName: 'figure',
        properties: { className: ['video-embed'] },
        children: node.children
      });
      continue;
    }
    if (
      node.type === 'element' &&
      node.tagName === 'h2' &&
      /^frequently asked questions$/i.test(nodeText(node).trim())
    ) {
      let end = index + 1;
      while (end < nodes.length && !(nodes[end].type === 'element' && nodes[end].tagName === 'h2'))
        end += 1;
      const section = faqSection(nodes, index, end);
      if (section) {
        cleaned.push(section);
        index = end - 1;
        continue;
      }
    }
    cleaned.push(node);
  }
  return cleaned;
}

function transformImportedMarkup(node, prefix) {
  if (node.type === 'element' && node.tagName === 'a') {
    const frame = videoFrame(node);
    if (frame) {
      Object.assign(node, frame);
      return;
    }
  }
  if (node.children) {
    node.children = node.children.map((child) => {
      transformImportedMarkup(child, prefix);
      return child;
    });
    node.children = transformChildren(node.children, prefix);
  }
}

/** Recover email addresses obfuscated by the original site's Cloudflare script. */
export function decodeProtectedEmail(value) {
  if (!value.includes('/cdn-cgi/l/email-protection#')) return value;
  const token = value.split('#')[1];
  if (!/^[\da-f]+$/i.test(token) || token.length < 4 || token.length % 2) return value;
  const bytes = Buffer.from(token, 'hex');
  const decoded = Buffer.from(bytes.subarray(1).map((byte) => byte ^ bytes[0])).toString('utf8');
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(decoded.split('?')[0])) return value;
  return `mailto:${decoded}`;
}
