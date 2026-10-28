# LibraryCommons

A community website for library stories, resources and listings, built on content
originally published by LibraryOn. The original articles keep their wording and
credits. New content and library details can be edited in the browser with Decap
CMS. Astro turns the content files into a static website. No Git LFS is used.

## Start Here

- [Edit content](docs/cms.md): articles, individual libraries, authorities and settings.
- [Run and host the site](docs/site.md): local development, builds and deployment.
- [Change templates and code](docs/development.md): how pages are assembled.
- [Preserve the originals](docs/preservation.md): optional archive tools and source files.

The original import contains 34 editorial pages, local media/downloads, conference
records and library/authority snapshots. The living directory starts with 3,811
listings and 218 authorities, now editable in Decap. New community articles and
library records can be added without modifying the original articles.
Public hosting and production CMS authentication are not configured yet.

## Folder Guide

```text
src/
  content.config.ts         Astro schemas for CMS content collections
  pages/                    Static routes: articles, directory, resources and CMS
  layouts/                  Shared site shell, metadata, navigation and footer
  templates/                Named presentation templates for each content type
  components/               Reusable content cards and resource links
  styles/                   Responsive styles and bundled local fonts
  lib/                      URL helpers, Markdown conversion and directory search
  content/
    pages/                  Editable Markdown pages and articles
    resources/              JSON download and external-link records
    sessions/               JSON conference sessions and resource relationships
    contributors/           Community contributor profiles
    authorities/            Individually editable library services/authorities
    libraries/              One JSON file per library, linked to its authority
  data/
    settings.json           CMS-managed identity, navigation and directory settings
    homepage.json           CMS-managed homepage copy, image and featured pages
public/
  admin/                    Decap collection configuration, served at /admin/config.yml
  uploads/                  Repository-hosted CMS uploads
    archive/                Deduplicated imported images and downloadable files
preservation/               Three compressed source bundles, manifest and guide
migration/
  import-report.json        Source mappings, unresolved URLs and import conflicts
  import-state.json         Checksums protecting author edits on reimport
  source-articles.json      Original article body fingerprints; do not regenerate
archive/                    Optional raw captures; local-only and ignored by Git
scripts/archive/            Optional collection, import and compression tools
tests/                      Automated checks for code, content and local files
docs/                       Short guides to editing, hosting, code and preservation
node_modules/               Installed dependencies; generated and ignored by Git
dist/                       Generated deployable static site; ignored by Git
.astro/                     Generated Astro types/cache; ignored by Git
```

The root holds this README, the software licence, package files, Astro configuration
and Git ignore rules. The optional archive tools are in `scripts/archive/`:

| Script                                     | Responsibility                                              |
| ------------------------------------------ | ----------------------------------------------------------- |
| [collect.mjs](scripts/archive/collect.mjs) | Save original pages, API records and linked files           |
| [capture.mjs](scripts/archive/capture.mjs) | Save optional browser screenshots and responses             |
| [import.mjs](scripts/archive/import.mjs)   | Convert original articles and resources into editable files |
| [compact.mjs](scripts/archive/compact.mjs) | Compress original material for storage                      |

All tests live in `tests/`. Normal content editing does not require the archive tools.
Keep the files in `migration/`; they protect original articles and existing edits.
To intentionally refresh imported Markdown after a converter cleanup, run
`npm run import:archive -- --refresh-markdown`; only previously managed page files
are replaced, and the original source captures remain unchanged.

## Development

Use Node.js 22.23.4 or later. Run these commands from the project folder. The
site builds from the files already in Git; it does not need the raw archive.

```sh
npm ci
npm test
npm run dev
```

Open <http://127.0.0.1:4322/>. For local CMS editing at `/admin/`, also start the
file service described in [the editing guide](docs/cms.md#open-the-local-editor). Use `npm run build` to generate
`dist/`; `npm run preview` serves that production build. See the
[hosting guide](docs/site.md) for deployment and subfolder settings.

## Reviewing Changes

Review scripts, CMS forms and docs separately from content. Articles are Markdown;
libraries, authorities, resources and sessions are JSON. Identical imported images
and downloads share one file. The import report links filenames to source URLs.

`npm test` checks code, local files, content links and original article checksums.
It does not replace checking wording, image rights or page appearance. Tests do
not need live services or the ignored raw archive.

## Storage And Rights

The compressed originals total about 9.5 MB. Most media storage is PDFs. Each of
the 3,811 libraries and 218 authorities has its own file for straightforward CMS
editing. This means more small files, but no grouped lists or duplicate directory
snapshots. The optional 1.3 GiB raw capture folder is not included in Git.

Original LibraryOn content is CC BY 4.0 **except where otherwise noted**. Retain
credits, source links and snapshot dates; review third-party and privacy exceptions
before publishing. See [the preservation guide](docs/preservation.md#rights-and-backup).
The [software licence](LICENSE) is separate from the archived content licence.
