# Preserving The Original Material

Normal editing and site builds only use `src/` and `public/`. The files and scripts below preserve the original LibraryOn dataset and verify that imported content remains intact.

## Stored Artefacts

- **`preservation/`** — Three compressed JSON bundles (`content.json.gz`, `data.json.gz`, `templates.json.gz`, ~9.5 MB total) plus SHA-256 checksums in `manifest.json`. See [Original Source Files](../preservation/README.md).
- **`public/uploads/archive/`** — Deduplicated images and PDFs with descriptive filenames. The original SHA-256 checksums remain in the import report and are verified against the file bytes.
- **`migration/`**:
  - `import-report.json` — Maps local filenames to original source URLs and logs import conflicts.
  - `import-state.json` — Checksums protecting manually edited files from being overwritten on re-import.
  - `source-articles.json` — Canonical body hashes for the 34 original LibraryOn articles.
  - `filenames.json` — Maps previous hash-based content and media paths to readable filenames. Original article checksum checks reverse only these recorded asset URL substitutions; their baseline hashes are unchanged.
  - `image-descriptions.json` — Reviewed image descriptions, tied to file checksums and backed by captions or visual checks. Imports reuse these names instead of placeholders such as "Image".
  - `modular-content.json` — Checksums for reference-only page bodies and the compressed snapshot of their pre-modular originals.
- **`archive/`** — Optional local-only raw capture directory (~1.3 GiB), ignored by Git.

## Archive Scripts

Located in `scripts/archive/` and run from the repository root:

| Command                                         | Description                                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run archive -- --api --data-only`          | Download public Strapi API collections (`libraries`, `events`, etc.)                                            |
| `npm run archive -- --assets`                   | Crawl canonical pages and download linked first-party media                                                     |
| `npm run capture -- --mobile`                   | Capture optional Playwright screenshots and HAR responses                                                       |
| `npm run import:archive`                        | Convert raw HTML/API captures into CMS Markdown, JSON, and media                                                |
| `npm run import:archive -- --refresh-markdown`  | Re-run Markdown conversion on managed pages after converter fixes                                               |
| `npm run compact:archive`                       | Pack raw captures from `archive/` into `preservation/*.json.gz`                                                 |
| `node scripts/archive/import-home-carousel.mjs` | Copy the live original homepage hero images in source order, preserving readable filenames and source checksums |

The importer never overwrites library records, site settings, or files modified since import (tracked via `migration/import-state.json`).

The importer reuses the filename mapping and gives new resources, sessions, and uploads descriptive names. `node scripts/migrate-filenames.mjs` previews any remaining legacy filenames; add `--apply` to migrate them and update active references. The migration leaves raw captures and compressed preservation bundles untouched. Asset URLs change with their filenames; the mapping records previous URLs but does not configure hosting redirects.

## Archive Coverage

### Reference-Only FAQs

Editable pages with linked FAQs contain only metadata references, a section heading/introduction, and a `{{faqs}}` insertion marker. Questions and answers live only in `src/content/faqs/`; the renderer does not suppress a second inline copy.

`preservation/modular-source-pages.json.gz` retains the exact pre-modular Markdown as archive evidence, separately from editable content. `migration/modular-content.json` records its checksum and the expected reference-only page-body hashes. Tests verify the archived original bodies against the unchanged `migration/source-articles.json` baselines and reject duplicate inline FAQ questions in editable pages.

`node scripts/archive/extract-faqs.mjs` extracts FAQ entries when needed and replaces inline sections with markers. It reuses existing references, validates their order, preserves introductions, and is a no-op on pages already modularized. Existing FAQ entries are never overwritten by the inline copy.

### Coverage And Resolution Audit

Page-specific layout components are also explicit in editable Markdown: `:::testimonial`, `:::quote`, `::::cards` with `:::card` children, `:::list-panel`, and `::video`. `node scripts/archive/make-content-explicit.mjs` previews conversion of imported legacy layouts; add `--apply` to write the blocks and update verified modular body hashes. The tool preserves pre-modular source snapshots and does not run during site builds. Legacy grouping code exists only in `scripts/archive/legacy-markup.mjs`, never in the application renderer.

Run `node scripts/archive/audit.mjs` for a live first-party coverage audit, or add `--repair` to retain additional evidence and highest-resolution image masters. The command needs the local raw `archive/` as well as network access to the original site. Results are written to `migration/coverage-audit.json`.

The audit compares the live sitemap and reachable editorial links, checks all paginated public datasets, follows page asset dependencies, and inspects page-wide images including banners outside `<main>`. Image candidates include responsive `srcset`/`picture` variants, unwrapped image proxies, CMS format metadata, and links to full-size images. Actual pixel dimensions determine the largest successfully available master; no upscaling or lossy conversion is performed.

The 29 October 2026 audit found no missing canonical editorial entries. All 4,027 sitemap directory routes matched preserved records except the source's broken `/libraries/cornwall/null` URL: Fowey Micro Library is preserved locally, but its source record has no slug. Seven additional successful editorial URLs were redirects to existing pages. Two broken editorial links, the inaccessible alerts endpoint (403), and the retired mobile-libraries endpoint (404) are recorded rather than claimed as complete.

The audit covers 210 image groups and 245 distinct masters, including supporting image dependencies. Of those groups, 137 had larger originals than our earlier published copies. Masters include images up to 8,736 pixels wide. Repair passes added 190 files (about 114 MB); every successfully discovered first-party image dependency now has a master mapping or preserved file. A malformed first-party media link is already recovered through its corrected DigitalOcean storage URL. Third-party and unlinked/private material remain coverage limits.

The original raw collector did capture banner and responsive image bytes, but the smaller content export selected images only inside `<main>`. The homepage hero sits outside that element. Importing default `src` values also missed larger responsive, zoom-linked, and serialized Strapi originals. Image discovery now includes the full document and safely parses embedded public metadata without executing source scripts. These were gaps in extraction and import, not proof that the raw capture was missing all of those files.

New evidence is stored separately in `preservation/audit-pages.json.gz`, `audit-data.json.gz`, and `audit-templates.json.gz`, with checksums in the audit report. The live events dataset changes over time: both the original and new snapshots are retained, including 99 event IDs absent from the original capture, rather than replacing older evidence. The original three preservation bundles and article checksums are unchanged.

`src/data/media-masters.json` maps existing upload paths and source variants to verified original files, dimensions, and checksums. Shared URL helpers and the Markdown renderer resolve this mapping at build time, so preserved article bodies do not need rewriting. Both archive importers use the same original-image selection policy. Existing smaller variants remain available; future display-sized derivatives should be generated from these masters rather than from thumbnails.

- **Captured:** 36 canonical pages, 3,811 libraries (including all scalar fields, UPRNs where present, and nested event tags/occurrences), 218 authorities, 2,553 events, 18 tags, and hosted DigitalOcean Spaces downloads (including Press Play conference slide decks and case studies).
- **External / Not captured:** Outbound YouTube recordings, Canva presentations, unlinked external documents, and private CMS internals.

## Rights And Backup

Original LibraryOn / British Library content is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) **except where otherwise noted**. Keep source URLs, credits, and snapshot dates intact, and verify third-party media rights (photos, logos, fonts, and external documents) before redistribution.
