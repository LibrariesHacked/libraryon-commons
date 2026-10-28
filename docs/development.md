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

## Directory Model

Each library (`src/content/libraries/*.json`) references its parent authority (`src/content/authorities/*.json`) by slug. `src/lib/directory-model.mjs` validates these relationships, computes each authority's member list, calculates nearby libraries, and generates the client search index (`/directory.json`).

## Testing

Run `npm test` after code or content changes, and `npm run build` when modifying routes, templates, or schemas.

Do not modify the 34 preserved LibraryOn article bodies or the compressed bundles in `preservation/`.
