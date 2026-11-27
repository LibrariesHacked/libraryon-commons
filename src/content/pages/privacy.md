---
title: Privacy policy
path: /privacy
kind: page
content_origin: commons
description: How LibraryCommons and Libraries Hacked protect your privacy and handle data.
---

# Privacy policy

LibraryCommons is a community project maintained by [Libraries Hacked](https://www.librarieshacked.org/). We are committed to protecting your privacy.

## Summary of principles

- **No user accounts or tracking:** We do not require you to create an account or log in to browse the site unless you wish to edit the content. We do not use advertising, marketing, or cross-site tracking cookies.
- **Search privacy:** When you search for libraries by town or postcode, or use device location, coordinates are processed securely and never saved
- **Open data & transparency:** The directory contains public-sector, non-personal data about public library services and buildings.
- **Open-source:** All code and data pipelines for this website are open-source and publicly inspectable on [GitHub](https://github.com/LibrariesHacked/libraryon-commons).

## What information we process

### 1. Library directory searches

When using the library search on [Find your library](/libraries):

- **Place and postcode lookups:** If you type a town or UK postcode to search for libraries, the query is resolved in your browser using local search indexes or secure HTTPS lookups. Postcodes and search terms are not stored, recorded, or linked to individual users.
- **Device location ("Find nearby"):** If you explicitly choose to use the "Find nearby" button, your browser requests your location coordinates via browser geolocation permissions. These coordinates are used solely within your current browser session to calculate distances to nearby libraries.

### 2. Website hosting and technical logs

The static site is hosted on GitHub Pages (with content management administration hosted via Netlify):

- Standard web traffic logs (including your IP address, browser user-agent, and request timestamps) may be recorded by the hosting infrastructure providers for security, operational reliability, and DDoS prevention, in line with [GitHub's Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement) and [Netlify's Privacy Policy](https://www.netlify.com/privacy/).
- LibraryCommons does not access hosting logs

### 3. Cookies and local storage

- **No analytics or advertising cookies:** LibraryCommons does not use Google Analytics, Meta Pixel, or other third-party tracking scripts.
- **Functional storage only:** The site may use standard browser session storage or local storage exclusively to preserve your chosen search filters or active tabs during your visit. These do not track you across the web.

### 4. Editor accounts and publishing

If you create an editor account, Netlify Identity processes your name, work email address, and
account information to verify your email and manage sign-in. We use the email domain to assign an
editor role and the library-service scope recorded in our permissions CSV. This information is for
editing access; it is not included in public library records. Netlify's handling of account data is
described in its [Privacy Policy](https://www.netlify.com/privacy/).

Publishing creates a public commit in the LibraryCommons GitHub repository. Git history records
changed files and content, timestamps, and commit messages, providing a record of what changed and
when. The CMS does not add your Netlify Identity email address or user ID to content or commit
messages, and passwords are not stored in the repository. Public Git history may remain available
after an editor account is removed.

If you have any concerns or questions contact [info@librarieshacked.org](mailto:info@librarieshacked.org)
