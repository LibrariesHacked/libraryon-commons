# Preserving original content

The files and scripts below preserve the original LibraryOn dataset and verify that imported content remains intact.

## Stored artefacts

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

## Archive scripts

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

## Reviewing changes

New CMS edits are saved as GitHub pull requests rather than published directly. The repository's `CODEOWNERS` file assigns maintainer review to the original LibraryOn articles, imported FAQs and resources, archived uploads, and preservation records. New community uploads go to `public/uploads/community/`, separate from archived media.

The pull-request workflow runs `npm test` and `npm run build`. 

Local CMS editing uses the local file service and writes to the working tree for testing; it does not create GitHub pull requests.

The importer reuses the filename mapping and gives new resources, sessions, and uploads descriptive names. `node scripts/migrate-filenames.mjs` previews any remaining legacy filenames; add `--apply` to migrate them and update active references. The migration leaves raw captures and compressed preservation bundles untouched. Asset URLs change with their filenames; the mapping records previous URLs but does not configure hosting redirects.

## Archive coverage

### Reference-Only FAQs

Editable pages with linked FAQs contain only metadata references, a section heading/introduction, and a `{{faqs}}` insertion marker. Questions and answers live only in `src/content/faqs/`.

`preservation/modular-source-pages.json.gz` retains the exact pre-modular Markdown as archive evidence, separately from editable content. `migration/modular-content.json` records its checksum and the expected reference-only page-body hashes. Tests verify the archived original bodies against the unchanged `migration/source-articles.json` baselines and reject duplicate inline FAQ questions in editable pages.

`node scripts/archive/extract-faqs.mjs` extracts FAQ entries when needed and replaces inline sections with markers. It reuses existing references, validates their order, preserves introductions, and is a no-op on pages already modularized. Existing FAQ entries are never overwritten by the inline copy.

## Rights

Original LibraryOn / British Library content is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) **except where otherwise noted**. Keep source URLs, credits, and snapshot dates intact, and verify third-party media rights (photos, logos, fonts, and external documents) before redistribution.
