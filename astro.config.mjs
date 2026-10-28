import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import settings from './src/data/settings.json' with { type: 'json' };
import { preservedLinks } from './src/lib/markdown.mjs';

const base = process.env.BASE_PATH || '/';

export default defineConfig({
  output: 'static',
  devToolbar: { enabled: false },
  site: process.env.SITE_URL || settings.site.url || undefined,
  base,
  redirects: Object.fromEntries(settings.redirects.map((redirect) => [redirect.from, redirect.to])),
  markdown: { processor: unified({ rehypePlugins: [[preservedLinks, { base }]] }) },
  trailingSlash: 'ignore'
});
