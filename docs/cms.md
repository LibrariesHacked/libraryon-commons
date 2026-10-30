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

| Section                    | Controls                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Site Settings              | Site title, header navigation (including submenus), redirects, UI labels, and footer |
| Commons Homepage           | Hero copy, hero image, section headings, and featured pages                          |
| Editorial Content          | Articles, collections, case studies, grants, conferences, and legal pages            |
| Frequently Asked Questions | Reusable questions and Markdown answers, selected and ordered on pages               |
| Libraries                  | Individual library details: address, contacts, opening hours, services, and notes    |
| Library Authorities        | Authority contacts, website, catalogue URL, and country                              |
| Resources And Downloads    | PDFs, slide decks, recordings, external links, and credits                           |
| Conference Sessions        | Session descriptions, speakers, parent conference, and linked resources              |
| Contributors               | Contributor biographies and profile images                                           |

## Editorial Content

To add a page, create an entry in **Editorial Content**, choose a content type (which selects the [page template](development.md)), and set a unique path such as `/stories/my-library`.

- **Reserved paths:** Do not use `/libraries`, `/resources`, `/sessions`, `/people`, `/admin`, or `/directory.json`.
- **Publish on site:** Unchecking this keeps a page editable in the CMS while removing its public route (used for archived legal notices and the original `/libraries` map page).
- **Content Origin:** Editorial metadata distinguishing original `libraryon` material from new `commons` entries. Pages with a `libraryon.org` source URL default to LibraryOn.
- **Updated Date:** Automatically stamped with today's date when saved in the CMS.
- **Preserved articles:** The original LibraryOn text is checksum-verified against `migration/source-articles.json`. FAQ-bearing pages now use references instead of inline answers; their pre-modular text is retained in a compressed archive snapshot. Edit questions and answers in the FAQ collection, not in the page body.

## Reusable Content

Create questions under **Frequently Asked Questions**, then select and order them in a page's **FAQs** field. The referenced FAQ files are the only editable source for question and answer text. Answers support Markdown; do not copy them into the page body.

Put `{{faqs}}` on its own line to place the selected FAQs. An optional preceding heading matching **FAQ Heading**, plus any introductory Markdown, becomes the section heading and introduction. Existing linked FAQ pages already use this pattern. Without a marker, the template places FAQs after the body.

The optional `{{resources}}` marker similarly positions selected resources. Resources already linked in the page or its FAQ answers are not repeated. Without a marker, modules appear after the body.

## Explicit Page Blocks

The **Content** editor has **Rich Text** and **Markdown** modes. In Rich Text, use the **+ / Add Component** menu to insert a block. Existing blocks open as the same editable forms, with image pickers and labelled fields; editors do not need to type directive syntax.

| Control                        | Fields                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| Testimonial                    | Name, role, organisation/link, image, alternative text, and quote                  |
| Attributed Quote               | Name, role, organisation/link, and quote                                           |
| Card Grid                      | Repeatable cards with image, heading, text/links, and optional whole-card link     |
| Card                           | A single card using the same fields                                                |
| List Panel                     | Heading, introduction, repeatable items, numbered-list settings, and trailing text |
| YouTube Video                  | Embed URL and accessible title                                                     |
| Linked FAQs / Linked Resources | Insert the selected page metadata references at this position                      |

Select FAQ and resource entries in their normal page fields. The insertion shortcuts place a marker; they do not copy the linked content. A whole-card link cannot be combined with links inside that card's text.

For cards that lead to one page, use **Whole-Card Link** and ordinary text rather than a separate text link. The image, heading, and text then form one keyboard-accessible link with the same arrow and responsive layout as editorial listing cards. Informational cards without a destination are deliberately unbordered.

Switch to Markdown to inspect or directly edit the saved syntax below. Both modes use the same explicit Markdown in the repository; no separate CMS content copy is created. Component boundaries remain explicit, and the renderer never guesses a testimonial from adjacent paragraphs or selects a panel based on heading text.

For a quote with an image, put the attribution in the block attributes and the image and quote inside the block:

```md
:::testimonial{author="Tracy" role="Children & Youth Librarian" organisation="Wiltshire Libraries" url="/libraries/wiltshire"}

![Tracy reading to children.](/uploads/tracy.jpg)

> Bring your little ones to rhyme time.

:::
```

Use `:::quote{author="Alex" role="Customer, Sandwell Libraries"}` for a quote without an image. An author is required. `role`, `organisation`, and its `url` are optional; do not repeat the attribution as separate paragraphs.

Wrap a heading and ordinary Markdown list in a list panel:

```md
:::list-panel

## At your library

- Borrow books
- Learn new skills

:::
```

Card grids have an explicit outer container and one block per card. The outer container uses four colons so it can contain three-colon blocks:

```md
::::cards

:::card{href="/reading/reading-in-libraries"}

![Reading group.](/uploads/reading-group.jpg)

### Reading together

Books, stories, and reading groups for all ages.

:::

::::
```

Use `:::card{href="/reading"}` only for a whole-card link with no other links inside it. Videos use `::video{src="https://www.youtube.com/embed/VIDEO_ID" title="Library film"}` on its own line.

Each video also has a **Watch on YouTube** link. Some embedded webviews, including the VS Code integrated browser in this environment, can abort third-party iframe navigation and leave the player blank even when it works in a regular browser. The direct link remains available when embedded playback is blocked.

Unknown blocks, missing required data, and unsafe links fail the build with an error. Plain blockquotes, paragraphs, headings, lists, and video links remain plain Markdown. These blocks are page-specific content; keep shared questions and answers in the FAQ collection instead of copying them.

## File Names

FAQ filenames come from their questions; resource and session filenames come from their titles. Imported slide decks use session titles, and images use alt text or other source metadata. Names are lowercase, hyphenated ASCII, with numeric suffixes for collisions. Libraries, authorities, and page filenames already use descriptive names.

New image names use a short phrase from the first sentence: up to ten words and 64 characters, keeping whole words and useful `original`/`master` suffixes. Numeric collision suffixes may add a few characters. Full alternative text stays in the content; it is not truncated. `node scripts/migrate-filenames.mjs --apply` updates long legacy image paths and all active references without changing file bytes.

Markdown list markers use one space (`- Item`), including HTML imports and CMS output. `node scripts/normalize-content.mjs` previews old-list formatting and single-destination card conversions; add `--apply` to update content and its preservation checksums. Nested lists and code blocks are handled structurally rather than by a blanket text replacement.

Use a descriptive filename before uploading new images or documents, and provide useful alt text for images. Changing a title does not rename its existing file. Page URLs come from the **Path** field, independently of filenames. Resource and FAQ relations use filename stems, so do not manually rename their files without updating references. The recorded migration and preservation checks are described in [Preserving The Original Material](preservation.md).

## Libraries And Authorities

Each library is stored in `src/content/libraries/<slug>.json` and links to an authority in `src/content/authorities/<slug>.json`.

- **Adding an authority:** Create the authority under **Library Authorities** before assigning libraries to it.
- **Slugs and IDs:** Keep existing slugs and IDs unchanged where possible. If a library's slug or authority changes, add a redirect in **Site Settings**.
- **Opening hours:** Leave a day empty if closed or unknown, and use opening-hours notes for holiday exceptions.
- **Last Reviewed:** Stamped automatically when a library or authority is saved in the CMS.

## Publishing Changes

CMS configuration lives in `public/admin/config.yml`, and uploaded media is stored in `public/uploads/`.

Production CMS editing targets `LibrariesHacked/libraryon-commons` (`main` branch) and requires GitHub OAuth to be configured on the hosting platform (see [Running and Hosting](site.md)).
