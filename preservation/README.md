# Original Source Files

This folder is a historical backup of original LibraryOn pages, public directory data, and examples of the original site’s design. The live LibraryCommons site does not need these files to run. They are kept so maintainers can check where imported material came from and recover it if needed.

## What Is Preserved

Each backup file is compressed to save space. The filenames describe what is inside:

| File | Contents |
| --- | --- |
| `content.json.gz` | Text, headings, links, and details from 36 captured pages |
| `data.json.gz` | Public records about libraries, authorities, events, and tags |
| `templates.json.gz` | Examples of the original pages, styles, fonts, and scripts |
| `manifest.json` | File sizes and fingerprints used to check that backups have not changed |

Imported images and PDFs are stored separately in `public/uploads/archive/`. A list in `migration/import-report.json` connects each saved file to its original address. A checksum is a digital fingerprint used to tell whether a file has changed.

## For Maintainers

You do not need to open these backups to edit the live website. To inspect one backup or check its fingerprint against the manifest:

```sh
gzip -dc preservation/data.json.gz | less
shasum -a 256 preservation/*.json.gz
```

To rebuild the backup bundles from a local `archive/` folder:

```sh
npm run compact:archive
```

## Omissions

The backups are about 9.5 MB. They do not include browser request logs, screenshots, every resized copy of each image, or every page of the original data downloads. See [Preserving The Original Material](../docs/preservation.md) for details about what was collected and the content rights.
