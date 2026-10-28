# Editing Content

Decap CMS is the browser editor for LibraryCommons. It saves Markdown and JSON
files in this repository. There is no separate content database.

## Open The Local Editor

Run the site from the project folder:

```sh
npm run dev
```

In a second terminal, start Decap's local file service:

```sh
npx --yes decap-server@3.11.6
```

Open <http://127.0.0.1:4322/admin/> and choose **Login**. Local saves change files
on your computer; they do not automatically commit or publish them. Stop the file
service when finished and never expose it to the internet. Decap itself loads
from a versioned CDN URL, so the editor needs an internet connection.

## Choose What To Edit

| CMS Section             | What You Can Change                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Site Settings           | Site name, navigation, redirects and footer credits                                                    |
| Commons Homepage        | Introduction, image, headings and featured pages                                                       |
| Editorial Content       | Pages, articles, collections, case studies, grants, conferences, policies, FAQs and publication status |
| Libraries               | One library at a time: address, contacts, hours, accessibility and notes                               |
| Library Authorities     | Authority contacts, website, catalogue and service information                                         |
| Resources And Downloads | PDFs, slides, recordings, external links and credits                                                   |
| Conference Sessions     | Session details, speakers and related resources                                                        |
| Contributors            | Contributor biographies and profile images                                                             |

**Site Settings** controls the header menu, including nested submenu links and
short descriptions, shared template and search text, and the footer's single
attribution and link list.

## Add An Article

Create an entry in **Editorial Content**. Choose its type, give it a title and
a unique site path such as `/stories/my-library`, then write the body. Images,
credits, contributors and related resources are optional. The type chooses the
[page template](development.md).

**Content Origin** is editorial metadata for maintainers; it does not add a
front-end badge. Existing `libraryon.org` sources are inferred as LibraryOn
content. Set the field explicitly when a new Commons page cites a LibraryOn URL.
**Publish on site** controls visibility: unpublished records stay in the CMS but
do not receive public routes or appear as related pages. The original legal
pages and captured `/libraries` map snapshot are retained this way. The public
directory is generated from the editable library records instead.

**Updated Date** is stamped with today's date whenever a page, resource, session
or contributor is saved in the CMS. Library and authority records stamp **Last
Reviewed** instead. Dates imported from the original "Last updated" lines use
the same field. Edits made outside the CMS do not change the date.

Use **Frequently Asked Questions** for new question-and-answer groups. Each item
has a question and a plain-text answer. Existing imported FAQ sections become
expandable disclosures without changing their preserved page text.

Do not use the reserved paths `/libraries`, `/resources`, `/sessions`, `/people`,
`/admin` or `/directory.json`. Keep existing filenames stable because other
entries may refer to them.

To add a public page, create it in **Editorial Content**, leave **Publish on
site** enabled, and set its path. To link it in the footer, open **Site Settings**
and add its label and path under **Footer Links**. An unpublished archived page
may share a path with its published replacement.

The 34 original LibraryOn articles must retain their wording and credits. Their
normalized Markdown is checked against `migration/source-articles.json`; the raw
captured HTML remains unchanged. After an intentional converter cleanup, refresh
managed Markdown and its fingerprints with
`npm run import:archive -- --refresh-markdown`. New work belongs in a new entry.
The Commons homepage is edited separately from the original LibraryOn homepage.

## Maintain A Library

Open **Libraries**, find the library, and edit its entry. Each library has its own
JSON file in `src/content/libraries/`. Each authority has its own file in
`src/content/authorities/`. Choose the authority from the library's authority field.
If it does not exist, create it under **Library Authorities** first.

Keep existing IDs and URL slugs unchanged where possible. Changing the slug or
authority changes a library's public address; add a redirect in Site Settings.
New records can leave the stable ID blank. The build rejects duplicate IDs,
duplicate page addresses and authority links that do not exist.

An empty opening-hours day means closed or not supplied. Add notes for holiday
exceptions. Set **Last Reviewed** only when someone has checked the details.
Avoid personal contact information or unverified accessibility claims.

## Publish Changes

The local site refreshes as files change. A static host must rebuild after a CMS
commit before visitors see the change. There is no custom editor preview panel yet.

Hosted editing targets `LibrariesHacked/libraryon-commons`, branch `main`.
Editors need repository write access. GitHub OAuth must be configured before
hosted login works; it has not been set up. Store OAuth secrets on the auth
service, never in the CMS configuration. See [hosting](site.md).

Forms are defined in `public/admin/config.yml`. Uploads go into `public/uploads/`.
Use ordinary Git, not LFS, and check file size and rights before adding documents.
