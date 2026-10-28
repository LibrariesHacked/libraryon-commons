# Running And Hosting The Site

LibraryCommons is a static Astro website. It builds from files already in this
repository. It does not need the original LibraryOn site, raw captures, a database
or a mapping service.

## Run Locally

Use Node.js 22.23.4 or later:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4322/>. If that port is in use, use the address Astro prints.
To edit through the CMS, also start the file service in the
[editing guide](cms.md#open-the-local-editor).

## Check And Build

```sh
npm test
npm run build
npm run preview
```

The tests check the code and content. The build creates the website in `dist/`.
Preview lets you inspect that built version. Do not commit `dist/`, `node_modules/`
or `.astro/`; they are generated and ignored by Git.

## Deploy

Choose a static host that serves `index.html` from page folders, supports a
custom `404.html`, and resolves both `/page` and `/page/` to the same page (or
redirects the slashless form to the slash form). Configure it to run `npm ci` and
`npm run build`, then publish `dist/`. No server-side Node.js process is needed
for the public site.

Set `SITE_URL` to the public address at build time. For a subfolder, also set
`BASE_PATH`:

```sh
SITE_URL=https://example.org BASE_PATH=/libraryon-commons/ npm run build
```

For subfolder hosting, update Decap's `public_folder` upload path to match. The
site handles its own page, image and search-index paths during the build.

Public hosting and production CMS authentication are not configured yet. A host
should rebuild after a CMS commit. Configure GitHub OAuth for hosted editing;
do not expose the local Decap file service.

## What Works

Articles, collections, conference sessions, local downloads, a resource catalogue
and individual library/authority pages are included. Search matches names, places
and postcode text; it does not calculate the nearest library. Authority lists work
without JavaScript; interactive filtering needs it.

Maps, geocoding and live event search are not included. External videos and Canva
presentations remain links. Review rights, contact details and current legal
notices before public release.
