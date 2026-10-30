import { canonicalInternalPath, mediaURL } from './site.mjs';

export function preservedLinks({ base = '/' } = {}) {
  const prefix = base.replace(/\/$/, '');
  return (tree) => {
    function normalizeLinks(node) {
      if (node.type === 'element' && node.properties) {
        if (node.tagName === 'img' && /^https?:/.test(node.properties.src || '')) {
          node.tagName = 'a';
          node.children = [{ type: 'text', value: node.properties.src ? node.properties.alt || 'Original image' : 'Original image' }];
          node.properties = { href: node.properties.src };
        }
        for (const attribute of ['href', 'src', 'poster']) {
          let value = node.properties[attribute];
          if (typeof value !== 'string') continue;
          value = decodeProtectedEmail(value);
          value = mediaURL(value);
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
  };
}

export function decodeProtectedEmail(value) {
  if (!value.includes('/cdn-cgi/l/email-protection#')) return value;
  const token = value.split('#')[1];
  if (!/^[\da-f]+$/i.test(token) || token.length < 4 || token.length % 2) return value;
  const bytes = Buffer.from(token, 'hex');
  const decoded = Buffer.from(bytes.subarray(1).map((byte) => byte ^ bytes[0])).toString('utf8');
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(decoded.split('?')[0])) return value;
  return `mailto:${decoded}`;
}
