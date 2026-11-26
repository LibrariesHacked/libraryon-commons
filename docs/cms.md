# The LibraryCommons CMS

LibraryCommons uses [Decap CMS](https://decapcms.org/) to edit library information and website
content. The editor is at <https://edit.librarycommons.org.uk/>.

Editors sign in with Netlify Identity. Git Gateway saves their changes to this repository, so they
do not need GitHub accounts. The website is built from the saved files.

This guide introduces the system and explains its maintenance. For everyday editing instructions,
see the [Editing guide](../src/content/pages/editing-guide.md).

## What you can edit

The left-hand menu groups content into collections:

| Collection                 | What it contains                                                              |
| -------------------------- | ----------------------------------------------------------------------------- |
| Site Settings              | Site title, navigation, homepage, redirects and interface wording             |
| Editorial Content          | Articles, collection pages, case studies, grants, conferences and legal pages |
| Frequently Asked Questions | Shared questions and answers                                                  |
| Resources And Downloads    | Documents, slides, recordings and links                                       |
| Conference Sessions        | Speakers, descriptions and resources for each session                         |
| Library Authorities        | Service-wide contacts, websites, digital services and fines                   |
| Libraries                  | Individual branches, addresses, facilities and opening hours                  |
| Contributors               | Profiles, biographies and images                                              |
| Organisations              | Organisation profiles                                                         |

General editors can edit all these collections. Service editors can save library and authority
records for their assigned local authorities. Libraries are grouped into a separate collection for
each service, such as **Libraries — Manchester**. Service editors see only their assigned services;
general editors see all services and **Libraries — Unassigned**.

## Saving and publishing

Select **Publish** to save an entry. On the live CMS, this writes to the repository's `main` branch.
Automated checks then run, and the public website and CMS are rebuilt. The public site is hosted on
GitHub Pages; the editor is hosted on Netlify.

Changes take a few minutes to reach the website. A saved entry and the currently published page can
therefore differ while a deployment is running.

If an entry fails to load, reload it before continuing. Repeated loading or publishing failures
should be reported to a maintainer.

## Editing the library directory

### Authority and branch details

Open the library collection for the relevant service. Its authority is set automatically, including
the name and GSS code. A service list retrieves only that service's library files.

The authority relationship identifies the service record used by the website. The saved name and
code also appear in directory exports. Unassigned records keep their existing name and code.
To transfer a library to another service, ask a maintainer to update its authority and move its file
to the matching service folder.

Authority records hold service-wide information. Branch records hold details specific to a location.
For example, a service's main catalogue belongs in **Library Authorities**, while a branch's
telephone number belongs in **Libraries**.

### Facilities and opening hours

**Facilities and services** is a searchable multi-select. Separate Yes/No fields describe specific
facilities and accessibility features. Blank values mean the information is not recorded.

Staffed and unstaffed opening hours have separate daily fields. Each day lets you add opening and
closing times as separate periods:

- One period: enter `09:00` and `17:00` in the **Opens** and **Closes** fields.
- Split sessions: select **Add time period** for each interval, such as `09:00`–`12:30` and
  `13:30`–`17:00`.
- Midnight closing: enter `24:00` as the closing time.
- Closed or not recorded: leave the day blank.

The form checks that sessions are valid, in order and do not overlap. Use **Special hours** for
one-off changes: add a date, mark it **Closed all day** or enter its hours. Add the same date again
for split hours. Set the optional end date to the following day when a period closes after midnight.
The dated periods follow the Google Business Profile special-hours format, and existing free-text
notes are preserved. A branch's overall **Status** is separate from its daily schedule. **Year
opened** is optional; leave it blank if unknown.

Fine amounts are in pounds per selected fine interval. Zero means fine-free; blank means unknown.

### Review and exports

The **Data review** link opens a searchable list of records needing attention. It links to the
entry, public page and supporting evidence.

Directory forms also contain **Manual checks** and **Validation exceptions**. Correct the relevant
field to resolve an exception. Remove a manual check after completing its review. Review pages
update with the next build.

The directory and authority pages offer CSV downloads. The complete CSV includes every record; the
validated CSV includes only records passing all schema checks. A separate report explains validation
issues.

## Editing pages and shared content

Each editorial page has a **Site path**, such as `/stories/my-library`. This determines its public
URL. **Publish on site** controls whether the page appears on the website.

The content editor offers Rich Text and Markdown modes. In Rich Text, use **+** to add components
such as quotes, cards, images, videos, carousels and book recommendations.

Questions and answers are edited in **Frequently Asked Questions**. Documents and links are edited
in **Resources And Downloads**. Select these entries in a page's FAQ and resource fields, in the
order they should appear.

The optional `{{faqs}}` and `{{resources}}` markers place those sections within the page body.
Without a marker, they appear after the body. A preceding heading matching **FAQ Section Heading**
can provide the FAQ section's heading and introduction.

### Navigation and links

These settings have separate jobs:

- **Site Settings → Navigation** controls the header menu.
- **Site path** determines a page's URL, sitemap position and breadcrumbs.
- **Subpages** selects and orders cards on a landing page.

When changing a live page URL, add a redirect in Site Settings. Changing a title does not rename an
existing file. FAQ and resource links use filenames as IDs, so filename changes require updating
their references too. See [Preservation](preservation.md) for tools used to rename existing files
safely.

## Images and documents

Use **Media** to upload new files. These are stored in `public/uploads/community`.

Preserved LibraryOn files are kept separately in `public/uploads/archive`. Image fields offer
**Choose a preserved archive file**. The **Archive files** link opens a searchable browser where you
can copy image or document URLs. Archive files are read-only in the CMS.

The CMS serves archive files through the public website, so archive previews depend on that site
being available.

## Why some choices need a reload

Resource and authority pickers use small generated lists of names and IDs. This is quicker than
downloading every resource or authority record just to display a choice.

After creating, renaming or deleting one of these entries, wait for the automated update to finish,
then reload the CMS. An open editor can retain the previous list. Changes to an existing entry's
body or contact details do not require a new lookup choice.

Pages, FAQs and contributor pickers use Decap's regular collection lookups. CMS-wide search is
disabled to avoid loading all collections at once; searching inside pickers remains available.

## Running the editor locally

From the repository root:

1. Run `npm run dev`.
2. In a second terminal, run `npx --yes decap-server@3.11.6`.
3. Open <http://127.0.0.1:4322/admin/> and select **Login**.

Local saves change files in your working copy; they do not create commits. The local editor uses
general-editor permissions. Stop both servers when finished.

## Maintaining the CMS

### Main files

| File or folder                                                                  | Purpose                                                  |
| ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [public/admin/config.yml](../public/admin/config.yml)                           | Collections, field labels and controls                   |
| [src/pages/admin/index.astro](../src/pages/admin/index.astro)                   | Loads Decap, connects Identity and checks saves          |
| [src/content/](../src/content/)                                                 | Editable content records                                 |
| [src/data/settings.json](../src/data/settings.json)                             | Site settings                                            |
| [src/data/homepage.json](../src/data/homepage.json)                             | Homepage content                                         |
| [src/data/schemas/](../src/data/schemas/)                                       | Directory field types and validation rules               |
| [src/data/auth/domain-permissions.csv](../src/data/auth/domain-permissions.csv) | Email domains, editor roles and authority codes          |
| [netlify/functions/](../netlify/functions/)                                     | Identity registration and login hooks                    |
| [src/lib/cms/](../src/lib/cms/)                                                 | Editor components, directory controls and review helpers |

The browser loads Decap CMS **3.18.0** with its standard Git Gateway backend. The complete
configuration is embedded in the editor page, avoiding a second configuration download.
The single Libraries form in the configuration is a template: initialization expands it into
ordinary Decap folder collections using the authority lookup list. Library files live in
`src/content/libraries/<authority>/<slug>.json`. Filenames use the existing library slug without
repeating the authority. IDs and public URLs are unchanged.
The 16 corrected legacy slugs are listed in
[library-slug-changes.json](../migration/directory/library-slug-changes.json); their old public URLs
redirect to the corrected ones.

Small extensions provide archive selection, page components and directory controls. The facilities
control uses Decap's native select while keeping the directory's semicolon-separated storage format.
Opening hours use native text inputs with session validation. Authority name and code are filled
during the existing save checks.

Directory saves validate field types and values, check the editor's authority scope, and stamp
edit/review dates. Existing documented data gaps can remain as validation exceptions.

### Updating controls and lookup lists

Directory forms are generated by [scripts/directory-schemas.mjs](../scripts/directory-schemas.mjs).
Update the generator when changing their controls, then run `npm run directory:schemas`.

Facility choices live in [src/data/cms-facilities.json](../src/data/cms-facilities.json). Run the
same command after changing that list.

Resource and authority lookup files live in [src/data/cms-lookups/](../src/data/cms-lookups/). After
changing source entries locally:

```sh
npm run cms:lookups
npm run cms:lookups:check
```

Commit the generated files with the source changes. On `main`, the deployment workflow regenerates
the lists, tests them and commits any updates before deploying. Its workflow token needs permission
to push to `main`. Token-generated commits do not start another push workflow.

Authority lookups include the name and GSS code used during saves. The editor embeds this small
identity list, so resolving a selection needs no additional backend request.
Adding an authority also adds its library collection after the next deployment. Service editors'
authority forms use native file collections, so multi-service accounts retrieve only their assigned
authority records.

For the initial folder migration, close old editor tabs before deployment and reload the CMS
afterward. The repeatable `node scripts/directory/split-libraries.mjs` command moves flat files or
renames prefixed files in service folders without rewriting them, and updates migration replay paths.
Subsequent directory imports write directly into service folders using slug-only filenames.

### Further reading

- [Editing guide](../src/content/pages/editing-guide.md): instructions for editors.
- [Site hosting](site.md#hosting): GitHub Pages and Netlify setup.
- [Development](development.md): page templates and rendering.
- [Preservation](preservation.md): original material, filenames and migration tools.
- [Directory migration](../migration/directory/README.md): source data and audit procedures.
