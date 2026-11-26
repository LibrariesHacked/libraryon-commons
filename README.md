# LibraryCommons

LibraryCommons brings together stories, resources, and information about public libraries across the UK. It includes original articles from the British Library's LibraryOn team, community-written content, and a directory of library buildings and local authority services. Browse the public site using the [site map](https://librarycommons.org.uk/sitemap/).

## Get started

You need Node.js `22.23.4` or later. From the project folder, install dependencies and start the local site:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4322/>. The development server rebuilds the site as you edit files; it does not publish changes. See [local development](docs/site.md#local-development) for details. To test Decap CMS locally, follow [open the local editor](docs/cms.md#running-the-editor-locally).

Before sharing code changes, run the tests and make a production build:

```sh
npm test
npm run build
```

The build writes the public site to `dist/`. See [testing](docs/development.md#testing) for what the test suite checks.

## Where things live

| Folder or file                                          | What it contains                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/content/pages/` and other `src/content/` folders   | Editable Markdown pages, FAQs, resources, contributors, and other content |
| `src/content/libraries/` and `src/content/authorities/` | Individual JSON records for library branches and local authority services |
| `src/data/`                                             | Site settings, schemas, and lookup data used by the site and CMS          |
| `src/pages/`                                            | Astro routes: these connect URLs to the content and page templates        |
| `src/templates/`, `src/components/`, and `src/layouts/` | Reusable page structures, visual parts, and shared page shells            |
| `src/lib/`                                              | Shared content, directory, CMS, and site logic                            |
| `scripts/` and `tests/`                                 | Maintenance tools and automated checks                                    |
| `docs/`                                                 | Guides for editing, development, hosting, and project conventions         |

The [content and data pipeline guide](docs/content-pipeline.md) explains how these parts fit together. Directory records follow the [Public library data schemas](https://schema.librarydata.uk/); migration evidence and review procedures are documented in the [directory migration guide](migration/directory/README.md).

## How publishing works

1. Editors use Decap CMS and sign in through Netlify Identity. Git Gateway saves their changes to this repository; editors do not need GitHub accounts.
2. GitHub Actions checks changes and builds the site. On the `main` branch, it publishes the public website to GitHub Pages and a separate CMS-only bundle to Netlify.
3. The public website is static files. Netlify hosts the editor and its CMS support, not the public website.

See [running and hosting the site](docs/site.md) for setup details and [the CMS guide](docs/cms.md) for editing instructions.

## Documentation

- [Editing content and directory records](docs/cms.md)
- [Running the site and tests](docs/site.md)
- [How content becomes web pages](docs/content-pipeline.md)
- [Code structure and coding standards](docs/development.md) and [coding standards](docs/coding-standards.md)
- [Reviewing changes and preserving original material](docs/preservation.md)

## Built with

- [Astro](https://astro.build/)
- [Decap CMS](https://decapcms.org/)

## License

The software is licensed under the [MIT License](LICENSE). Original LibraryOn material is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) unless otherwise stated. See [preserving the original material](docs/preservation.md) for source and rights information.

Thanks to the original LibraryOn and British Library contributors whose material is preserved in this project, and to everyone contributing new content.
