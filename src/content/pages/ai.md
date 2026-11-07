---
title: AI statement
path: /ai
kind: page
content_origin: commons
description: How LibraryCommons approaches artificial intelligence, agentic tooling, and content integrity.
---

# Artificial intelligence (AI) statement

LibraryCommons is an independent, community-driven project dedicated to celebrating, discovering, and maintaining open data about UK public libraries.

This statement sets out our principles and practices regarding the use of Artificial Intelligence (AI) and machine learning tools across our website, code, and data pipelines.

## Respecting human creativity: our core principles

Libraries exist to champion literacy, learning, curiosity, and human creativity. We share and maintain the fundamental principles established in the [original LibraryOn AI statement](/archive/ai-statement/):

- **Human creativity matters:** Creative works, local stories, poetry, and art belong to human creators. We do not use generative AI to produce creative assets, illustrations, photography, or editorial features.
- **Authentic community content:** The stories, histories, and articles preserved on this site—such as our special collections, historical archives, and community profiles—are authentic works written and curated by library workers, authors, and local historians.
- **Accurate public data:** We never use AI to fabricate, invent, or guess library information. Details about library branches, opening hours, accessibility, services, and local authority contacts are sourced from verified public sector publications, open council data, and direct community verification.
- **No training on private data:** We do not collect private personal data from our visitors, and we never feed private or non-public user data into AI training sets.

## Where AI is used in building LibraryCommons

While we protect the integrity of our content and data, we embrace modern developer tooling to make LibraryCommons robust, accessible, and sustainable as an open-source project.

AI tools (specifically agentic coding assistants developed by Google DeepMind) have been used to assist in the technical development of this website:

- **Code architecture and refactoring:** Helping modernize legacy templates into clean, standards-compliant Astro components, modular JavaScript helpers, and Open Props design tokens.
- **Accessibility testing:** Assisting with code auditing against WCAG 2.2 AA standards, ensuring keyboard navigation, high contrast ratios, and screen reader semantic HTML across all pages.
- **Data validation pipelines:** Generating automated tests and validation scripts that verify data syntax, postcode formats, coordinate geometry, and schema integrity for more than 3,000 public library locations.
- **Search indexing logic:** Optimizing client-side search and filtering algorithms to ensure fast, zero-tracking directory searches in your browser.
- **Linting and code formatting:** Enforcing consistent code style and formatting standards across HTML, JavaScript, and Markdown files.

## Human oversight and open-source transparency

Every line of code and every piece of content published on LibraryCommons is reviewed, tested, and verified by humans:

- **Human-in-the-loop:** No automated tool or AI system has autonomous commit rights to publish unreviewed content to the live site. All code changes pass through automated test suites and human maintainer review.
- **Open-source and inspectable:** All source code, data transformation scripts, and test suites are public and open source on [GitHub](https://github.com/LibrariesHacked/libraryon-commons). Anyone can inspect how the site is built, verify our data pipelines, or propose improvements.
- **Community maintenance:** If you notice any factual errors or outdated details in our directory or code, you can submit an update through the directory interface or open an issue on GitHub.

## Reference to archived LibraryOn statement

Under the previous LibraryOn programme led by the British Library and funded by Arts Council England, an earlier AI statement was published in 2024. That document is preserved in our public archive for historical reference:

- [Archived LibraryOn Artificial Intelligence (AI) statement](/archive/ai-statement/)

## Questions and feedback

If you have any questions or feedback about our use of technology or AI on LibraryCommons, please reach out to us:

- **Email:** [info@librarieshacked.org](mailto:info@librarieshacked.org)
- **GitHub repository:** [LibrariesHacked/libraryon-commons on GitHub](https://github.com/LibrariesHacked/libraryon-commons)
