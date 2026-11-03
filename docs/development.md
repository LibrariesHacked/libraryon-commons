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

### Library Search

The directory needs no search or geocoding API. Astro generates `/directory.json` from the editable library records at build time. `compactDirectory` and `expandDirectory` in `src/lib/search.mjs` share authority metadata, store rows as arrays and round coordinates to four decimal places, following the [library finder widget](https://github.com/LibrariesHacked/libraryfinder-widget) approach. This reduces the current download from 489 KB to 332 KB with gzip. Service, accessibility, opening-hours and distance filters use the decoded records.

Place and postcode choices use the pinned `@geovation/gb-name-index` client. After a 250 ms pause and at least three characters, it fetches the [GB Name Index](https://geovation.github.io/gb-name-index/) static manifest and relevant prefix shards. The client caches downloads. Superseded lookups are cancelled; at most eight choices are displayed. Typing only looks up places: it does not filter library names or change the current library results. Selecting a place finds libraries within the selected distance and saves its label and coordinates in the URL. There is no Search button; Find nearby can also set the location. No library data leaves the browser, but place prefixes are sent as static file requests to GitHub Pages, so place lookup needs an internet connection. GB coverage does not include Northern Ireland; all directory records remain available through authority browsing.

The picker displays OS and Overture attribution only while place names are shown. Loading, empty, error and selected states do not show credits. If place files cannot load, the current results, filters, Find nearby and authority browsing remain available. No full place dataset is bundled, and no separate transformation job or API credentials are required. Changes to editable libraries are included on the next site build.

`src/components/LibrarySearch.astro` owns the place picker and geolocation. Add `<LibrarySearch />` to any Astro page or component: selecting a place or using your location redirects to the library directory with its label, coordinates and a five-mile radius. The homepage hero and authority pages use this default; individual library detail pages do not display the picker. Each instance has unique input/list IDs and its own cached index, requests and selection state. It does not download the library directory dataset.

The directory uses `<LibrarySearch id="library" mode="inline" />` and listens for the bubbling `library-location` event. Its `detail` contains `{ latitude, longitude, label }`; the directory updates results and URL state without navigation. A `library-location-clear` event resets the picker. Keep service, opening-hours and distance filters in the directory rather than the reusable picker.

`@github/combobox-nav` owns the picker's combobox ARIA state and active-option keyboard navigation. Up/Down highlights an option without changing the query or library results; Enter or a pointer selection commits it. Enter without a highlighted option does not select, and Tab retains normal focus navigation rather than committing a suggestion. Escape or leaving the input dismisses suggestions. Lookup, cancellation, attribution, geolocation and URL behavior remain application logic. Option IDs are scoped to each picker instance, and keyboard highlighting uses the existing suggestion hover style. This adds no React, Lit or general-purpose component suite.

A Lion combobox trial on 3 November 2026 supported Arrow/Enter selection in Chromium, but did not reduce custom code. After formatting, picker script size grew from 168 to 200 lines (6,429 to 7,464 bytes); the full component grew from 235 to 269 lines. The production homepage's initial static JavaScript module graph grew from 30,862 to 206,148 bytes, or 12,172 to 57,081 bytes when each module was gzip-compressed. These figures exclude dynamically loaded name data and translation modules. Lion added managed keyboard/ARIA behavior that the existing suggestion buttons do not provide, so this is not a comparison of identical interaction capabilities. Most remaining custom code handles search requests, cancellation, geolocation and navigation. The trial was removed because it did not meet the smaller-code/lightweight goal; no Lion or Lit dependency was retained.

### Library Maps

`src/components/LibraryMap.astro` uses the official `maplibre-gl` library directly, with no React or third-party Astro wrapper. Maps initialize only in the browser near the viewport. The renderer is dynamically imported, and the worker is bundled with Vite's documented `?worker&url` import. MapLibre's own CSS is imported only by the map component; site-specific map styles remain in `src/styles/pages/directory.css`. Removing a component releases its map and worker resources.

Library pages map their own record at zoom 15. Authority pages fit the coordinates of their member libraries. The search page sends all filtered records, not just the visible list page, through a `library-map-update` event containing `{ records, location }`. The component keeps the latest data even while deferred loading is pending. GeoJSON clustering is handled by MapLibre, with linked library popups and a separate point for a selected search location. Existing lists and contact/map links remain available independently of WebGL. Records with missing or invalid coordinates stay in lists but are not given invented map locations.

The basemap is [OpenFreeMap Positron](https://openfreemap.org/quick_start/), served from `https://tiles.openfreemap.org/styles/positron`. It is free to use without registration or an API key. Keep MapLibre's attribution control visible: the style supplies the required OpenMapTiles and OpenStreetMap credits. Tiles, fonts and sprites are external resources, so interactive basemaps need an internet connection and are subject to OpenFreeMap availability. `src/lib/library-map.mjs` supplies the shared coordinate validation, internal popup routes and minimal GeoJSON properties; HTML is never interpolated into popup content.

## Testing

Run `npm test` after code or content changes, and `npm run build` when modifying routes, templates, or schemas.

Keep original source snapshots and compressed preservation bundles immutable. Reference-only FAQ pages are checked against `migration/modular-content.json`; their pre-modular snapshots are also verified against the unchanged original article hashes. Edit canonical FAQ entries rather than reintroducing answers into page bodies.
