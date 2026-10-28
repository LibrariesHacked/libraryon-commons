# Preserving The Original Material

You do not need these tools to edit or build LibraryCommons. They collect
original material and help check what was saved.

## What Is Kept

- `preservation/` contains three compressed JSON files: original page content,
  API data and example HTML/CSS/JavaScript/font files. Together they are about
  9.5 MB. `manifest.json` lists their checksums.
- `public/uploads/archive/` contains imported images and downloads. Identical
  files share one copy. The import report links filenames to source URLs.
- `migration/` contains the import report, checksums that protect edited files,
  and the original article body checksums.
- `archive/` may contain larger raw captures, screenshots and browser responses.
  It is local-only, ignored by Git and not needed for the site.

The source bundles are evidence, not the live content database or original CMS
code. Current library details are in the individual CMS records. No LFS is used.
See [the bundle guide](../preservation/README.md) to inspect the originals.

The saved Strapi export contains all 3,811 library rows and all top-level scalar
fields. The collector explicitly populates library events and each event's tags
and occurrences. It stops before following an event's library relation back into
the event graph, which would duplicate data cyclically. UPRN was null on 3,808
source rows and populated on three; those three values are also in the editable
library records and the UPRN field is available in Decap.

## Archive Commands

Run these commands from the repository root. The tools live in `scripts/archive/`:

| Command                                | What It Does                                        |
| -------------------------------------- | --------------------------------------------------- |
| `npm run archive -- --api --data-only` | Download public API collections                     |
| `npm run archive -- --assets`          | Save unique pages and linked first-party assets     |
| `npm run capture -- --mobile`          | Optionally save browser screenshots and responses   |
| `npm run import:archive`               | Convert raw articles/resources and copy local media |
| `npm run compact:archive`              | Compress source evidence into three bundles         |

After an intentional Markdown-converter cleanup, use
`npm run import:archive -- --refresh-markdown` to refresh previously managed
page files and their body fingerprints. Unknown files remain protected; the raw
captured HTML is not modified.

Collection needs the original services online. Importing and compression need a
local raw `archive/` folder. Browser capture also needs
`npx playwright install chromium`.

The importer does not change library records or site settings. It protects edited
and unknown files using `migration/import-state.json`; review reported conflicts
instead of deleting that state. It does not recreate old directory snapshots or
prototype template files. Use the CMS for normal library maintenance.

Collection uses public GET requests only. Its default scope is LibraryOn and the
LibraryOn DigitalOcean bucket. API collection needs `--api` because robots.txt
excludes `/cms/`; the owner approved those public API GETs on 27 October 2026.
Requests are rate-limited and failures are reported. Do not attempt private CMS
access. Use a fresh `--output archive-YYYY-MM-DD` for a new collection date.

## Coverage And Limits

The source capture has 36 canonical pages, including two example directory pages,
3,811 library records, 218 authorities, 2,553 events and 18 tags. The captured
DigitalOcean download links have local copies, including 13 Press Play PDF slide
decks, its programme/timetable and evaluation case studies.

Some external content remains linked: YouTube recordings, a Canva presentation,
a university thesis and an unavailable Eventbrite image. Unlinked pages/uploads,
private fields and original application code may be missing. This is not a full
offline browser-replay archive.

## Rights And Backup

Original LibraryOn / British Library content is
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) except where otherwise
noted. Keep source links and credits. Check individual photos, logos, fonts,
documents and videos for exceptions, and review personal contact fields before
publishing. The software licence does not replace the content licence.

Keep two verified copies of the preservation set on separate storage. Back up raw
browser captures separately if you want to retain them; they are not in Git.
