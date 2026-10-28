# Running And Hosting The Site

LibraryCommons is a static Astro site built entirely from files in this repository. It requires no database, external API, or map service at runtime.

## Local Development

Requires Node.js `22.23.4` or later:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4322/>. For local CMS editing at `/admin/`, also run the local backend described in [Editing Content](cms.md#open-the-local-editor).

## Test And Build

```sh
npm test
npm run build
npm run preview
```

- `npm test` validates schemas, routes, links, media references, and preserved article checksums.
- `npm run build` outputs the static site to `dist/`.
- `npm run preview` serves `dist/` locally.

## Deployment

Host `dist/` on any static hosting provider that:

1. Serves `index.html` from directory routes
2. Serves `404.html` for missing routes
3. Resolves `/page` and `/page/` consistently

### Build Environment Variables

Set `SITE_URL` (and optionally `BASE_PATH` for subfolder deployments) when building:

```sh
SITE_URL=https://example.org BASE_PATH=/libraryon-commons/ npm run build
```

If deploying under a subfolder, update `public_folder` in `public/admin/config.yml` to match.

### CMS Authentication

To enable browser editing in production at `/admin/`, configure GitHub OAuth on your host targeting `LibrariesHacked/libraryon-commons` (`main` branch), and trigger a static rebuild on new commits.

## Site Capabilities

- **Included:** Editorial pages, collections, conference sessions, downloadable resources, authority indexes, individual library pages, and client-side search by library name, town, authority, or postcode text.
- **Not included:** Interactive slippy maps, distance/postcode geocoding, or live event feeds. External videos (YouTube) and Canva decks remain outbound links or embeds.
