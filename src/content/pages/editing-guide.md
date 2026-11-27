---
title: Editing guide
path: /editing-guide
kind: page
content_origin: commons
description:
  A step-by-step guide to signing up, logging in, and editing library and service details on
  LibraryCommons.
---

# Editing guide

Welcome to the LibraryCommons editor. This guide shows you how to register for an editor account,
verify your email, log in, and update details for your local libraries and library service.

You do not need technical knowledge or a GitHub account. All updates happen through web forms in
your browser.

## Register for an account

To edit details for your council's libraries, you need an editor account linked to your official
work email address (for example, `your.name@council.gov.uk`).

1. Open the [editor website](https://edit.librarycommons.org.uk/admin/).
2. Select **Sign up with Netlify Identity**.
3. In the sign-up box, choose the **Sign up** tab.
4. Enter your full name, work email address, and a secure password.
5. Select **Sign up**.

<!--suppress MarkdownUnresolvedFileReference -->

![The sign-up window showing full name, work email, and password fields](/uploads/community/cms-signup-modal.png)

> **Email domain check:** Registration is automatically restricted to recognised library authority
> and council email domains. If your council email is not accepted, contact the site maintainers to
> add your domain to the pre-approved list.

Choose a strong, unique password for this account. Never reuse a government password or a council,
work, or other important password; a password manager can help you create and remember a separate
one. Your account is managed by Netlify Identity; read
[Netlify's privacy policy](https://www.netlify.com/privacy/)
and our [LibraryCommons privacy policy](/privacy/).

## Verify your email address

After submitting the registration form, Netlify Identity sends a verification email to your work
inbox.

1. Open your inbox and look for an email from **LibraryCommons** or **Netlify Identity**.
2. Click the verification link inside the email.
3. Your browser opens the editor and completes your account setup.
4. Once verified, you are ready to log in.

If you do not see the email within a few minutes, check your junk or spam folder.

## Log in to the editor

1. Go to [edit.librarycommons.org.uk/admin/](https://edit.librarycommons.org.uk/admin/).
2. Select **Log in with Netlify Identity**.
3. Enter your work email address and password, then select **Log in**.

<!--suppress MarkdownUnresolvedFileReference -->

![The login window showing email and password fields](/uploads/community/cms-login-modal.png)

When you log in, your editor role and authority scope appear in the editor help bar (for example,
`your.name@council.gov.uk • Service Editor (E08000003)`).

Each library service has its own **Libraries — \[service name\]** collection. Service editors see the
collection for their assigned service; general editors see all service collections and
**Libraries — Unassigned**.

## Update a library branch

Most editorial updates involve keeping branch details, opening hours, and facilities accurate and up
to date.

1. In the left navigation menu, select **Libraries — \[your service name\]**.
2. The collection lists branches belonging to that service. Select the library you want to update.
3. Make your changes in the form fields.
4. When finished, select the green **Publish** button at the top of the page.

### Key library fields

- **Library name and address:** Check the branch name, street address, and postcode.
- **Contact details:** Keep phone numbers, enquiries email addresses, and official branch web pages
  current.
- **Library authority:** Choose the name and GSS code together in the first field. Both are saved
  automatically.
- **Facilities and services:** Search and choose services available at this branch. Each selection
  has a remove button. Separate Yes/No fields cover specific facilities and accessibility features.
- **Accessibility:** Confirm step-free access, accessible toilets, and hearing loop availability.
- **Year opened:** This is optional. Leave it blank if the year is unknown.
- **Opening hours:** Add staffed and unstaffed time periods for each day of the week.

### How to enter opening hours

Use the separate **Opens** and **Closes** fields for each time period. The form saves the values in
the directory's standard 24-hour format:

- **Single period:** Enter `09:00` under **Opens** and `17:00` under **Closes**.
- **Split hours:** Select **Add time period** and enter each session separately, for example
  `09:00`–`12:30` and `13:30`–`17:00`. You do not need to type commas.
- **Closed or unknown days:** Leave the field blank.
- **Midnight closing:** Enter `24:00` as the closing time. Opening times must be before `24:00`.
- **Validation:** Sessions must be in time order, end after they start, and not overlap. The form
  checks these rules before saving. If validation blocks a save, an alert near the top of the editor
  explains the problem; the affected field also shows its message. Correct the field and publish
  again.
- **Self-service or unstaffed hours:** If your library uses open-access technology, record unstaffed
  hours in the separate unstaffed hours field.

### Special hours

Use **Special hours** for holiday dates or other one-off changes. The editor uses Google
Business Profile-style periods:

1. Select **Add special date** and choose the date.
2. For a full-day closure, select **Closed all day**. Otherwise enter the opening and closing times.
3. For split hours, add the same date again and enter the next period.
4. If a period closes after midnight, select the following date as its optional end date.

Existing free-text notes are kept in **Other opening-hours notes**. You can leave that field blank
when adding dated periods.

### How to close a library branch

When a library closes permanently, LibraryCommons keeps the historical building record intact so
that the building remains on the historical map and in national research archives.

To record a permanent closure:

1. In the branch edit form, find **Status** and select **Closed (permanent)**.
2. In the **Year closed** field, enter the four-digit year the library closed (for example, `2024`).
   These two fields must always be completed in unison.
3. **Keep all other details intact:** Do not delete the library branch, and do not remove its
   building name, street address, postcode, coordinates, or historical facilities. Keeping this data
   ensures the building remains accurately geocoded and identifiable on historical maps.
4. Select **Publish**.

> **Temporary closures:** If a library is closed for refurbishment, repairs, or short-term
> redevelopment, set **Status** to **Closed (temporary)** and leave **Year closed** blank. You can
> add a short note in **Other opening-hours notes** under **Special hours** explaining the temporary
> closure and any interim service arrangements.

## Update library authority details

To update council-wide services and digital links:

1. In the left navigation menu, select **Library Authorities**.
2. Select your service's entry.
3. Update council-wide digital services, such as:
   - Main library service website
   - Online catalogue URL
   - Online joining URL
   - Mobile app links (Android and iOS)
   - Social media links (Facebook, Instagram, YouTube)
4. Select **Publish** to save your changes.

## What happens after you publish

When you select **Publish**:

1. Your changes are saved directly to the LibraryCommons repository.
2. Automated checks verify that the data meets national public library data schemas.
3. The site rebuilds and publishes your changes live to the public directory. This could take a
   short while.

Published changes are committed to the public GitHub repository. Git history records the changed
files, date, and commit message, providing a record of what changed and when. The CMS does not add
your Netlify Identity email address or user ID to content or commit messages. Keep personal
information out of public records and comments. Public repository history may remain available even
after an editor account is removed.

You can log back in at any time to make further updates.

## Wider editorial content

A small number of team members have general editor access to update site-wide articles, case
studies, grant announcements, and frequently asked questions.

If you have general editor permissions:

- Use **Editorial Content** to create or edit articles and stories.
- Use **Frequently Asked Questions** to manage reusable questions and answers across pages.
- Use **Resources And Downloads** to add shared slide decks, reports, or webinar recordings.
- Keep page paths descriptive (for example, `/stories/our-new-makerspace`). Ensure images have
  descriptive alternative text for screen readers.
- Upload new files using the **Media Library**. To reuse a preserved image or document, expand
  **Choose a preserved archive file** in an image or file field. Archive files cannot be uploaded
  over or deleted in the editor.
- For a Markdown link or resource URL, open **Archive files** above the editor. It opens in a
  separate tab: search for a filename, copy its URL, then paste it into your entry.
- Search within relation fields to choose linked pages, FAQs and resources. The CMS-wide search box
  is disabled.
- After creating or renaming a resource or authority, wait for automated lookup regeneration and
  deployment, then reload the CMS before selecting it in another entry.

If the editor reports a loading error, do not save a form with missing fields. Reload and try again;
report repeated failures to the team.
