# Coding Standards And Architectural Guidelines

This document outlines the coding standards, design system principles, and architectural conventions for the **LibraryCommons** repository.

The repository is built and maintained by humans and AI collaborating closely. To ensure the codebase remains maintainable, welcoming, and resilient over years of preservation and community evolution, all contributions must adhere to these standards.

---

## 1. Core Principles

1. **Readable and close to plain English**: Code should be self-describing. Prefer expressive, everyday vocabulary over arcane abbreviations, acronyms, or terse mathematical shorthands.
2. **Commented methods that are easy to understand**: Comments and docstrings should explain the real-world domain reason for the code in straightforward terms, free of technical jargon.
3. **Human maintainability over cleverness**: A junior developer or volunteer reading the code six months from now should immediately understand what it does. Avoid dense nested ternary statements, regex tricks, and deep inheritance.
4. **Strict separation of concerns**: Keep presentation, orchestration, domain logic, and data storage in their dedicated layers.
5. **Zero-defect data integrity**: Directory records must always validate cleanly against schema specifications, with zero unresolved exceptions or open manual checks.

---

## 2. Code Style And Plain English Conventions

### 2.1. Naming Things
- Use descriptive, real-world English names for functions, variables, classes, and CSS identifiers:
  - **Good**: `timeStringToMinutes`, `getLiveOpeningStatus`, `updateLibraryListStatus`, `formatOpeningTimes`, `isHoursOpenNow`.
  - **Avoid**: `calcStat`, `t2m`, `procHrs`, `chkOpn`, `doStuff`.
- Boolean variables and functions should read like questions or assertions: `isOpen`, `hasRecordedHours`, `isStatutory`, `isToday`.
- Do not use single-letter variables except for standard short-lived loop counters (`i`) or coordinate pairs (`[x, y]` / `[latitude, longitude]`).

### 2.2. Jargon-Free JSDoc Comments
Every exported function, non-trivial calculation, or browser script method must have plain-English JSDoc comments. Explain:
1. **What** the function does in domain terms (e.g. *"Evaluates whether a library is currently open in UK local time"*).
2. **Why** it exists and how it handles edge cases (e.g. daylight saving time transitions, midnight boundaries, libraries with multiple daily sessions, or missing hours).
3. **Parameters and return types** with clear descriptions.

```javascript
/**
 * Determine live opening status, active session, and user-facing message for a library.
 * Evaluates in UK local time (Europe/London) so Daylight Saving Time (BST/GMT) is handled correctly.
 *
 * @param {object} openingTimes - Opening hours object keyed by day of the week (e.g. monday, tuesday).
 * @param {Date} [now=new Date()] - Reference date object (defaults to current system time).
 * @returns {{
 *   isOpen: boolean,
 *   currentDay: string,
 *   currentFrame: object|null,
 *   nextTodayFrame: object|null,
 *   statusText: string,
 *   hasAnyHours: boolean
 * }} Live evaluation outcome with human-readable status text.
 */
export function getLiveOpeningStatus(openingTimes = {}, now = new Date()) { ... }
```

### 2.3. Control Flow & Error Handling
- Use **early returns** and guard clauses to keep function indentation shallow.
- Avoid multi-level nested ternaries. When handling conditional branches, use `if...else` statements or clear `switch` blocks.
- In client scripts, wrap external data or JSON parsing in safe `try...catch` blocks with graceful fallbacks so an isolated data quirk cannot break page rendering.

---

## 3. Architecture & Separation Of Concerns

The codebase is organized into distinct, single-responsibility layers:

```text
src/
├── content/       # Canonical JSON directory records and Markdown articles
├── pages/         # Astro route endpoints, URL parameters, static paths
├── templates/     # Entity-level page structures (wire models into UI layouts)
├── components/    # Focused, reusable visual controls and widgets
├── layouts/       # Shared page shells (SiteLayout, DirectoryLayout, EditorialLayout)
├── lib/           # Pure, framework-independent JavaScript business logic
└── styles/        # Ordered CSS hierarchy (foundations, components, pages)
scripts/           # Reproducible data ingestion, migration, and audit CLI tools
tests/             # Automated test suite (node --test)
```

### 3.1. Routes (`src/pages/`)
- Define URL routing, page titles, OpenGraph metadata, and `getStaticPaths()` data loading.
- Must remain thin: delegate rendering to templates and shared layouts.
- Do not put business logic or complex data transformations directly in `.astro` frontmatter inside `src/pages/`.

### 3.2. Templates (`src/templates/`)
- Provide canonical page structure for distinct entity types (`LibraryTemplate.astro`, `AuthorityTemplate.astro`, `ArticleTemplate.astro`).
- Receive strongly-typed props and pass them down into child components.
- Contain page-level semantic tags (`<main>`, `<article>`, `<section>`).

### 3.3. Components (`src/components/`)
- Encapsulate reusable visual and interactive elements (`OpeningHours.astro`, `LibraryMap.astro`, `TagListSection.astro`, `LibrarySearch.astro`).
- Keep markup semantic and accessible (proper ARIA attributes, semantic headings, table headers).
- If interactive, components may contain a minimal, scoped `<script>` that imports shared logic from `src/lib/`.

### 3.4. Shared Business Logic (`src/lib/`)

The `src/lib/` folder contains pure, framework-independent JavaScript modules (`.mjs`). For a complete inventory of these files, their execution lifecycles, and a visual flowchart of the content pipeline, see the [content and data pipeline guide](content-pipeline.md). It is structured into domain directories:

```text
src/lib/
├── cms/                      # CMS admin widgets and review worklist (runs on /admin/)
│   ├── cmsHelpers.mjs        # Decap CMS editor widgets (card, quote, video, hotspot)
│   └── reviewHelpers.mjs     # Directory review worklist and audit verification
├── content/                  # Editorial build-time pipeline (Remark, Cheerio, loaders)
│   ├── contentDirectives.mjs # Remark plugin for :::card, :::quote container directives
│   ├── markdownHelpers.mjs   # Markdown AST plugins, list indentation, email protection
│   ├── contentHelpers.mjs    # Article HTML module splitting ({{faqs}}, {{resources}})
│   ├── newsHelpers.mjs       # Public Libraries News loader and date filters
│   └── resourceHelpers.mjs   # Downloadable document and external link tracking
├── directory/                # Directory domain models, validation, math, and exports
│   ├── models/               # Class-based domain entities
│   │   ├── Library.mjs       # Library building model
│   │   └── LibraryService.mjs# Library authority/service model
│   ├── directoryLoader.mjs   # Fast in-memory directory collection loader
│   ├── directoryHelpers.mjs  # Graph assembly, breadcrumbs, parent authority linking
│   ├── openingHoursHelpers.mjs # Opening hours normalization and live UK status
│   ├── geoHelpers.mjs        # Haversine distance, navigation map links, GeoJSON
│   ├── dataHelpers.mjs       # Postcode/UPRN formatting, address helpers, facility labels
│   ├── schemaHelpers.mjs     # Table Schema validation and exception rules
│   ├── exportHelpers.mjs     # CSV downloads (/libraries.csv) and validation reports
│   └── searchHelpers.mjs     # Client search indexing (/directory.json) and query filtering
├── site/                     # Site-level metadata, URLs, and navigation
│   ├── siteHelpers.mjs       # Canonical internal URLs, site settings, date formatting
│   ├── seoHelpers.mjs        # Schema.org JSON-LD generation and XML sitemap
│   └── sitemapHelpers.mjs    # Hierarchical navigation tree builder
```

#### 3.4.1. Domain Directory Rules
- **CMS Admin (`src/lib/cms/`)**: Contains logic specifically powering the Decap CMS web interface on the `/admin/` route.
- **Content Pipeline (`src/lib/content/`)**: Headless AST and HTML transformation tools that run at build time to convert source Markdown into structured HTML components.
- **Directory Domain (`src/lib/directory/`)**: Pure domain logic, Table Schema validation, spatial math, and data exports. Class models live in `models/`, and `directoryLoader.mjs` provides the in-memory collections.
- **Site Infrastructure (`src/lib/site/`)**: Cross-cutting site settings, canonical path helpers, British date formatters, and search engine SEO metadata.
- **Client Scripts (`src/scripts/`)**: Interactive browser DOM scripts (`mediaClient.mjs`, `shareClient.mjs`) that interact with `document` or `window`. Pure helpers in `src/lib/` must never touch the DOM.

#### 3.4.2. File Header Documentation Standard (Concise What & Why)
Every file in `src/lib/` and `scripts/` must begin with a clear, concise JSDoc `@fileoverview` header (1–2 sentences):
1. **What it is**: The core responsibility of the module.
2. **Why it's in the project**: How it connects to the project's features and user journeys.

*Do not write long-winded essays or multi-paragraph dissertations in file headers.* Keep it direct, human-readable, and to the point.

#### 3.4.3. Platform Independence & DOM Safety
- Files in `src/lib/` must be directly importable and testable using Node's native test runner (`node --test`) without browser mocks.
- Pure helper functions should not touch the DOM (`window`, `document`).

---

### 3.5. Astro Architecture: Build-Time vs. Browser Runtime Separation

Astro projects combine two completely different execution environments. To keep code clear, maintainable, and free of tangled side-effects, the codebase enforces a strict three-layer separation:

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. BUILD-TIME DOMAIN LAYER (`src/lib/`)                     │
│    - Pure Node.js / ESM (models, helpers, schema validation) │
│    - Runs ONLY during `astro build` / `astro dev`           │
│    - Produces data; never touches the browser DOM           │
└──────────────────────────────┬──────────────────────────────┘
                               │ Imports data
┌──────────────────────────────▼──────────────────────────────┐
│ 2. COMPONENT PRESENTATION LAYER (`src/components/`, etc.)   │
│    - Frontmatter (`--- ... ---`) runs ONLY at build time    │
│    - Renders accessible semantic HTML and CSS               │
│    - Embeds runtime configuration via HTML5 `data-*` attrs  │
└──────────────────────────────┬──────────────────────────────┘
                               │ Links to external client file
┌──────────────────────────────▼──────────────────────────────┐
│ 3. BROWSER RUNTIME LAYER (`src/scripts/*Client.mjs`)        │
│    - Pure browser JavaScript bundled and minified by Vite   │
│    - Runs in the user's browser at runtime                  │
│    - Handles DOM events, MapLibre, filters, geolocation     │
└─────────────────────────────────────────────────────────────┘
```

#### 3.5.1. No Large Inline Scripts in `.astro` Files
- **Avoid inline scripts**: Do not place large blocks of procedural DOM manipulation, event listeners, or API requests inside `<script>` tags in `.astro` templates.
- **Extract to dedicated client files**: Place browser runtime logic in dedicated files under `src/scripts/` using the `*Client.mjs` naming convention (e.g. `src/scripts/directorySearchClient.mjs`, `src/scripts/libraryMapClient.mjs`, `src/scripts/carouselClient.mjs`).
- **Single-line template links**: Components should link to client scripts via a clean import or src reference:
  ```astro
  <script src="../../scripts/directorySearchClient.mjs"></script>
  ```
  or:
  ```astro
  <script>
    import { initDirectorySearch } from '../../scripts/directorySearchClient.mjs'
    initDirectorySearch()
  </script>
  ```

#### 3.5.2. How Build-Time and Browser Code Communicate
Build-time code and browser runtime code must never share direct memory or function scopes:
1. **Pass data through HTML5 `data-*` attributes**: When a browser script needs build-time context (e.g. a library's opening hours or initial coordinates), the `.astro` template writes it as a JSON-encoded or scalar `data-*` attribute on the element:
   ```astro
   <div class="library-map" data-coordinates={JSON.stringify({ lat, lng })}></div>
   ```
2. **Loosely couple components with Custom DOM Events**: Components on the same page communicate via typed custom events dispatched on `document` or `window` (e.g., `document.dispatchEvent(new CustomEvent('library-map-update', { detail: { records, location } }))`). This avoids tight couplings between unrelated widgets.

---

### 3.6. Data Layer (`src/content/`)
- JSON directory records for authorities and libraries follow the [Public library data schemas](https://schema.librarydata.uk/).
- Content is validated at build time against Table Schema definitions.
- Records should never contain temporary migration artifacts, legacy field names, or unverified fabricated values.

### 3.7. Data Scripts & Migrations (`scripts/`, `migration/`)
- All data transformation, geocoding, and ONS lookup scripts must be idempotent and reproducible.
- Never import migration scripts into frontend bundles or build steps.

---

## 4. Styling & Design System Standards

The site uses a unified design system built on CSS variables in `src/styles/foundations/tokens.css`.

### 4.1. Design Tokens Are Mandatory
- **Never use raw color values** (`#671e7d`, `rgba(...)`, `white`, `black`) in stylesheets outside `tokens.css`.
- Always reference designated tokens: `var(--ink)`, `var(--muted)`, `var(--brand-primary)`, `var(--surface-tint-plum)`, `var(--paper)`, `var(--canvas)`.
- Use Open Props size tokens (`var(--size-2)`, `var(--size-4)`, `var(--size-6)`) for consistent spacing and layout margins.
- Style tests (`tests/styles.test.mjs`) automatically verify that no undeclared color literals enter the CSS.

### 4.2. Surfaces Over Borders
- **Move away from thin borders and grey dividing lines**: Do not use `border: 1px solid #ccc` or grey divider lines across content sections.
- Separate sections, lists, and cards using **generous spacing** and **block tinted surfaces** (`var(--wash)`, `var(--surface-tint-plum)`, `var(--surface-tint-rose)`, `var(--surface-tint-green)`, `var(--surface-tint-apricot)`).
- Alternate table and list rows using soft contrasting blocks (e.g. `var(--paper)` and `var(--surface-tint-rose-pale)`).

### 4.3. Exceptional Borders
- Reserve borders for exceptional cases where visual containment is necessary, such as the interactive map (`.library-map`).
- When used, borders must be soft, light-coloured, and match an existing brand surface token (e.g. `border: 3px solid var(--surface-tint-rose)`).

### 4.4. Standardized Pills, Badges, and Chips
UI badges, pills, and chips are standardized into four core brand palettes:

| Variant | Surface Token | Text Token | Border | Shape | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Plum** | `var(--surface-tint-plum-selected)` | `var(--brand-link)` | `0` | Pill (`999px`) | Distance badges, active search filters, core library services. |
| **Rose** | `var(--surface-tint-rose)` | `var(--brand-berry)` | `0` | Pill (`999px`) | Hero tags (country, library type, service count), closed status. |
| **Green** | `var(--surface-tint-green)` | `var(--brand-forest)` | `0` | Pill / Chip | "Open now" live indicators, accessibility facilities. |
| **Apricot** | `var(--surface-tint-apricot)` | `var(--ink)` | `0` | Chip (`var(--card-radius)`) | Co-located community services, warm notices. |

All pills and chips share:
- No thin or grey borders (`border: 0`).
- Generous internal padding (`0.35rem 0.85rem` for pills, `0.45rem 0.8rem` for chips).
- Titlecase or sentence case text only.

### 4.5. Color Harmony On Interaction
- When hovering or selecting elements on a tinted background, choose a harmonious tint from the same tonal family.
- **Strictly avoid color clashes**: Never put green hover effects over rose or wash backgrounds. On rose listings, use `var(--surface-tint-plum-selected)` with an inset `var(--brand-primary)` highlight.

### 4.6. Strict Ban On All-Uppercase Text
- All labels, tags, badges, buttons, and headings must use **Titlecase** or **sentence case** (e.g. *Today*, *Now*, *Open now*, *Directions*).
- The CSS property `text-transform: uppercase` is **strictly forbidden** everywhere in the repository. This rule is enforced by automated test in `tests/styles.test.mjs`.

---

## 5. Directory Data & Domain Rules

### 5.1. UK Timezone (Europe/London)
All library opening hours, schedule lookups, and live status evaluations must evaluate against UK local time (`Europe/London`). This ensures that Daylight Saving Time (British Summer Time / GMT) transitions are accurately handled.

### 5.2. Statutory Status Prior to Closure
When a library building closes permanently or de-commissions:
- Its `statutory` flag remains what it was **immediately prior to closure** (e.g. if it was a statutory public library service point when open, `statutory: true` is preserved).
- Do not clear or nullify the statutory status simply because the building is closed.

### 5.3. Authority vs. Operator
Always distinguish between the statutory local authority and the service operator:
- In Northern Ireland, the statutory authority is **Northern Ireland** (GSS code `N92000002`), while the service operator is **LibrariesNI**.
- Links in the authority record point to the operator's official online presence ([Libraries NI](https://www.librariesni.org.uk/)).

### 5.4. Zero Tolerance For Validation Exceptions & Open Checks
- The library directory must maintain **0 validation exceptions** and **0 open manual checks**.
- Before committing any data changes, run `npm run directory:check` to ensure all 4,200+ records are valid.

---

## 6. Frontend Performance & Client JavaScript

1. **Static HTML First**: Astro renders static HTML with zero JavaScript by default. Only add client `<script>` tags to components that require interactive capabilities (e.g. `OpeningHours.astro`, `LibraryMap.astro`, `LibrarySearch.astro`).
2. **Native Platform Over Heavy Frameworks**: Use native HTML5 and modern browser APIs first:
   - Use `popover="auto"` and `popovertarget` for dropdowns and popovers.
   - Use standard `<dialog>` for modal dialogs.
   - Do not pull in heavy UI frameworks (React, Vue, Lit, etc.) for simple interaction.
3. **Focused Micro-Libraries**: When external client libraries are required, use lean, purpose-built libraries:
   - `maplibre-gl` for vector map rendering.
   - `embla-carousel` for accessible, lightweight carousels.
   - `@github/combobox-nav` for accessible keyboard navigation in comboboxes.

---

## 7. Verification & Quality Assurance

Before concluding any work, every contributor and agent must run the standard verification suite:

1. **Automated Unit & Integration Tests**:
   ```bash
   npm test
   ```
   Runs all tests via Node's native runner (`node --test`). All tests must pass.

2. **Style & Token Hygiene**:
   ```bash
   node --test tests/styles.test.mjs
   ```
   Verifies token usage, preview bundle imports, and enforces the strict ban on uppercase transformations.

3. **Directory Data Audit**:
   ```bash
   npm run directory:check
   ```
   Ensures 0 schema validation exceptions and 0 open manual review checks across all records.

4. **Production Build**:
   ```bash
   npm run build
   ```
   Ensures all 4,700+ static HTML pages, search indexes, and CSS bundles compile without warning or error.
