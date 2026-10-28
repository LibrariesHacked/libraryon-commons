# Original Source Files

This folder contains deterministic, compressed snapshots of the original LibraryOn material, tracked in standard Git without Git LFS.

## Bundles

| File                | Contents                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `content.json.gz`   | Structured records for all 36 captured pages (sanitised HTML, headings, links, and metadata)  |
| `data.json.gz`      | Complete public API exports (`libraries.json`, `authorities.json`, `events.json`, `tags.json`)|
| `templates.json.gz` | Representative raw HTML pages and first-party CSS, fonts, and JS (base64-encoded with SHA-256)|
| `manifest.json`     | SHA-256 checksums and byte sizes for each bundle                                              |

Imported images and PDFs are stored once (deduplicated by SHA-256) in `public/uploads/archive/` and mapped to source URLs in `migration/import-report.json`.

## Inspect And Verify

Inspect a bundle and verify checksums against `manifest.json`:

```sh
gzip -dc preservation/data.json.gz | less
shasum -a 256 preservation/*.json.gz
```

To regenerate the bundles from a local `archive/` directory:

```sh
npm run compact:archive
```

## Omissions

To stay compact (~9.5 MB), these bundles omit full browser HAR logs, screenshots, resized Next.js image variants, and per-page API pagination responses. See [Preserving The Original Material](../docs/preservation.md) for full details on archive scope and licensing.
