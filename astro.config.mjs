import { defineConfig } from "astro/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { unified } from "@astrojs/markdown-remark";
import settings from "./src/data/settings.json" with { type: "json" };
import { preservedLinks } from "./src/lib/markdown.mjs";
import remarkDirective from "remark-directive";
import { contentDirectives } from "./src/lib/content-directives.mjs";

const base = process.env.BASE_PATH || "/";
const rendererHash = createHash("sha256");
for (const file of ["content-directives.mjs", "markdown.mjs", "site.mjs"])
  rendererHash
    .update(readFileSync(new URL(`./src/lib/${file}`, import.meta.url)))
    .update("\0");
const rendererDigest = rendererHash.digest("hex");

export default defineConfig({
  output: "static",
  devToolbar: { enabled: false },
  site: process.env.SITE_URL || settings.site.url || undefined,
  base,
  redirects: Object.fromEntries(
    settings.redirects.map((redirect) => [redirect.from, redirect.to]),
  ),
  markdown: {
    processor: unified({
      remarkPlugins: [remarkDirective, contentDirectives],
      rehypePlugins: [[preservedLinks, { base, rendererDigest }]],
    }),
  },
  trailingSlash: "ignore",
});
