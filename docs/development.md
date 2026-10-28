# Changing Code And Templates

The site has three main building blocks:

- **Routes** in `src/pages/` decide what appears at a website address.
- **Templates** in `src/templates/` arrange a particular type of content.
- **Layouts and components** share the header, footer and smaller reusable pieces.

## Template Map

```text
SiteLayout                  Header, navigation, metadata and footer
  HomeTemplate              Commons homepage
  EditorialLayout           Article header, contents and source credits
    ArticleTemplate         Article body, images and related resources
      CollectionTemplate    Collections
      CaseStudyTemplate     Case studies
      GrantTemplate         Grants and programmes
      LegalTemplate         Policies and legal pages
      LandingTemplate       Topic pages with links to child pages
      ConferenceTemplate    Conference body and optional session index
  DirectoryLayout           Library and authority page structure
    AuthorityTemplate       Authority details and its libraries
    LibraryTemplate         Library contacts, hours, accessibility and notes
  ResourceTemplate          Resource details, download link and credits
  SessionTemplate           Speakers, slides and recordings
  ContributorTemplate       Contributor profile
```

`src/lib/templates.mjs` chooses the editorial template. The CMS type selector and
`src/content.config.ts` must agree about the available types. Existing grants and
legal pages also use their paths to select a template, without changing their
original article files.

Shared components include `ContactDetails`, `OpeningHours`, `DirectoryProvenance`,
`ArticleMedia`, `ArticleCards` and `ResourceLink`. Reuse them rather than copying
the same markup into several templates.

## Directory Data

Each JSON file in `src/content/libraries/` contains one library and its authority
link. Each file in `src/content/authorities/` contains one authority. The code in
`src/lib/directory-model.mjs` checks those links and builds search data and public
addresses. Authority library lists are calculated; do not keep a second copy of
every library inside an authority record.

## Scripts And Tests

`scripts/archive/` holds optional collection, capture, import and compression
tools. `tests/` holds all tests. Normal site editing does not require the archive
scripts or the ignored `archive/` folder.

Run `npm test` after a change, and `npm run build` when changing routes, templates
or content rules. Tests cover links, original article checksums, directory records,
duplicate files and import safeguards. Main code interfaces have JSDoc comments.
Keep helpers small and explain non-obvious side effects.

Do not reformat imported articles or binary source bundles. The original article
bodies are protected by `migration/source-articles.json`; new work belongs in a
new content entry. Source files can be compared with the preserved originals.
