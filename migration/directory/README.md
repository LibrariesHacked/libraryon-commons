# Directory Migration Audit

## Initial Migration

The 4 November 2026 migration retains all 3,811 LibraryOn listings and all 218 services, adds 427 distinct historical closed-building records, and fills 948 missing UPRNs. Existing IDs, slugs, source identifiers, source URLs, and update/review/import dates are unchanged. Historical additions have `updated_on: null`.

The latest machine-readable counts and decisions are in [report.json](report.json). Review items are decisions, not a count of distinct libraries: a record may have multiple issues or supporting rows.

## Record Structure

Each JSON file remains individually editable under `src/content/libraries` or `src/content/authorities`. Its `data` object is the final authoritative structure: every field from the corresponding Table Schema, using the exact names and typed values. Missing values are explicit `null`s. Stable IDs, routing, and dates are metadata outside `data`, alongside `validation_exceptions` and optional `manual_checks`. There is no legacy `extensions` payload; validation rejects legacy or unknown top-level fields.

Original opening-time frames and identifiers remain in the immutable source baseline, not alongside canonical values. Useful source details without an exact schema field, such as service links, broad accessibility descriptions, virtual tours, and branch-specific catalogue links, are retained under `unmapped` in the audit and flagged for manual review. They are not silently mapped to a different meaning or read by the site. Raw source rows for added historical buildings are retained under `added` in the audit.

Each manual check contains only a kind, reason, and evidence references. A reference such as `migration/directory/report.json#review_<hash>` identifies the matching `review_id` in the audit's `review` array. IDs are content-addressed, so reordering review entries cannot silently redirect a check to another record. Source payloads stay out of these live-file annotations.

The supplied specifications are copied unchanged to `src/data/schemas`; interfaces and CMS fields are generated from them. Runtime validation checks types, formats, enums, ranges, opening sessions, and declared unique constraints. The TypeScript adapter derives the public site model from canonical fields, not stale legacy copies.

Not every source record satisfies the supplied required fields. `validation_exceptions` documents exact unresolved values, including unknown statutory status, missing postcodes/GSS codes, retained invalid contact details, and Crown Dependencies outside the supplied country enum. These records are deliberately retained: this is **not** an exception-free strict-schema export. Type errors, missing schema keys, unknown fields, invalid hour strings, and out-of-range numbers cannot be excused. Resolved exceptions must be removed; stale exceptions fail validation.

## Source Priority

1. LibraryOn baseline: authoritative current values and all original dates.
2. `tempdata/libraries.csv`: fill missing durable facts after a strong building match.
3. Arts Council's `English Public Libraries Location Dataset 2024.xlsx`: lower-priority supporting evidence, including historical buildings.
4. `tempdata/Services-Grid view.csv`: service candidates joined by a unique, valid GSS code, with live checks for URLs/software claims.

The two supplied JSON files in `tempdata` are schema specifications, not additional observations. Source files, baseline, overrides, schemas, migration code, and ONS archives are identified by SHA-256 in the audit.

Matching requires authority, compatible library name, postcode, and specific address evidence. Conflicting street names or building numbers reject a match. Multiple candidates and multiple rows from the same source claiming one target are withheld. Name-scoped historical postcode corrections from `load_england_2023.sql` are used as matching evidence, with SQL line numbers retained; they do not silently override LibraryOn. Its destructive deletion/status statements are never executed. Its UPRN format, existence, and geographic checks are implemented using current lookup evidence instead of replaying the old SQL.

Existing nonblank LibraryOn fields win. Older closure years cannot be attached to a currently open record. Time-sensitive operating models, hours, contacts, URLs, and co-location claims are not backfilled merely because an old row matches. Statutory status is filled only where the two matched supporting datasets agree; that agreement is not a new independent survey. Remaining gaps and conflicts are reviewable, not inferred.

## ONS Verification

The local root archives are ignored by Git and streamed without full extraction:

- `nsul.zip`: NSUL September 2026, UPRN/postcode associations and British National Grid coordinates. It does **not** supply building names or street addresses and does not establish building identity alone.
- `onspd.zip`: ONSPD August 2026, current/terminated postcodes, coordinates, and geographic codes.

[lookups.json](lookups.json) retains only relevant rows, archive hashes, entry paths, CSV row numbers, and lookup outcomes. The initial scan located 5,422 of 5,424 requested postcodes (including 69 terminated codes), and 2,164 of 2,388 candidate UPRNs. Missing entries remain unresolved. Absence from NSUL is not proof that a building never existed, particularly for historical or uncovered records.

A new UPRN requires a strong unambiguous source/building match, an exact NSUL postcode association, a current ONSPD postcode, and an NSUL property point within 100 metres of the independent LibraryOn point. Conflicting UPRN candidates are withheld. Duplicated new UPRN claims are withdrawn rather than arbitrarily assigned. Original LibraryOn UPRNs are retained and separately audited.

NSUL grid points are transformed with `proj4` and the standard OSGB36 seven-parameter Helmert transformation. This is approximate, not a survey-grade OSTN15 transformation. The distance is corroborating evidence, never a substitute for address identity. ONSPD postcode centroids are not used as library building locations.

The cached live pass covers 1,048 distinct service URLs. HTTP failures, timeouts, cross-domain redirects, generic landing redirects, and soft-error/CAPTCHA pages require review. New URL fields require a successful library-relevant same-domain result. A vendor or catalogue front end does not prove a particular back-end LMS: only matching product evidence is accepted. Unconfirmed suppliers/systems remain blank. A failed request may reflect bot protection or a temporary outage, not an invalid URL.

ONS, OS, Royal Mail, and other source rights remain governed by their original dataset terms, not the repository's software MIT licence. Consult the supplied product documentation before redistributing source archives or extracts. See [ONS Open Geography](https://geoportal.statistics.gov.uk/) for the products and licensing information.

## Hours And Closed Buildings

Hours are normalized as `09:00-17:00` or `09:00-12:00,13:00-17:00`. Staffed/volunteer sessions and self-service sessions are kept in separate fields. A blank or `null` field implies closed for that access type; canonical files store `null`, never the text `Closed`. Import conversion translates legacy closed labels to `null`, while validation rejects them in canonical records. Nine invalid/ambiguous sessions remain in the source audit with manual checks, without AM/PM guesses. The Arts Council workbook's broad AM/PM labels are not invented clock times. Daily hours do not change the overall library `Status`.

Every original closed listing is retained. Additional historical rows need a closure year, recognized authority, address, postcode, and no plausible existing building. Same UPRNs, exact addresses, or matching specific street/building addresses prevent duplicate additions even when names/postcodes differ. Ambiguous historical rows remain in `review`; moved sites with distinct addresses remain separate and do not close or overwrite the current site. Old hours are not published as current hours for historical additions.

## Audit Files

- [libraryon-baseline.json.gz](libraryon-baseline.json.gz): immutable snapshot before migration; do not replace it with migrated data.
- [report.json](report.json): sources/hashes, matches, field changes with before/after values and evidence, conflicts, historical additions/source rows, unmapped source details, content-addressed review items, validation exceptions, and summary.
- [lookups.json](lookups.json): ONS evidence plus timestamped HTTP outcomes, final URLs, titles, and software signals. Lookup dates are not library update dates.
- [sql-postcode-corrections.json](sql-postcode-corrections.json): extracted corrections with source line numbers.
- [overrides.json](overrides.json): editable decisions for source exclusions, authority aliases, constrained matches, and field corrections.
- [written-files.json](written-files.json): hashes of last-written records; prevents overwriting subsequent editorial changes and permits removal of unchanged migration-only additions when policy changes.

## Review And Replay

```sh
npm run directory:schemas
npm run directory:lookups -- --ons-only
npm run directory:lookups
npm run directory:migrate
npm run directory:migrate -- --write
npm run check:directory
npm test
npm run build
```

The lookup command needs both root ZIPs. `--ons-only` avoids network requests. Completed local scans and HTTP results are cached; remove a specific stale URL entry from `lookups.json` to retry it. Tests/builds use the committed extracts and do not need the root ZIPs or live access. A dry run updates audit reports but not content records. Replays always start from the preserved baseline and refuse to overwrite edited output files; reconcile later edits deliberately before applying a replay.

To exclude a suspect source row, add its key (for example `libraries.csv:123`) to `excluded_sources`. Keys use physical CSV/XLSX row numbers including the header. `authority_aliases` maps an exact source authority name to a current slug. `matches` may disambiguate only candidates that already pass the safety rules; it cannot force an unrelated building match.

For a verified field correction, append a `field_overrides` entry with `id`, exact schema `field`, `before`, `value`, `reason`, and `evidence` (such as an official building page plus ONS references). The current value must still equal `before`; stale overrides fail. Overrides are explicit permission to replace a LibraryOn value, so review their evidence carefully. The migration does not stamp a new library date when applying them.

### Maintainer Review Decisions

`review_resolutions` in `overrides.json` records dated workflow decisions with a selector, status, decision, and rationale. Policies match an issue kind or its displayed reason, with exclusions and a specific null-postcode/null-lookup condition where needed. Resolved items remain in `report.json` with their original evidence and stable `review_id`; resolution metadata is excluded from that identity. They are no longer attached as open `manual_checks`. The summary separates approved, deferred, archived, and pending items.

The maintainer's 4 November 2026 decisions approve retaining existing LibraryOn URLs and the generic audit-review cases, defer missing-postcode/null-lookup checks, and archive non-actionable unmapped details. Non-null postcode problems remain open. Required-field validation exceptions are not waived by any review decision.

Historical LMS/catalogue hints (511 items) and ebook/audiobook supplier hints (403 items) are archived without populating unconfirmed fields. The 3,339 unmatched source rows are deferred, not discarded or force-matched; some may identify additional historical buildings. Every existing library, canonical field, source date, and validation exception is preserved.

After these decisions, 456 audit items remain open: 390 unconfirmed UPRN candidates, 48 non-null postcode problems, nine invalid opening-hour sessions, three authority-name differences, three original UPRN confirmations, and three historical postcode corrections. These are audit-item counts, not distinct-library counts. Replays apply the same explicit decisions; removing a policy makes its corresponding checks eligible for review again.

Prioritize the remaining UPRN/postcode problems and invalid hours. The unmatched-building backlog is deferred, and the historical supplier/software hints are audit-only. Required-field gaps still need actual source evidence, not placeholder values. The test suite verifies all original IDs/routes/dates, every accepted new UPRN's ONS evidence, schema validation, and overwrite protection.