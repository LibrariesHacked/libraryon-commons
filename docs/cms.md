# CMS technical documentation

This technical documentation describes the Decap CMS architecture, data schemas, validation hooks,
and permission systems for repository maintainers and developers.

For end users and local authority staff editing library details on the live website, refer to the
plain-English [Editing guide](../src/content/pages/editing-guide.md) published on the site.

## Open the local editor

1. Start the Astro development server:

   ```sh
   npm run dev
   ```

2. In a second terminal, start Decap's local file service:

   ```sh
   npx --yes decap-server@3.11.6
   ```

3. Open <http://127.0.0.1:4322/admin/> and click **Login**.

Local edits write directly to the working tree without committing. Stop `decap-server` when
finished.

## Backend stability and archive media

Authentication still uses **Git Gateway and Netlify Identity**. Editors do not need GitHub accounts.
The CMS uses Decap's stock `git-gateway` backend with no custom backend, request interception,
retries or tree caching. Local development still uses Decap's proxy backend. Decap's upstream
rate-limit and failed-read behavior is unchanged: disabling global search reduces request volume but
does not guarantee that all reads succeed. Reload after a loading failure; do not save an incomplete
form. Authenticated cold-load checks are still needed after deployment.

CMS-wide search is disabled to avoid loading every collection. Native relation searches remain
enabled, including their built-in caching. Sorting configuration does not disable Decap's per-file
commit metadata requests. Do not enable GitHub GraphQL on Git Gateway.

The supported traffic reductions used here are `search: false` and `load_config_file: false` during
[manual initialization](https://decapcms.org/docs/manual-initialization/): the complete
configuration is already embedded, so fetching it again is unnecessary. Keep relation definitions
consistent so Decap can reuse its native relation cache. Relation `options_length` and `filters`
limit displayed choices, not backend downloads; do not treat them as rate-limit controls or restrict
valid links just to reduce traffic. See Decap's
[search configuration](https://decapcms.org/docs/configuration-options/#search) and
[relation widget options](https://decapcms.org/docs/widgets/relation/).

New uploads and the native Media Library use `public/uploads/community`. Image and file fields offer
a separate read-only archive selector backed by `/admin/archive-media.json`, generated from actual
files at build time. The **Archive files** link opens a searchable read-only browser in a new tab,
for copying genuine `/uploads/archive/...` URLs into Markdown or resource links. Existing values are
never rewritten based on filenames. Newly uploaded community files with an archive filename remain
distinct. The redundant `.gitkeep` placeholder was removed now that the folder contains real
uploads; the native Media Library needs no response filtering to hide it.

Archive files are not merged into community Git trees or exposed as deletable community media. The
CMS-only Netlify package proxies `/uploads/archive/*` to `PUBLIC_SITE_URL` (default
`https://librarycommons.org.uk`), so it depends on the public deployment's availability and current
archive assets. Neither the picker nor browser can upload or delete archive files. This is a
read-only picker, not a repository-level deletion restriction.

## User accounts and permissions

CMS registration and editorial scopes are governed by email domain mappings in
[src/data/auth/domain-permissions.csv](../src/data/auth/domain-permissions.csv):

| Column      | Purpose                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `domain`    | Authorised domain or semicolon-separated list of domains (e.g. `manchester.gov.uk` or `service.gov.uk;lib.service.gov.uk`) |
| `gss_codes` | Semicolon-separated ONS GSS codes (e.g. `E08000003`) or `*` for all authorities                                            |
| `role`      | Either `service-editor` or `general-editor`                                                                                |
| `notes`     | Human-readable description (e.g. authority name)                                                                           |

### Editorial roles

- **General Content Editors (`general-editor`)**: Have full access across all CMS collections (Site
  Settings, Homepage, Pages, FAQs, Libraries, Authorities, Resources, Sessions, Organisations,
  Contributors) and can edit records for any authority.
- **Service Editors (`service-editor`)**: Confined to the library directory (`libraries` and
  `authorities`). A service editor can only save changes to records matching their assigned GSS
  codes.

### Registration and guardrail enforcement

1. **Netlify Identity hooks (`netlify/functions/`)**:
   - `identity-validate`: Checks the registrant's email domain against the CSV before registration
     is accepted. Unrecognised domains are blocked with HTTP 400.
   - `identity-signup`: Assigns the corresponding role and GSS codes into the user's `app_metadata`.
   - `identity-login`: Keeps `app_metadata` synchronised with CSV updates on each login, while
     preserving manually added users created via the Netlify console.
2. **CMS client hooks and collection filtering (`src/pages/admin/index.astro`)**:
   - For service editors, Decap CMS dynamically filters the **Libraries** and **Library
     Authorities** collections so only records matching their assigned authority GSS code are shown.
   - Decap CMS's `preSave` event hook checks the user's identity claims before writing any file. If
     a service editor attempts to save a library or authority with a non-permitted GSS code, or
     attempts to edit another collection, Decap stops the save with an explanatory error.
   - For local development with `decap-server`, the editor runs with general-editor permissions.

## CMS sections

| Section                    | Controls                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Site Settings              | Site title, header navigation (including submenus), redirects, UI labels, and footer |
| Commons Homepage           | Hero copy, hero image, section headings, and featured pages                          |
| Editorial Content          | Articles, collections, case studies, grants, conferences, and legal pages            |
| Frequently Asked Questions | Reusable questions and answers, selected and ordered on pages                        |
| Libraries                  | Individual library details: address, contacts, opening hours, services, and notes    |
| Library Authorities        | Authority contacts, website, catalogue URL, and other details                        |
| Resources And Downloads    | PDFs, slide decks, recordings, external links, and credits                           |
| Conference Sessions        | Session descriptions, speakers, parent conference, and linked resources              |
| Contributors               | Contributor biographies and profile images                                           |

### Library directory records

Library and library service records use the supplied Table Schema field names as top-level
properties. Keep the existing URL slug, authority relationship, and source identifiers unchanged.
Empty values are stored as `null`; unknown required values are recorded as validation exceptions
rather than guessed. The save handler rejects invalid new values and removes resolved exceptions.

Staffed and unstaffed opening hours are separate fields. Use `09:00-17:00` or split sessions such as
`09:00-12:00,13:00-17:00`. Leave the field blank when closed; saves store it as `null`. Don't use
the text `Closed`. Invalid imported sessions are kept in the source audit and flagged for manual
review rather than silently repaired. The overall library `Status` is separate from its daily hours.

### Review checks and exceptions

The system is designed to automatically make regular checks on the data against the schema as well
as other checks (e.g.URLs resolving).

Both directory forms show expandable **Manual checks** and **Validation exceptions** sections. A
check shows check type, reason, and audit references. An exception shows its schema field, issue
code, and reason; correct the actual data field rather than editing exception metadata. Resolved
exceptions are removed automatically when saved. An unresolved exception cannot be cleared just by
deleting its list item.

The **Data review** link above the CMS opens `/admin/review/`. Search by library/service name,
authority, field, or reason; filter by record type and issue type. The worklist prioritizes hours
and identifier conflicts, then validation gaps. Each record links to its public page and exact CMS
entry. Open its review dialog to see exception values, candidate values, original invalid hours,
lookup outcomes, and archived source-only details. Evidence is fetched only for the selected record.

Complete a manual review by correcting the fields, then removing the corresponding check from
**Manual checks** and saving the changes. The original migration audit is saved for reference. The
worklist and downloads reflect saved repository data on the next site build, not unsaved forms.
Missing or unrelated audit evidence is flagged rather than silently attached to a record.

The worklist is a read-only page in the CMS deployment, not a private authenticated resource. It and
its evidence endpoints are marked `noindex`; CMS editing still requires authentication. The ordinary
public library pages do not display technical review flags. In the split deployment, use the CMS
host's `/admin/review/`; the public Pages deployment intentionally excludes `/admin/`.

Moved libraries have separate records: close the old library and create the new building as open.
Normal CMS saves stamp the actual edit/review date. The migration initially preserved all original
dates. See the [audit and override procedure](../migration/directory/README.md) before rerunning a
migration or approving uncertain identifiers.

### Library CSV downloads

The public library directory offers an all-library CSV; each authority page offers its own library
CSV. Exports include current and closed buildings, exact schema column order, no CMS metadata, and
blank cells for `null` values. Quoting preserves commas, quotes, and embedded newlines. The
**Validation and schema** disclosure also provides the Table Schema, a row-level validation report,
and a strictly validated subset CSV.

The all-records CSV retains libraries with documented required-field or format exceptions; it must
not be described as fully schema-valid. The separate validated CSV contains only rows that pass
every library-schema field constraint. It may therefore contain fewer libraries, and an authority
with no qualifying rows receives a header-only file. The validation report identifies excluded
records and fields; row numbers refer to CSV records, including the header, rather than physical
lines within quoted text.

## Editorial content

To add a page, create an entry in **Editorial Content**, choose a content type (which selects the
[page template](development.md)), and set a unique path such as `/stories/my-library`.

- **Reserved paths:** Do not use `/libraries`, `/resources`, `/sessions`, `/people`, `/admin`, or
  `/directory`.
- **Publish on site:** Unchecking this keeps a page editable in the CMS while removing its public
  route
- **Content origin:** Editorial metadata distinguishing original `libraryon` material from new
  `commons` entries. Pages with a `libraryon.org` source URL default to LibraryOn.
- **Updated date:** Automatically stamped with today's date when saved in the CMS.
- **Preserved articles:** The original LibraryOn text is checksum-verified against
  `migration/source-articles.json`. FAQ-bearing pages now use references instead of inline answers;
  their pre-modular text is retained in a compressed archive snapshot. Edit questions and answers in
  the FAQ collection, not in the page body.

### Navigation and page hierarchy

Header navigation and page structure are maintained separately:

- **Site settings → Navigation** controls the header menu. Point a section's URL at its published
  landing page; submenu URLs should match the pages' Site Paths.
- **Site path** determines sitemap nesting and breadcrumb ancestors. A section appears as a linked
  ancestor only when a published page exists at that path.
- **Subpages** selects and orders the cards shown on a landing page. It does not create routes or
  change sitemap nesting.

For example, the Archive menu links to the `/archive/` landing page, whose Subpages list contains
pages with paths under `/archive/`. When changing a live Site Path, add a redirect in Site Settings
so existing links continue to work.

## Review and preserved material

Production CMS edits are published directly to the repository's `main` branch. The repository runs
its tests and builds the site on each push.

The original LibraryOn articles, imported FAQs and resources, archive uploads, and preservation
records are assigned to maintainer review in `.github/CODEOWNERS`. New CMS uploads are stored in
`public/uploads/community/`, not alongside `public/uploads/archive/`.

When using the local editor, saves write to your working copy only.

## Reusable content

Create questions under **Frequently Asked Questions**, then select and order them in a page's
**FAQs** field. The referenced FAQ files are the only editable source for question and answer text.
Answers support Markdown copy.

Put `{{faqs}}` on its own line to place the selected FAQs. An optional preceding heading matching
**FAQ Heading**, plus any introductory Markdown, becomes the section heading and introduction.
Existing linked FAQ pages already use this pattern. Without a marker, the template places FAQs after
the body.

The optional `{{resources}}` marker similarly positions selected resources. Resources already linked
in the page or its FAQ answers are not repeated. Without a marker, modules appear after the body.

## Explicit page blocks

The **Content** editor has **Rich text** and **Markdown** modes. In Rich Text, use the **+ / Add
component** menu to insert a block. Existing blocks open as the same editable forms, with image
pickers and labelled fields; editors do not need to type directive syntax.

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
| Collection Accordion           | Accessible label; entries are written in Markdown                                  |
| Editorial Aside                | Heading and layout; aside text is written in Markdown                              |
| Book Recommendations           | Section title; covers and descriptions are written in Markdown                     |
| Linked FAQs / Linked Resources | Insert the selected page metadata references at this position                      |

Select FAQ and resource entries in their normal page fields. The insertion shortcuts place a marker;
they do not copy the linked content. A whole-card link cannot be combined with links inside that
card's text.

For cards that lead to one page, use **Whole-Card Link** and ordinary text rather than a separate
text link. The image, heading, and text then form one keyboard-accessible link with the same arrow
and responsive layout as editorial listing cards. Informational cards without a destination are
deliberately unbordered.

Switch to Markdown to inspect or directly edit the saved syntax below. Both modes use the same
explicit Markdown in the repository; no separate CMS content copy is created. Component boundaries
remain explicit, and the renderer never guesses a testimonial from adjacent paragraphs or selects a
panel based on heading text.

For a quote with an image, put the attribution in the block attributes and the image and quote
inside the block:

```md
:::testimonial{author="Tracy" role="Children & Youth Librarian" organisation="Wiltshire Libraries"
url="/libraries/wiltshire"}

![Tracy reading to children.](/uploads/tracy.jpg)

> Bring your little ones to rhyme time.

:::
```

Use `:::quote{author="Alex" role="Customer, Sandwell Libraries"}` for a quote without an image. An
author is required. `role`, `organisation`, and its `url` are optional; do not repeat the
attribution as separate paragraphs.

Wrap a heading and ordinary Markdown list in a list panel:

```md
:::list-panel

## At your library

- Borrow books
- Learn new skills

:::
```

Card grids have an explicit outer container and one block per card. The outer container uses four
colons so it can contain three-colon blocks:

```md
::::cards

:::card{href="/reading/reading-in-libraries"}

![Reading group.](/uploads/reading-group.jpg)

### Reading together

Books, stories, and reading groups for all ages.

:::

::::
```

Use `:::card{href="/reading"}` only for a whole-card link with no other links inside it. Videos use
`::video{src="https://www.youtube.com/embed/VIDEO_ID" title="Library film"}` on its own line.

Each video also has a **Watch on YouTube** link. Some embedded webviews, including the VS Code
integrated browser in this environment, can abort third-party iframe navigation and leave the player
blank even when it works in a regular browser. The direct link remains available when embedded
playback is blocked.

## Special collection controls

The editor presents the outer component as a form. For slides, accordion entries, aside text, and
book lists, its **Markdown** field contains the inner items. Keep each slide’s image and notes
together and each book’s cover, description, and details inside the same item.

### Image and carousel

Choose **Full** for a lead image, **Inset** for an image alongside article text, or a float when it
belongs beside nearby paragraphs. Captions and credits go inside the image block.

```md
:::collection-image{layout="full" zoom="true"}

![Circus posters and a scrapbook.](/uploads/community/circus-posters.jpg)

Posters from the local history collection. Credit: Example Library.

:::
```

An image carousel has one `slide` block per image. A hotspot carousel places each hotspot inside the
slide it describes. The `x` and `y` values are percentages measured from the left and top edges of
the image.

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

### Accordion and aside

Use one `accordion-item` per topic. An aside has one heading and should contain only information
that helps readers understand the nearby article text.

```md
::::collection-accordion{label="Local history resources"}

:::accordion-item{title="Newspapers"}

The library keeps local newspaper issues in its study collection.

:::

::::
```

### Book recommendations

Use one `recommendation-item` per book. Put the cover and its description inside that item; the
selected description opens beside its matching cover.

```md
::::::collection-recommendations{title="Books about circus history"}

:::::recommendation-item{title="A History of the Circus" author="Alex Example" year="2020"}

![Cover of A History of the Circus.](/uploads/community/circus-book.jpg)

A short description of the book.

:::::

::::::
```

The editor’s form handles the component boundary. You should only need to edit this inner Markdown
for slides, notes, accordion entries, asides, and recommendations.

Unknown blocks, missing required data, and unsafe links fail the build with an error. Plain
blockquotes, paragraphs, headings, lists, and video links remain plain Markdown. These blocks are
page-specific content; keep shared questions and answers in the FAQ collection instead of copying
them.

## File names

FAQ filenames come from their questions; resource and session filenames come from their titles.
Imported slide decks use session titles, and images use alt text or other source metadata. Names are
lowercase, hyphenated ASCII, with numeric suffixes for collisions. Libraries, authorities, and page
filenames already use descriptive names.

New image names use a short phrase from the first sentence: up to ten words and 64 characters,
keeping whole words and useful `original`/`master` suffixes. Numeric collision suffixes may add a
few characters. Full alternative text stays in the content; it is not truncated.
`node scripts/migrate-filenames.mjs --apply` updates long legacy image paths and all active
references without changing file bytes.

Markdown list markers use one space (`- Item`), including HTML imports and CMS output.
`node scripts/normalize-content.mjs` previews old-list formatting and single-destination card
conversions; add `--apply` to update content and its preservation checksums. Nested lists and code
blocks are handled structurally rather than by a blanket text replacement.

Use a descriptive filename before uploading new images or documents, and provide useful alternative
text for images. New files go into the community uploads folder. Changing a resource title does not
rename its existing file or change its ID. Give repeated links enough detail to tell them apart,
such as a programme round or session name. The resource pages show where each item is used. Page
URLs come from the **Path** field, independently of filenames. Resource and FAQ relations use their
filenames as IDs. To rename existing resources safely, preview with
`node scripts/migrate-filenames.mjs --resource-ids=old-id,another-old-id`; add `--apply` to update
page and session references, keep redirects for old resource pages, and record the filename history.
Do not rename those files manually. The recorded migration and preservation checks are described in
[Preserving The Original Material](preservation.md).

## Libraries and authorities

Each library is stored in `src/content/libraries/<slug>.json` and links to an authority in
`src/content/authorities/<slug>.json`.

- **Adding an authority:** Create the authority under **Library Authorities** before assigning
  libraries to it.
- **Slugs and IDs:** Keep existing slugs and IDs unchanged where possible. If a library's slug or
  authority changes, add a redirect in **Site settings**.
- **Opening hours:** Leave a day empty if closed or unknown, and use opening-hours notes for holiday
  exceptions.
- **Last reviewed:** Stamped automatically when a library or authority is saved in the CMS.

## Publishing changes

CMS configuration lives in `public/admin/config.yml`. Production editing is hosted on Netlify and
uses Netlify Identity with Git Gateway to write changes to `LibrariesHacked/libraryon-commons`
(`main` branch). Editors need an invitation, not GitHub repository access. New uploads go to
`public/uploads/community/`; archived files remain separate. See
[the split-hosting setup](site.md#split-hosting) for the full site hosting steps.
