# Editing Content

LibraryCommons uses Decap CMS to edit Markdown and JSON files directly in the repository.

Editors can also use the public **Editing guide** linked from the site footer. It explains common tasks without requiring repository knowledge.

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

### Navigation And Page Hierarchy

Header navigation and page structure are maintained separately:

- **Site Settings → Navigation** controls the header menu. Point a section's URL at its published landing page; submenu URLs should match the pages' Site Paths.
- **Site Path** determines sitemap nesting and breadcrumb ancestors. A section appears as a linked ancestor only when a published page exists at that path.
- **Subpages** selects and orders the cards shown on a landing page. It does not create routes or change sitemap nesting.

For example, the Archive menu links to the `/archive/` landing page, whose Subpages list contains pages with paths under `/archive/`. When changing a live Site Path, add a redirect in Site Settings so existing links continue to work.

## Review And Preserved Material

Production CMS edits are saved as draft pull requests. A maintainer reviews the changes before they are merged and published. The repository runs its tests and builds the site for each pull request. GitHub must also be configured to require the **Tests and build** check and code-owner approval on `main`; see [reviewing changes](preservation.md#reviewing-changes).

The original LibraryOn articles, imported FAQs and resources, archive uploads, and preservation records are assigned to maintainer review in `.github/CODEOWNERS`. New CMS uploads are stored in `public/uploads/community/`, not alongside `public/uploads/archive/`.

When using the local editor, saves write to your working copy only. They do not create a pull request or publish the change.

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
| Collection Image               | Image, alternative text, layout, zoom control, and caption                         |
| Collection Carousel            | Type and accessible label; slides and notes are written in Markdown                |
| Collection Accordion           | Accessible label; entries are written in Markdown                                 |
| Editorial Aside                | Heading and layout; aside text is written in Markdown                             |
| Book Recommendations           | Section title; covers and descriptions are written in Markdown                    |
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

## Special Collection Controls

The editor presents the outer component as a form. For slides, accordion entries, aside text, and book lists, its **Markdown** field contains the inner items. Keep each slide’s image and notes together and each book’s cover, description, and details inside the same item.

### Image and Carousel

Choose **Full** for a lead image, **Inset** for an image alongside article text, or a float when it belongs beside nearby paragraphs. Captions and credits go inside the image block.

```md
:::collection-image{layout="full" zoom="true"}

![Circus posters and a scrapbook.](/uploads/community/circus-posters.jpg)

Posters from the local history collection. Credit: Example Library.

:::
```

An image carousel has one `slide` block per image. A hotspot carousel places each hotspot inside the slide it describes. The `x` and `y` values are percentages measured from the left and top edges of the image.

```md
:::::collection-carousel{kind="hotspots" label="Historic poster"}

::::slide

![An 1844 circus poster.](/uploads/community/circus-poster.jpg)

:::hotspot{title="Performance date" x="65" y="22"}

The poster advertises a performance on 22 August 1844.

:::

::::

:::::
```

### Accordion and Aside

Use one `accordion-item` per topic. An aside has one heading and should contain only information that helps readers understand the nearby article text.

```md
::::collection-accordion{label="Local history resources"}

:::accordion-item{title="Newspapers"}

The library keeps local newspaper issues in its study collection.

:::

::::
```

### Book Recommendations

Use one `recommendation-item` per book. Put the cover and its description inside that item; the selected description opens beside its matching cover.

```md
::::::collection-recommendations{title="Books about circus history"}

:::::recommendation-item{title="A History of the Circus" author="Alex Example" year="2020"}

![Cover of A History of the Circus.](/uploads/community/circus-book.jpg)

A short description of the book.

:::::

::::::
```

The editor’s form handles the component boundary. You should only need to edit this inner Markdown for slides, notes, accordion entries, asides, and recommendations.

Unknown blocks, missing required data, and unsafe links fail the build with an error. Plain blockquotes, paragraphs, headings, lists, and video links remain plain Markdown. These blocks are page-specific content; keep shared questions and answers in the FAQ collection instead of copying them.

## File Names

FAQ filenames come from their questions; resource and session filenames come from their titles. Imported slide decks use session titles, and images use alt text or other source metadata. Names are lowercase, hyphenated ASCII, with numeric suffixes for collisions. Libraries, authorities, and page filenames already use descriptive names.

New image names use a short phrase from the first sentence: up to ten words and 64 characters, keeping whole words and useful `original`/`master` suffixes. Numeric collision suffixes may add a few characters. Full alternative text stays in the content; it is not truncated. `node scripts/migrate-filenames.mjs --apply` updates long legacy image paths and all active references without changing file bytes.

Markdown list markers use one space (`- Item`), including HTML imports and CMS output. `node scripts/normalize-content.mjs` previews old-list formatting and single-destination card conversions; add `--apply` to update content and its preservation checksums. Nested lists and code blocks are handled structurally rather than by a blanket text replacement.

Use a descriptive filename before uploading new images or documents, and provide useful alternative text for images. New files go into the community uploads folder. Changing a resource title does not rename its existing file or change its ID. Give repeated links enough detail to tell them apart, such as a programme round or session name. The resource pages show where each item is used. Page URLs come from the **Path** field, independently of filenames. Resource and FAQ relations use their filenames as IDs. To rename existing resources safely, preview with `node scripts/migrate-filenames.mjs --resource-ids=old-id,another-old-id`; add `--apply` to update page and session references, keep redirects for old resource pages, and record the filename history. Do not rename those files manually. The recorded migration and preservation checks are described in [Preserving The Original Material](preservation.md).

## Libraries And Authorities

Each library is stored in `src/content/libraries/<slug>.json` and links to an authority in `src/content/authorities/<slug>.json`.

- **Adding an authority:** Create the authority under **Library Authorities** before assigning libraries to it.
- **Slugs and IDs:** Keep existing slugs and IDs unchanged where possible. If a library's slug or authority changes, add a redirect in **Site Settings**.
- **Opening hours:** Leave a day empty if closed or unknown, and use opening-hours notes for holiday exceptions.
- **Last Reviewed:** Stamped automatically when a library or authority is saved in the CMS.

## Publishing Changes

CMS configuration lives in `public/admin/config.yml`. Production editing is hosted on Netlify and uses Netlify Identity with Git Gateway to write reviewed drafts to `LibrariesHacked/libraryon-commons` (`main` branch). Editors need an invitation, not GitHub repository access. New uploads go to `public/uploads/community/`; archived files remain separate. See [the split-hosting setup](site.md#split-hosting) for the full handover steps.
