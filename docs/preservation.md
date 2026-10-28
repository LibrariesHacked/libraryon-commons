# Preserving The Original Material

Normal editing and site builds only use `src/` and `public/`. The files and scripts below preserve the original LibraryOn dataset and verify that imported content remains intact.

## Stored Artefacts

- **`preservation/`** — Three compressed JSON bundles (`content.json.gz`, `data.json.gz`, `templates.json.gz`, ~9.5 MB total) plus SHA-256 checksums in `manifest.json`. See [Original Source Files](../preservation/README.md).
- **`public/uploads/archive/`** — Deduplicated images and PDFs named by SHA-256 hash.
- **`migration/`**:
  - `import-report.json` — Maps local filenames to original source URLs and logs import conflicts.
  - `import-state.json` — Checksums protecting manually edited files from being overwritten on re-import.
  - `source-articles.json` — Canonical body hashes for the 34 original LibraryOn articles.
- **`archive/`** — Optional local-only raw capture directory (~1.3 GiB), ignored by Git.

## Archive Scripts

Located in `scripts/archive/` and run from the repository root:

| Command                                           | Description                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `npm run archive -- --api --data-only`            | Download public Strapi API collections (`libraries`, `events`, etc.) |
| `npm run archive -- --assets`                     | Crawl canonical pages and download linked first-party media       |
| `npm run capture -- --mobile`                     | Capture optional Playwright screenshots and HAR responses         |
| `npm run import:archive`                          | Convert raw HTML/API captures into CMS Markdown, JSON, and media  |
| `npm run import:archive -- --refresh-markdown`    | Re-run Markdown conversion on managed pages after converter fixes |
| `npm run compact:archive`                         | Pack raw captures from `archive/` into `preservation/*.json.gz`   |

The importer never overwrites library records, site settings, or files modified since import (tracked via `migration/import-state.json`).

## Archive Coverage

- **Captured:** 36 canonical pages, 3,811 libraries (including all scalar fields, UPRNs where present, and nested event tags/occurrences), 218 authorities, 2,553 events, 18 tags, and hosted DigitalOcean Spaces downloads (including Press Play conference slide decks and case studies).
- **External / Not captured:** Outbound YouTube recordings, Canva presentations, unlinked external documents, and private CMS internals.

## Rights And Backup

Original LibraryOn / British Library content is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) **except where otherwise noted**. Keep source URLs, credits, and snapshot dates intact, and verify third-party media rights (photos, logos, fonts, and external documents) before redistribution.
