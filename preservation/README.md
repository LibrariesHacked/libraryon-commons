# Original Source Files

This folder keeps compressed copies of the original LibraryOn material. It is
separate from editable Commons content and uses ordinary Git, not Git LFS.

## Contents

| Bundle              | Contents                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `content.json.gz`   | Original structured records for all 36 captured canonical pages, including rich HTML, text, image metadata and links           |
| `data.json.gz`      | Original public API exports, keyed by their saved JSON filenames                                                               |
| `templates.json.gz` | Original HTML for the representative library and authority pages, plus archived first-party CSS, fonts and compiled JavaScript |

The media files are not included again: keep `public/uploads/archive/` and
`migration/import-report.json` alongside this directory. The importer already
deduplicated those files by content checksum. CMS-editable Markdown/JSON and
library records are kept separately in `src/content/`.

Templates are preservation evidence, not original frontend source or ready-made
Astro components. Each template object has a source URL, content type, SHA-256
checksum and a base64-encoded body. CSS URLs still refer to the original site.

## Inspect And Verify

Read a bundle with any gzip/JSON tool. For example, on macOS:

```sh
gzip -dc preservation/data.json.gz | less
shasum -a 256 preservation/*.json.gz
```

Compare the hashes with `manifest.json`. Decode a template object's `body` from
base64 to recover its original file bytes; verify those against its `sha256`.
The bundles preserve their records without lossy field filtering.

Regenerate from a local raw capture folder using:

```sh
npm run compact:archive
```

The compactor validates template object checksums and rejects bundles larger
than a conservative 45 MiB budget. Generated output is deterministic for the
same source. It never deletes or changes the raw captures. These bundles are
not a replacement for the raw collector's folder layout. Normal editing and site
builds use `src/` and `public/`; a fresh checkout does not need the archive importer.

See [the preservation guide](../docs/preservation.md) for commands, coverage and rights.

## Deliberate Omissions

HARs, screenshots, duplicate HTML page captures, individual API pagination
responses and resized image variants are not copied into these bundles. Their
content/data equivalents and representative template evidence are retained.
The optional 1.3 GiB raw capture folder remains on disk but is excluded from Git.
Nothing has been committed or uploaded by the compaction command.

External video recordings, the Canva presentation and some externally hosted
documents remain references, not local copies. Original CMS source, unlinked
pages and unreferenced uploads were not available through this public capture.
Retain source attribution and review third-party rights before redistribution.
