# Running And Hosting The Site

LibraryCommons is a static site built entirely from files in this repository using Astro. It requires no database, external API, or map service at runtime.

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

## Split Hosting

The public website is published by GitHub Pages. The editor is served from a small Netlify site connected to this repository. GitHub Actions builds both artifacts: the public Pages site and a CMS-only bundle for Netlify. Netlify's automatic builds are skipped, so content changes do not use Netlify build minutes.

Editors sign in through Netlify Identity and Decap Git Gateway. They do not need GitHub accounts or repository write access. Keep the CMS invite-only and use the maintainer's GitHub connection for repository access.

Netlify still needs a GitHub connection to this repository for Git Gateway, but it does not build the public website. A maintainer account connects the repository; invited editors make changes through the CMS and do not receive GitHub permissions. GitHub Actions is the only service that builds the public site.

### 1. Set Up GitHub Pages

1. In GitHub, open **Settings → Pages** for `LibrariesHacked/libraryon-commons` and choose **GitHub Actions** as the build source.
2. Verify `librarycommons.org.uk` for the `LibrariesHacked` GitHub organization under the organization's Pages settings. GitHub will show a TXT record name and value; add that TXT record in Cloudflare DNS and wait for GitHub to confirm it before assigning the domain to Pages.
3. In **Settings → Pages → Custom domain**, set `librarycommons.org.uk`.
4. In **Settings → Secrets and variables → Actions → Variables**, these defaults are already in the workflow. Set `CMS_URL` if you change the editor hostname:

	| Variable | Value |
	| --- | --- |
	| `SITE_URL` | `https://librarycommons.org.uk/` |
	| `BASE_PATH` | `/` |
	| `PAGES_DOMAIN` | `librarycommons.org.uk` (hostname only) |
	| `CMS_URL` | `https://edit.librarycommons.org.uk/` |

5. In Cloudflare DNS, add these apex records with TTL **Auto**. Start as **DNS only** (gray cloud) while GitHub verifies the domain and provisions its certificate:

	| Type | Name | Target |
	| --- | --- | --- |
	| A | `@` | `185.199.108.153` |
	| A | `@` | `185.199.109.153` |
	| A | `@` | `185.199.110.153` |
	| A | `@` | `185.199.111.153` |
	| AAAA | `@` | `2606:50c0:8000::153` |
	| AAAA | `@` | `2606:50c0:8001::153` |
	| AAAA | `@` | `2606:50c0:8002::153` |
	| AAAA | `@` | `2606:50c0:8003::153` |

	Remove conflicting apex A/AAAA records first. Optionally add a CNAME from `www` to `librarieshacked.github.io`, initially DNS-only; GitHub Pages redirects it to the apex when both are configured. The workflow writes `librarycommons.org.uk` to `CNAME`.
6. Wait for DNS to propagate, then confirm **Enforce HTTPS** is available in GitHub Pages settings.
7. After the first successful workflow run, check the **github-pages** environment and open <https://librarycommons.org.uk/>.
8. Once HTTPS works directly at GitHub Pages, turn on Cloudflare proxy (orange cloud) for the apex A/AAAA records and optional `www` CNAME. In Cloudflare **SSL/TLS → Overview**, choose **Full (strict)**. GitHub Pages and Netlify use managed hosting; if proxying causes certificate, redirect, or routing errors, switch the affected record back to DNS-only.

The repository is configured by default for `https://librarycommons.org.uk/` at the domain root. GitHub Pages on a free plan requires a public repository; this project is open source. Do not create a wildcard DNS record for this domain.

### 2. Create the Netlify Editor Site

1. In Netlify, create a site linked to `LibrariesHacked/libraryon-commons`, using the `main` branch. Authorize the maintainer's GitHub account and keep this repository connection; Git Gateway needs it to write CMS changes. Editors themselves do not need GitHub accounts or write access.
2. Netlify reads [netlify.toml](../netlify.toml). Its ignore command skips Netlify's own builds. GitHub Actions will deploy only `.deploy/netlify-admin` to this site; it does not publish the public site to Netlify.
3. Under **Domain management → Add a domain**, add `edit.librarycommons.org.uk`. Cloudflare DNS should contain:

	| Type | Name | Target | Proxy status |
	| --- | --- | --- | --- |
	| CNAME | `edit` | The `*.netlify.app` hostname assigned to this Netlify site | DNS only initially |

	Leave the record DNS-only while Netlify verifies the domain and provisions its TLS certificate. After `https://edit.librarycommons.org.uk/` works directly, you can turn on Cloudflare proxy for `edit` as well. Keep Cloudflare SSL/TLS on **Full (strict)**.

### 3. Deploy the CMS Bundle Once

1. Copy the site ID from **Site configuration → General → Site details**. Create a Netlify personal access token in **User settings → Applications**.
2. In GitHub, open **Settings → Secrets and variables → Actions → Secrets** and add:

	| Secret | Value |
	| --- | --- |
	| `NETLIFY_SITE_ID` | The Netlify site ID |
	| `NETLIFY_AUTH_TOKEN` | The Netlify personal access token |

3. Run **Actions → Deploy LibraryCommons → Run workflow**. This publishes the CMS-only bundle; Netlify's automatic build remains skipped. Deploying once also gives `https://edit.librarycommons.org.uk/admin/` its CMS files before enabling Identity.

### 4. Enable Editor Login

1. In the Netlify site dashboard, enable **Identity** and set registration to **Invite only**.
2. Under **Identity → Services**, enable **Git Gateway** for the linked GitHub repository and `main` branch. If Netlify asks for repository credentials or an access token, use the maintainer connection and follow the current Netlify prompts; do not put that credential in the repository.
3. Under **Identity → Users**, invite one trusted test editor. They accept the email invitation and open <https://edit.librarycommons.org.uk/>. The CMS bundle redirects the subdomain root to Decap's `/admin/` page. Editors do not need a GitHub account.

See Netlify's [Identity setup](https://docs.netlify.com/manage/security/secure-access-to-sites/identity/overview/) and [Git Gateway guide](https://docs.netlify.com/manage/security/secure-access-to-sites/git-gateway/).

Netlify Identity provides invite emails and account login, not a passwordless magic link for every login. It does not provide a built-in allowlist for government email domains. Invitations are the access control for this setup; a domain rule can be added later if needed.

If Cloudflare proxy is enabled for `edit`, make sure any Cloudflare cache rule bypasses `/admin/*`, `/.netlify/identity/*`, and `/.netlify/git/*`. Do not require an interactive challenge on those paths; it can interrupt login and CMS API requests. Static CMS assets can remain proxied and cached. Test an editor login and draft submission after changing proxy or security rules.

### Managing Editors

Add or remove editors in the Netlify site's **Identity → Users** list. Keep registration set to **Invite only** so an email address alone cannot create an editor account. An invitation proves control of that mailbox; it does not automatically verify which council the person represents. Netlify Identity roles can group editors, but Git Gateway currently gives an authenticated editor access to this repository rather than restricting them to one council's records.

If automatic council-domain eligibility is needed later, add a server-side Identity signup rule that checks an approved domain list and assigns a role. Do not rely on a browser-only email check. Domain rules are not configured by this repository.

Keep the Netlify token as a GitHub secret; never commit it or put it in a repository variable. Use a maintainer-owned token and rotate it if that maintainer leaves or the token may have been exposed. After setup, pushes to `main` publish the public site to GitHub Pages and the CMS-only bundle to Netlify.

### 5. Check the Setup

1. Merge a small documentation-only change to `main`.
2. Confirm **Deploy LibraryCommons** runs its tests, builds the Pages artifact, and publishes both targets.
3. Open the public domain and confirm pages, images, search, and internal links work. Check that the **Content management** footer link opens the editor subdomain, not the Pages site.
4. Open <https://edit.librarycommons.org.uk/>, sign in as the invited test editor, and create a draft page. Confirm it appears as a pull request in GitHub.
5. Check that uploaded test media is stored under `public/uploads/community/`, then remove the test draft through its pull request.

Confirm in GitHub that the test editor's pull request is reviewable and that the author information is sufficient for your audit needs. Git Gateway is a shared repository integration, not the same audit identity model as giving each editor a GitHub account.

The CMS workflow uses Decap's editorial workflow. Repository administrators should keep the existing `main` branch rules requiring the **Tests and build** check, maintainer approval, and code-owner review. See [reviewing changes](preservation.md#reviewing-changes).

## Site Capabilities

- **Included:** Editorial pages, collections, conference sessions, downloadable resources, authority indexes, individual library pages, and client-side search by library name, town, authority, or postcode text.
- **Not included:** Interactive slippy maps, distance/postcode geocoding, or live event feeds. External videos (YouTube) and Canva decks remain outbound links or embeds.

## Visual Design

Use the shared palette and color-pairing rules in [Brand And Color Guidelines](brand-guidelines.md). Site colors are defined in `src/styles/foundations/tokens.css` so pages and CMS previews stay consistent.
