# LibraryCommons

LibraryCommons brings together stories, resources, and information about public libraries across the UK. It includes original LibraryOn articles, community-written content, and a directory of 3,811 libraries across 218 authorities.

You can browse the site using the [site map](/sitemap/) or add and update content in the browser editor. Changes are saved for review before they appear on the public site.

## Using The Editor

Open the public site’s **Content management** link, or go to `/admin/`. The site footer links to a public editing guide that explains common tasks in plain English. The repository’s [CMS guide](docs/cms.md) includes detailed examples for special content such as galleries and book recommendations.

Site menus, footer links, and template text can be edited in **Site Settings**. New images and documents belong to community uploads. Original LibraryOn material and archive files are kept separate and receive maintainer review.

## Project Guides

- [Editing content](docs/cms.md) explains the editor, page types, and special content controls.
- [Running the site](docs/site.md) explains how to start a local preview and publish the site.
- [How the site is built](docs/development.md) describes the parts that developers may need to change.
- [Preserving original material](docs/preservation.md) explains the archive, rights, and review safeguards.

## For Maintainers

The public website is generated from files stored in this repository. This is called a **static site**: visitors receive ready-made pages and the site does not need a database to serve them. Astro creates the pages, and Decap CMS provides the browser editor.

To run a local copy, install Node.js `22.23.4` or later, then run:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4322/>. To use the local editor, start Decap’s local file service in another terminal as described in [the CMS guide](docs/cms.md#open-the-local-editor).

Before publishing changes, run the checks and build:

```sh
npm test
npm run build
```

Automated checks verify content relationships and preserved records. They do not replace a person’s review of wording, image credits, and rights. Original LibraryOn material is shared under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) unless a page says otherwise; the software uses the [MIT License](LICENSE).

New CMS drafts become pull requests. In GitHub, repository administrators must require the **Tests and build** check and maintainer approval before merging; see [preservation and review](docs/preservation.md#reviewing-changes).
