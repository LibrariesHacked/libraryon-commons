# LibraryCommons

A static community website for UK library stories, resources, and directory listings, built on content originally published by LibraryOn.

Original articles retain their wording and credits, while new community articles and library listings (3,811 libraries across 218 authorities) can be edited in the browser with Decap CMS and built with Astro.

## Getting Started

### Documentation

- **[Editing Content](docs/cms.md)** — Using Decap CMS to manage articles, libraries, authorities, and site settings.
- **[Running and Hosting](docs/site.md)** — Local development, production builds, and static deployment.
- **[Code and Templates](docs/development.md)** — Routes, templates, components, and directory data model.
- **[Preservation](docs/preservation.md)** — Archived LibraryOn source bundles and optional import scripts.

### Prerequisites

- **Node.js** `22.23.4` or later

The site builds directly from tracked repository files; raw archive captures are not required.

### Installing

Install dependencies and start the local dev server:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4322/>.

To use the local CMS editor at <http://127.0.0.1:4322/admin/>, run the Decap local backend in a second terminal (see [Editing Content](docs/cms.md#open-the-local-editor)):

```sh
npx --yes decap-server@3.11.6
```

### Folder Guide

```text
src/
  content.config.ts         Astro schemas for CMS content collections
  pages/                    Routes for articles, directory, resources, and CMS
  layouts/                  Shared site shell, navigation, and footer
  templates/                Page templates by content type
  components/               Reusable UI components
  styles/                   Stylesheets and bundled local fonts
  lib/                      URL helpers, Markdown plugins, and directory search
  content/
    pages/                  Editorial Markdown pages and articles
    resources/              Downloadable files and external resource records (JSON)
    sessions/               Conference session records (JSON)
    contributors/           Contributor profiles (JSON)
    authorities/            Library authorities (JSON)
    libraries/              Individual library records (JSON)
  data/
    settings.json           Site navigation, labels, and footer configuration
    homepage.json           Homepage copy, hero image, and featured pages
public/
  admin/                    Decap CMS configuration (/admin/config.yml)
  uploads/                  CMS media uploads and deduplicated archive assets
preservation/               Compressed original LibraryOn source bundles (.json.gz)
migration/                  Import report and SHA-256 checksum safeguards
scripts/archive/            Optional collection, capture, import, and compaction scripts
tests/                      Automated test suite
docs/                       Project documentation
```

## Running the Tests

Run the automated test suite:

```sh
npm test
```

### Automated Checks

`npm test` validates CMS schemas, internal links, uploaded asset references, directory routes and search, Markdown conversion, and SHA-256 checksums for the 34 preserved LibraryOn articles. It runs entirely offline without raw archive files.

### Manual Review

Review code, CMS configuration, and documentation changes separately from content edits. Automated tests do not replace checking editorial wording, image rights, or visual layout.

## Deployment

Build and preview the production static site (`dist/`):

```sh
npm run build
npm run preview
```

See [Running and Hosting](docs/site.md) for static host requirements, `SITE_URL` / `BASE_PATH` environment variables, and GitHub OAuth setup for production CMS editing.

## Built With

- [Astro](https://astro.build/) — Static site generator
- [Decap CMS](https://decapcms.org/) — Git-backed browser CMS
- [Node.js](https://nodejs.org/) — Runtime and test runner (`node --test`)
- [Turndown](https://github.com/mixmark-io/turndown), [Cheerio](https://cheerio.js.org/) & [sanitize-html](https://github.com/apostrophecms/sanitize-html) — Archive HTML-to-Markdown pipeline
- [Playwright](https://playwright.dev/) — Optional browser capture tool

## Contributing

Read [Editing Content](docs/cms.md) and [Code and Templates](docs/development.md) before submitting changes:

- Keep existing filenames, IDs, and URL slugs stable so cross-references and public URLs do not break.
- Do not edit the 34 original LibraryOn article bodies tracked in `migration/source-articles.json`; add new work as separate entries.

## Versioning

All code, content, and media are tracked in standard Git without Git LFS. Checksums in `migration/` and `preservation/manifest.json` protect original articles, author edits, and compressed archive bundles.

## Authors

- **Libraries Hacked** — *Development and maintenance* — [LibrariesHacked](https://github.com/LibrariesHacked)
- **LibraryOn / British Library** — *Original articles, resources, and directory dataset*

## License

- **Software:** Licensed under the [MIT License](LICENSE).
- **Content:** Original LibraryOn material is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) **except where otherwise noted**. Retain source credits, links, and snapshot dates, and check third-party media rights before reuse. See [Preservation — Rights and Backup](docs/preservation.md#rights-and-backup).

## Acknowledgments

- LibraryOn and the British Library for the original editorial articles, conference resources, and UK public library directory data.
- Community contributors, speakers, and library services represented across the site.
