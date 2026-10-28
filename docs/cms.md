# Editing Content

LibraryCommons uses Decap CMS to edit Markdown and JSON files directly in the repository.

## Open The Local Editor

1. Start the Astro development server:

   ```sh
   npm run dev
   ```

2. In a second terminal, start Decap's local file service:

   ```sh
   npx --yes decap-server@3.11.6
   ```

3. Open <http://127.0.0.1:4322/admin/> and click **Login**.

Local edits write directly to your working tree without committing. Stop `decap-server` when finished and never expose it publicly.

## CMS Sections

| Section                 | Controls                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Site Settings           | Site title, header navigation (including submenus), redirects, UI labels, and footer    |
| Commons Homepage        | Hero copy, hero image, section headings, and featured pages                             |
| Editorial Content       | Articles, collections, case studies, grants, conferences, legal pages, and FAQs         |
| Libraries               | Individual library details: address, contacts, opening hours, services, and notes       |
| Library Authorities     | Authority contacts, website, catalogue URL, and country                                 |
| Resources And Downloads | PDFs, slide decks, recordings, external links, and credits                              |
| Conference Sessions     | Session descriptions, speakers, parent conference, and linked resources                 |
| Contributors            | Contributor biographies and profile images                                              |

## Editorial Content

To add a page, create an entry in **Editorial Content**, choose a content type (which selects the [page template](development.md)), and set a unique path such as `/stories/my-library`.

- **Reserved paths:** Do not use `/libraries`, `/resources`, `/sessions`, `/people`, `/admin`, or `/directory.json`.
- **Publish on site:** Unchecking this keeps a page editable in the CMS while removing its public route (used for archived legal notices and the original `/libraries` map page).
- **Content Origin:** Editorial metadata distinguishing original `libraryon` material from new `commons` entries. Pages with a `libraryon.org` source URL default to LibraryOn.
- **Updated Date:** Automatically stamped with today's date when saved in the CMS.
- **Preserved articles:** The 34 original LibraryOn articles are checksum-verified against `migration/source-articles.json`. Add new content as a separate entry rather than editing original article bodies.

## Libraries And Authorities

Each library is stored in `src/content/libraries/<slug>.json` and links to an authority in `src/content/authorities/<slug>.json`.

- **Adding an authority:** Create the authority under **Library Authorities** before assigning libraries to it.
- **Slugs and IDs:** Keep existing slugs and IDs unchanged where possible. If a library's slug or authority changes, add a redirect in **Site Settings**.
- **Opening hours:** Leave a day empty if closed or unknown, and use opening-hours notes for holiday exceptions.
- **Last Reviewed:** Stamped automatically when a library or authority is saved in the CMS.

## Publishing Changes

CMS configuration lives in `public/admin/config.yml`, and uploaded media is stored in `public/uploads/`.

Production CMS editing targets `LibrariesHacked/libraryon-commons` (`main` branch) and requires GitHub OAuth to be configured on the hosting platform (see [Running and Hosting](site.md)).
