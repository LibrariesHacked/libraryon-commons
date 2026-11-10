---
title: Accessibility statement
path: /accessibility
kind: page
content_origin: commons
description: Accessibility statement for LibraryCommons website
---

# Accessibility

LibraryCommons is committed to making its website and directory accessible to the widest possible audience, regardless of ability, device, or technology.

We want as many people as possible to be able to use this website. For example, that means you should be able to:

- Navigate all pages and interactive components using a keyboard alone or speech recognition software.
- Zoom in up to 300% without text spilling off the screen or losing functionality.
- Listen to the website using modern screen readers (including NVDA, JAWS, and VoiceOver).
- Experience clear colour contrast that meets or exceeds recommended accessibility ratios.
- Navigate clear heading structures, skip links, and ARIA landmarks.
- Read straightforward, plain language without uppercase text transformations or unnecessary jargon.

## Compliance status

This website aims to conform to the [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) Level AA standards and follows the accessibility recommendations of the UK Government Digital Service (GDS).

## Accessibility features across LibraryCommons

### Keyboard navigation and focus

- A visible **Skip to content** link is provided at the very top of every page.
- Interactive controls (such as place search, filter popovers, tag buttons, disclosure accordions, and pagination) are keyboard accessible and display prominent, high-contrast focus rings.
- Dialogs and popovers (such as the search filters panel) manage focus and can be dismissed at any time with the `Escape` key.

### Text sizing, typography, and contrast

- The site uses responsive typography set in accessible variable typefaces ([Lexend](https://www.lexend.com/)), designed to aid reading fluency.
- Text sizes use scalable relative units (`rem`) that respect your browser's font size preferences.
- Colour combinations across background surfaces, text, buttons, and badges have been tested to ensure contrast ratios exceed 4.5 to 1 for normal text and 3 to 1 for large text and interface components.
- The interface avoids forced uppercase text transformations (`text-transform: uppercase`), which can make words harder to recognise for dyslexic readers.

### Library directory and map alternatives

- The [Library directory](/libraries/) features an interactive map for visual exploration, but visual map interaction is not required to access library information.
- Every library is listed in semantic HTML with its address, opening hours, local authority, and contact links adjacent to the search form.
- Filter options (services, accessibility features, opening hours status, and distance) operate with accessible checkboxes and buttons that announce their state (`aria-pressed`).
- Full directory data is also available as [CSV downloads](/libraries/) and structured JSON.

### Screen readers and media

- All images include meaningful alternative text (`alt`). Purely decorative icons are hidden from assistive technology (`aria-hidden="true"`).
- Preserved historical articles use semantic HTML headings (`H1`, `H2`, `H3`) in logical sequential order.
- Audio recordings and conference sessions include titles, descriptions, and links to transcripts and slide decks where available.

## Known limitations and technical notes

Some legacy and external materials have known limitations:

- **Archived legacy documents:** Some historical PDF documents and slide decks originally created under previous programmes may not be fully tagged or optimized for screen readers. Where possible, key summaries and plain text information are provided on the corresponding resource page.

## Feedback and contact information

We welcome feedback on the accessibility of LibraryCommons. If you find any accessibility problems not listed on this page, need information in an alternative format, or think we are not meeting accessibility requirements:

- **Email:** [info@librarieshacked.org](mailto:info@librarieshacked.org)
- **GitHub Issues:** [Submit an issue on GitHub](https://github.com/LibrariesHacked/libraryon-commons/issues)

When contacting us, please let us know:

- The web address (URL) of the page where you encountered an issue.
- The device, operating system, browser, and any assistive software you were using.
- A brief description of what you were trying to do and what happened.
