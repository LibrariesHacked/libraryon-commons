# Code And Templates

## Architecture

The Astro site is organised into three layers:

- **Routes (`src/pages/`)** — Define URL structure and data loading.
- **Templates (`src/templates/`)** — Render specific content types.
- **Layouts & Components (`src/layouts/`, `src/components/`)** — Shared page shell, navigation, footer, cards, and directory widgets.

## Template Hierarchy

```text
SiteLayout                  Header, navigation, metadata, and footer
  HomeTemplate              Commons homepage
  EditorialLayout           Article header, table of contents, and source credits
    ArticleTemplate         Standard article body, media, and related resources
      CollectionTemplate    Curated collections
      CaseStudyTemplate     Case studies
      GrantTemplate         Grant programmes
      LegalTemplate         Policies and legal notices
      LandingTemplate       Topic landing pages with child page cards
      ConferenceTemplate    Conference overview and session index
  DirectoryLayout           Shared shell for library and authority pages
    AuthorityTemplate       Authority details and member library list
    LibraryTemplate         Library contacts, hours, services, and nearby libraries
  ResourceTemplate          Download or external resource details
  SessionTemplate           Conference session details, speakers, and slides
  ContributorTemplate       Contributor profile
```

`src/lib/templates.mjs` resolves the template for each editorial entry. Template types in `src/content.config.ts` and `public/admin/config.yml` must stay in sync.

## Shared Changes

| Change                                                  | Update In                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Brand values, typography and base behaviour             | `src/styles/foundations/tokens.css` and `src/styles/foundations/base.css`     |
| Shared layout, form controls and content components     | `src/styles/components/layout.css`, `forms.css`, and `content.css`            |
| Homepage, editorial, directory and resource page styles | `src/styles/pages/`                                                           |
| Site header, footer, and navigation                     | `src/layouts/SiteLayout.astro` and `src/components/SiteNavigation.astro`      |
| Editorial body, lead images, and galleries              | `src/templates/ArticleTemplate.astro` and `src/components/ArticleMedia.astro` |
| FAQ and resource placement                              | `src/components/PageContent.astro` and `src/lib/content-modules.mjs`          |
| Editorial listing cards                                 | `src/components/ArticleCards.astro`                                           |
| Explicit Markdown components                            | `src/lib/content-directives.mjs`                                              |
| CMS block forms, parsing, serialization, and previews   | `src/lib/cms-editor-components.mjs`                                           |
| URL, image-master and preserved-email normalization     | `src/lib/markdown.mjs` and `src/lib/site.mjs`                                 |

Editorial and explicit Markdown cards use the same `content-card`, `content-card-body`, and `content-card-heading` structure, shared spacing tokens, image ratios, and responsive grids. Linked cards are whole-card links with a Lucide arrow and reactive hover/focus border. Informational cards are unbordered. Testimonials, attributed quotes, activity lists, and compact resource links do not use decorative card borders; form controls, tables, row separators, and focus indicators retain borders where they convey structure or interaction.

`src/lib/markdown-format.mjs` owns list formatting for import conversion and CMS serialization. List-marker normalization uses parsed source positions, preserving nested indentation and fenced code. Image filename policy is centralized in `scripts/migrate-filenames.mjs`; historical path chains are retained so source checksums and future imports still resolve after later shortening passes.

`remark-directive` parses named Markdown blocks, and `src/lib/content-directives.mjs` is their single shared renderer. Quotes, testimonials, card grids, lists, and videos require explicit blocks documented in [Editing Content](cms.md). The application does not infer layouts from text order, attribution length, or heading wording. Legacy recognition is confined to the archive migration tools and is not imported by the site renderer.

The Astro configuration fingerprints the shared directive, Markdown, and URL-renderer source files in its content-cache options. Component code changes therefore regenerate cached Markdown HTML without editing preserved content or manually clearing the cache.

The admin route registers Decap editor components before calling `CMS.init()`. Forms parse existing blocks using the standard Markdown/directive parser and serialize back to the same explicit syntax. Previews reuse the public component renderer and site styles. The editor and its Markdown parser bundle load only on the admin route. Keep component patterns anchored to the current input position without the multiline flag: Decap's tokenizer must never consume a later block before the paragraph currently being parsed.

Keep content-type templates as thin wrappers around shared layouts and components. Add specialised markup only for a genuine content-type difference, and keep reusable behaviour out of individual content files. Markdown transforms run at build time; they do not add client-side JavaScript. Keep interactive scripts with the component or route that needs them rather than adding them to the shared site layout.

## Styling Foundation

`src/styles/global.css` is the single ordered import entry used by the public layout and the CMS preview bundle. It loads foundations, shared components, and page-specific rules; keep declarations in their owning file rather than adding them back to the entry point.

- **Foundations:** `tokens.css` imports selected Open Props size, border, font, aspect-ratio, easing, and layer packs, then defines the project's brand, fonts, surfaces, focus and semantic component tokens. `base.css` owns element defaults, prose typography and accessibility defaults.
- **Shared components:** `layout.css` owns the site shell, navigation, footer and section headers; `forms.css` owns buttons, fields and generic inline search; `content.css` owns cards, quotes, lists, media, FAQ/resource components, contact information and shared detail layouts.
- **Page-specific styles:** `home.css`, `editorial.css`, `directory.css`, and `resources.css` contain only their respective page-specific layout and behaviour. Responsive overrides stay with their owning component or page.

Open Props supplies matching spacing, font metrics, aspect ratios, border widths, and layers, for example `--size-4` for 1.25rem, `--font-weight-6` for 600, and `--ratio-widescreen` for 16/9. Keep project-facing names such as `--card-padding`, `--card-gap`, `--motion-ease`, and `--brand-primary` as the design contract. Existing font families, colours, custom card ratio, and unmatched values remain deliberate brand choices. Interactive transitions share the Open Props easing token behind `--motion-ease`. No Open Props normalize, theme, color palette, component preset, or JavaScript is loaded; its hero examples are recipes, not packaged components.

Stylesheet imports are bundled by Astro/Vite, including the admin's `?inline` preview import; they are not extra runtime network requests. Import order remains significant. Changes should be verified on desktop and mobile across the homepage, an editorial page, the directory, and resources. The initial migration compared computed styles on five routes at both widths with no differences.

Run `node --test tests/styles.test.mjs` for import ownership, selected token packs, token usage, brand values and shared preview-entry checks. Run the full suite and build after shared style changes.

## Browser Behaviour

- **Carousel:** `HomeTemplate.astro` uses framework-independent Embla Carousel and its Autoplay plugin. Embla owns snapping, looping, dragging, resizing, timers, and hidden-tab autoplay handling. The small site adapter owns the controls, dots, explicit pause state, hover/focus policy, and reduced-motion behaviour. Reduced motion starts paused; an explicit Play action opts into autoplay with instant rather than animated slide changes. Native horizontal scrolling remains available before initialization or without JavaScript.
- **Directory filters:** HTML `popover="auto"` and `popovertarget` own opening, closing, outside-click dismissal, Escape, and focus behaviour. Floating UI's DOM package handles top-layer positioning, viewport collisions, and repositioning on scroll/resize. Application code only synchronizes the existing labels and filter state. Keep this limited to the directory route.
- **Search rules:** Distance, opening hours, service/accessibility matching, and library-specific URL state remain domain logic. The small resources filter does not need a generic UI framework. Pagefind is an option if a separate site-wide text search is added; it is not a replacement for the directory's domain rules and is not installed.

Do not add a general-purpose frontend framework merely to reduce a handful of event listeners. Prefer native elements first and focused maintained libraries when they remove meaningful mechanics. Carousel and directory dependencies are loaded only by their relevant routes.

## Directory Model

Each library (`src/content/libraries/*.json`) references its parent authority (`src/content/authorities/*.json`) by slug. `src/lib/directory-model.mjs` validates these relationships, computes each authority's member list, calculates nearby libraries, and generates the client search index (`/directory.json`).

## Testing

Run `npm test` after code or content changes, and `npm run build` when modifying routes, templates, or schemas.

Keep original source snapshots and compressed preservation bundles immutable. Reference-only FAQ pages are checked against `migration/modular-content.json`; their pre-modular snapshots are also verified against the unchanged original article hashes. Edit canonical FAQ entries rather than reintroducing answers into page bodies.
