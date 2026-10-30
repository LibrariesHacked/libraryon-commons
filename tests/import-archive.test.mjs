import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
  mkdir,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { extractFaqs } from "../scripts/archive/extract-faqs.mjs";
import sharp from "sharp";
import {
  cleanContent,
  extractSessions,
  pageID,
  resourceKind,
  writeManaged,
  pruneSessions,
  contentTitle,
  extractUpdatedDate,
  importArchive,
} from "../scripts/archive/import.mjs";
import { digest } from "../scripts/archive/collect.mjs";
import { explicitMarkdown } from '../scripts/archive/make-content-explicit.mjs';

test('legacy content becomes explicit named blocks without swallowing neighbouring paragraphs', async () => {
  const markdown = 'Before.\n\n![Reading](/photo.jpg)\n\n> Bring your little ones.\n\n**Tracy**\n\n**Librarian,** [**Wiltshire Libraries**](/libraries/wiltshire)\n\n## Your public library is a free, open space where you can:\n\n- Borrow books\n- Learn skills\n\nAfter.\n';
  const result = await explicitMarkdown(markdown);
  assert.ok(result.body.includes(':::testimonial{author="Tracy" role="Librarian" organisation="Wiltshire Libraries"'));
  assert.ok(result.body.includes(':::list-panel'));
  assert.ok(result.body.startsWith('Before.\n\n'));
  assert.ok(result.body.endsWith('\n\nAfter.\n'));
  assert.ok(!result.body.includes('**Tracy**'));
  assert.deepEqual(result.groups, ['testimonial-card', 'library-can-do-panel']);
  assert.equal((await explicitMarkdown(result.body)).body, result.body);
});
import {
  originalHomeCarousel,
  importHomeCarousel,
} from "../scripts/archive/import-home-carousel.mjs";

test("FAQ modularization removes inline copies, preserves existing entries and is repeatable", async (context) => {
  const temporary = await mkdtemp(
    path.join(tmpdir(), "libraryon-modular-faqs-"),
  );
  context.after(() => rm(temporary, { recursive: true, force: true }));
  for (const newline of ["\n", "\r\n"]) {
    const root = path.join(temporary, newline === "\n" ? "lf" : "crlf");
    for (const folder of ["src/content/pages", "src/content/faqs", "migration"])
      await mkdir(path.join(root, folder), { recursive: true });
    const answer =
      "---\nquestion: How do I join?\n---\n\nThe canonical edited answer.\n";
    await writeFile(
      path.join(root, "src/content/faqs/how-do-i-join.md"),
      answer,
    );
    const body =
      "# Page\n\n## Frequently asked questions\n\nAn introduction.\n\n### How do I join?\n\nThe obsolete inline answer.\n\n## Next section\n\nKeep this text.\n".replaceAll(
        "\n",
        newline,
      );
    const source =
      "---\ntitle: Page\nfaq_heading: Frequently asked questions\nfaqs:\n  - how-do-i-join\n---\n".replaceAll(
        "\n",
        newline,
      ) + body;
    await writeFile(path.join(root, "src/content/pages/page.md"), source);
    await writeFile(
      path.join(root, "migration/source-articles.json"),
      JSON.stringify({
        articles: [
          { file: "src/content/pages/page.md", body_sha256: digest(body) },
        ],
      }),
    );
    assert.deepEqual(extractFaqs({ root }), { extracted: 0, modularized: 1 });
    const modular = await readFile(
      path.join(root, "src/content/pages/page.md"),
      "utf8",
    );
    assert.ok(modular.includes(`An introduction.${newline}${newline}{{faqs}}`));
    assert.ok(modular.includes("## Next section"));
    assert.ok(!modular.includes("obsolete inline answer"));
    assert.equal(
      await readFile(
        path.join(root, "src/content/faqs/how-do-i-join.md"),
        "utf8",
      ),
      answer,
    );
    const snapshot = JSON.parse(
      gunzipSync(
        await readFile(
          path.join(root, "preservation/modular-source-pages.json.gz"),
        ),
      ),
    );
    assert.equal(snapshot[0].markdown, source);
    assert.deepEqual(extractFaqs({ root }), { extracted: 0, modularized: 0 });
  }
});

test("homepage carousel imports preserve the original selection, order and local files", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "libraryon-carousel-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ["src/data", "migration"])
    await mkdir(path.join(root, folder), { recursive: true });
  const json = (file, value) =>
    writeFile(path.join(root, file), JSON.stringify(value));
  await json("src/data/homepage.json", {
    title: "Keep the heading",
    carousel: [],
  });
  await json("migration/import-report.json", { assets: [] });
  await json("migration/import-state.json", { files: {} });
  const html =
    '<img src="https://example.org/outside.jpg" alt="Not a slide"><section id="banner-home"><div aria-roledescription="slide"><img src="/one.jpg" srcset="/large.jpg 2000w" alt="Reading together"></div><div aria-roledescription="slide"><img src="/two.jpg" alt="Library crafts"></div><div aria-roledescription="slide"><img src="/one.jpg" alt="Repeated slide"></div></section>';
  assert.deepEqual(originalHomeCarousel(html), [
    { source: "https://libraryon.org/one.jpg", alt: "Reading together" },
    { source: "https://libraryon.org/two.jpg", alt: "Library crafts" },
  ]);
  assert.throws(
    () =>
      originalHomeCarousel(
        '<section id="banner-home"><div aria-roledescription="slide"><img alt="Missing source"></div></section>',
      ),
    /missing its source/,
  );
  const imageBytes = async (url) =>
    sharp({
      create: {
        width: url.endsWith("/large.jpg") ? 40 : 10,
        height: 10,
        channels: 3,
        background: url.endsWith("/two.jpg") ? "blue" : "white",
      },
    })
      .jpeg()
      .toBuffer();
  const fetcher = async (url) =>
    new Response(
      url === "https://libraryon.org/" ? html : await imageBytes(url),
      {
        headers: {
          "content-type":
            url === "https://libraryon.org/" ? "text/html" : "image/jpeg",
        },
      },
    );
  const first = await importHomeCarousel({ root, fetcher });
  assert.deepEqual(
    first.map((slide) => slide.image),
    [
      "/uploads/archive/reading-together.jpg",
      "/uploads/archive/library-crafts.jpg",
    ],
  );
  const files = await readdir(path.join(root, "public/uploads/archive"));
  const second = await importHomeCarousel({ root, fetcher });
  assert.deepEqual(second, first);
  assert.deepEqual(
    await readdir(path.join(root, "public/uploads/archive")),
    files,
  );
  const report = JSON.parse(
    await readFile(path.join(root, "migration/import-report.json")),
  );
  assert.equal(report.assets.length, 2);
  assert.equal(report.assets[0].source, "https://libraryon.org/large.jpg");
  assert.equal(
    (
      await sharp(
        await readFile(path.join(root, report.assets[0].file)),
      ).metadata()
    ).width,
    40,
  );
  for (const asset of report.assets)
    assert.equal(
      digest(await readFile(path.join(root, asset.file))),
      asset.sha256,
    );
  assert.equal(
    JSON.parse(await readFile(path.join(root, "src/data/homepage.json"))).title,
    "Keep the heading",
  );
});

test("archive image imports select the largest captured variant and retain supplemental media", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "libraryon-original-image-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ["archive/content", "archive/objects", "migration"])
    await mkdir(path.join(root, folder), { recursive: true });
  const json = (file, value) =>
    writeFile(path.join(root, file), JSON.stringify(value));
  await json("archive/content/pages.json", [{ file: "content/page.json" }]);
  await json("archive/content/recovered-media.json", []);
  await json("archive/content/page.json", {
    canonical: "https://libraryon.org/photos",
    title: "Photos",
    images: [],
    html: '<h1>Photos</h1><p><img src="https://libraryon.org/small.jpg" srcset="https://libraryon.org/large.jpg 2000w" alt="Library"></p>',
  });
  await json("migration/import-report.json", {
    assets: [
      {
        source: "https://libraryon.org/previous.pdf",
        file: "public/uploads/previous.pdf",
        url: "/uploads/previous.pdf",
        sha256: "preserved-separately",
      },
    ],
  });
  const entries = [];
  for (const [name, width] of [
    ["small", 10],
    ["large", 40],
  ]) {
    const bytes = await sharp({
      create: { width, height: 10, channels: 3, background: "white" },
    })
      .jpeg()
      .toBuffer();
    await writeFile(path.join(root, `archive/objects/${name}`), bytes);
    entries.push({
      url: `https://libraryon.org/${name}.jpg`,
      status: 200,
      contentType: "image/jpeg",
      sha256: digest(bytes),
      file: `objects/${name}`,
      headers: {},
    });
  }
  await writeFile(
    path.join(root, "archive/manifest.jsonl"),
    entries.map((entry) => JSON.stringify(entry)).join("\n"),
  );
  const report = await importArchive({ root });
  const image = report.assets.find(
    (asset) => asset.source === "https://libraryon.org/small.jpg",
  );
  assert.equal(image.resolved, "https://libraryon.org/large.jpg");
  assert.equal(
    (await sharp(await readFile(path.join(root, image.file))).metadata()).width,
    40,
  );
  assert.ok(
    report.assets.some(
      (asset) => asset.source === "https://libraryon.org/previous.pdf",
    ),
  );
});

test("archive imports reuse readable filenames and preserve unrelated files", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "libraryon-readable-import-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of [
    "archive/content",
    "archive/objects",
    "src/content/resources",
  ])
    await mkdir(path.join(root, folder), { recursive: true });
  const source = "https://libraryon.org/library-guide.pdf";
  const bytes = Buffer.from("Preserved document bytes");
  const json = (file, value) =>
    writeFile(path.join(root, file), JSON.stringify(value));
  await json("archive/content/pages.json", [{ file: "content/page.json" }]);
  await json("archive/content/recovered-media.json", []);
  await json("archive/content/page.json", {
    canonical: "https://libraryon.org/about/pressplay",
    title: "Press Play",
    html: '<h1>Press Play</h1><a href="/library-guide.pdf">Library guide</a><h2>Data sessions</h2><article><h3>Library data in practice</h3><p>Useful methods from the speakers.</p><a href="/library-guide.pdf">View slides PDF</a></article>',
    images: [],
  });
  await writeFile(path.join(root, "archive/objects/guide.pdf"), bytes);
  await writeFile(
    path.join(root, "archive/manifest.jsonl"),
    JSON.stringify({
      url: source,
      status: 200,
      contentType: "application/pdf",
      headers: {},
      sha256: digest(bytes),
      file: "objects/guide.pdf",
    }),
  );
  await json("src/content/resources/library-guide.json", {
    title: "Editor-owned entry",
    url: "https://example.org/",
  });
  const first = await importArchive({ root });
  assert.equal(first.assets[0].url, "/uploads/archive/library-guide.pdf");
  assert.equal(
    first.sessions[0].id,
    "about-pressplay-library-data-in-practice",
  );
  assert.deepEqual(first.sessions[0].resources, ["library-guide-2"]);
  assert.deepEqual(
    await readFile(path.join(root, first.assets[0].file)),
    bytes,
  );
  const second = await importArchive({ root });
  assert.deepEqual(second.assets, first.assets);
  assert.deepEqual(second.sessions, first.sessions);
  assert.deepEqual(second.conflicts, []);
  assert.deepEqual(
    (await readdir(path.join(root, "src/content/resources"))).sort(),
    ["library-guide-2.json", "library-guide.json"],
  );
  assert.equal(
    JSON.parse(
      await readFile(
        path.join(root, "src/content/resources/library-guide.json"),
      ),
    ).title,
    "Editor-owned entry",
  );
});

test("Markdown conversion preserves meaningful content, captions, tables and local media", () => {
  const html =
    '<h1>Collections</h1><p>Useful <strong>content</strong>.</p><figure><img src="https://libraryon.org/photo.jpg" alt="A library"><figcaption>Photo credit</figcaption></figure><table><thead><tr><th>Title</th></tr></thead><tbody><tr><td>Document</td></tr></tbody></table><a href="/file.pdf">Slides</a><script>alert(1)</script><footer>Duplicate footer</footer>';
  const body = cleanContent(html, "https://libraryon.org/", (url) =>
    url.endsWith("photo.jpg")
      ? "/uploads/photo.jpg"
      : url.endsWith("file.pdf")
        ? "/uploads/slides.pdf"
        : url,
  );
  for (const text of [
    "# Collections",
    "**content**",
    "Photo credit",
    "/uploads/photo.jpg",
    "/uploads/slides.pdf",
    "Document",
  ])
    assert.ok(body.includes(text));
  assert.ok(!body.includes("alert(1)"));
  assert.ok(!body.includes("Duplicate footer"));
});

test("block cards become linked Markdown headings and empty overlays get accessible labels", () => {
  const html =
    '<a aria-label="View details for Business support" href="/work-and-skills/business-support"><div><img src="/business.jpg" alt="A library business centre"><div><h3>Business support in libraries</h3><p>Advice to start and grow a business.</p></div></div></a><a href="/libraries/example"></a><p>View</p><p>1/5</p><p>12345</p>';
  const body = cleanContent(
    html,
    "https://libraryon.org/work-and-skills",
    (url) => new URL(url).pathname,
  );
  assert.ok(body.includes("![A library business centre](/business.jpg)"));
  assert.ok(
    body.includes(
      "### [Business support in libraries](/work-and-skills/business-support)",
    ),
  );
  assert.ok(body.includes("Advice to start and grow a business."));
  assert.ok(!body.includes("[](/libraries/example)"));
  assert.ok(!/^\[$/m.test(body));
  assert.ok(!body.includes("View"));
  assert.ok(!body.includes("1/5"));
  assert.ok(!body.includes("12345"));
  assert.ok(!body.includes("\n\n\n"));
});

test("block card links, map controls, empty overlays and spacing produce readable Markdown", () => {
  const html =
    '<label><input type="checkbox"><span><p>Libraries</p><p>Events</p></span></label><a href="/libraries/authority"><div><span>Greenwich</span></div></a><a href="/libraries/authority/library" aria-label="View details for Central Library"></a><a href="/libraries/card"><div><img src="/central.jpg" alt="A library"><div><h3>Central Library</h3><p>Books, events and services.</p></div></div></a><a href="/libraries/image"><div><img src="/library.jpg" alt="Library"></div></a><button aria-controls="Services-panel" aria-expanded="false">Services</button><button aria-controls="Distance-panel" aria-expanded="false">Distance</button><button>Show more</button><button>List view</button><button>Map view</button><div><button aria-label="Previous slide">Previous</button><span>1/5</span><button aria-label="Next slide">Next</button></div><p>1/5</p><p>12345</p>';
  const body = cleanContent(html, "https://libraryon.org/libraries");
  assert.ok(
    body.includes("[Greenwich](https://libraryon.org/libraries/authority)"),
  );
  assert.ok(
    body.includes(
      "[View details for Central Library](https://libraryon.org/libraries/authority/library)",
    ),
  );
  assert.ok(
    body.includes(
      "### [Central Library](https://libraryon.org/libraries/card)",
    ),
  );
  assert.ok(body.includes("![A library](https://libraryon.org/central.jpg)"));
  assert.ok(
    body.includes(
      "[![Library](https://libraryon.org/library.jpg)](https://libraryon.org/libraries/image)",
    ),
  );
  assert.ok(body.includes("Books, events and services."));
  for (const control of [
    "Libraries",
    "Events",
    "Services",
    "Distance",
    "Show more",
    "List view",
    "Map view",
    "1/5",
    "12345",
  ])
    assert.ok(!body.includes(control), `unexpected control text: ${control}`);
  assert.ok(!/^\[$/m.test(body));
  assert.ok(!body.includes("\n\n\n"));
});

test("headings and quote blocks normalize source line breaks and whitespace-only gaps", () => {
  const html =
    "<h2>Reading recommendations from<br>Wakefield Libraries</h2><blockquote><p>First paragraph.</p><p>Second paragraph.</p></blockquote>";
  const body = cleanContent(html, "https://libraryon.org/circus");
  assert.ok(
    body.includes("## Reading recommendations from Wakefield Libraries"),
  );
  assert.ok(body.includes("> First paragraph.\n\n> Second paragraph."));
  assert.ok(!/\n[ \t]+\n/.test(body));
});

test("sessions keep each card associated with its own slide and recording links", () => {
  const html =
    '<h2>Data sessions</h2><article><h3>Library data in practice</h3><p>Useful methods from the speakers.</p><a href="/one.pdf">View slides PDF</a><a href="https://youtu.be/one">View recording</a></article><article><h3>Making collections accessible</h3><p>Useful approaches for library collections.</p><a href="/two.pdf">View slides PDF</a></article>';
  const sessions = extractSessions(
    html,
    "https://libraryon.org/about/pressplay",
  );
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].links.length, 2);
  assert.equal(sessions[1].links[0].url, "https://libraryon.org/two.pdf");
  assert.equal(sessions[0].theme, "Data sessions");
});

test("paragraph-based conference sessions do not merge at the theme container", () => {
  const html =
    '<h2>Engagement</h2><div><p><strong>First session title</strong> - Speaker One</p><p><a href="/one.pdf"><strong>View slides PDF</strong></a></p><p><strong>Second session title</strong> - Speaker Two</p><p><a href="/two.pdf"><strong>View slides PDF</strong></a><a href="https://youtu.be/two"><strong>View recording</strong></a></p></div>';
  const sessions = extractSessions(
    html,
    "https://libraryon.org/about/pressplay",
  );
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].title, "First session title");
  assert.equal(sessions[1].title, "Second session title");
  assert.deepEqual(
    sessions.map((session) => session.links.length),
    [1, 2],
  );
  assert.ok(sessions.every((session) => session.theme === "Engagement"));
});

test("stable IDs and resource types distinguish pages, slides and recordings", () => {
  assert.equal(pageID("https://libraryon.org/"), "home");
  assert.equal(
    pageID("https://libraryon.org/about/pressplay"),
    "about--pressplay",
  );
  assert.equal(resourceKind("https://youtu.be/example"), "recording");
  assert.equal(
    resourceKind("https://example.com/slides.pdf", "View slides PDF"),
    "slides",
  );
});

test("blank source titles fall back to the preserved H1 rather than empty CMS metadata", () => {
  const record = {
    canonical: "https://libraryon.org/special-collections/circus",
    title: "",
    headings: [{ level: 1, text: "The early days of circus" }],
  };
  assert.equal(contentTitle(record), "The early days of circus");
  assert.equal(
    contentTitle({ ...record, title: "Source metadata" }),
    "Source metadata",
  );
  assert.equal(
    contentTitle({
      ...record,
      title: "From horseback to Big Top:The early days",
    }),
    "From horseback to Big Top: The early days",
  );
  assert.equal(
    contentTitle({ ...record, headings: [] }),
    "/special-collections/circus",
  );
});

test("reimport protects editor changes and does not overwrite unknown existing files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "libraryon-import-"));
  try {
    const state = {};
    const conflicts = [];
    await writeManaged(root, "page.md", "Original", {}, state, conflicts);
    await writeManaged(root, "page.md", "Edited by author", {}, {}, []);
    assert.equal(
      await readFile(path.join(root, "page.md"), "utf8"),
      "Original",
    );
    const next = {};
    await writeManaged(
      root,
      "page.md",
      "Updated source",
      state,
      next,
      conflicts,
    );
    assert.equal(
      await readFile(path.join(root, "page.md"), "utf8"),
      "Updated source",
    );
    assert.equal(
      await writeManaged(
        root,
        "page.md",
        "Another update",
        state,
        {},
        conflicts,
      ),
      false,
    );
    assert.deepEqual(conflicts, ["page.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refresh mode overwrites tracked Markdown but leaves unknown files protected", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "libraryon-refresh-"));
  try {
    const managed = "src/content/pages/managed.md";
    const unknown = "src/content/pages/unknown.md";
    const previous = {};
    const next = {};
    const conflicts = [];
    await writeManaged(
      root,
      managed,
      "Generated before cleanup",
      {},
      previous,
      [],
    );
    await writeFile(path.join(root, managed), "Manual edit");
    assert.equal(
      await writeManaged(
        root,
        managed,
        "Clean generated Markdown",
        previous,
        next,
        conflicts,
        {
          force: true,
        },
      ),
      true,
    );
    assert.equal(
      await readFile(path.join(root, managed), "utf8"),
      "Clean generated Markdown",
    );
    await writeFile(path.join(root, unknown), "Unknown manual file");
    assert.equal(
      await writeManaged(
        root,
        unknown,
        "Generated content",
        previous,
        next,
        conflicts,
        {
          force: true,
        },
      ),
      false,
    );
    assert.equal(
      await readFile(path.join(root, unknown), "utf8"),
      "Unknown manual file",
    );
    assert.deepEqual(conflicts, ["src/content/pages/unknown.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("identical generated files retain their modification time and import checksum", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "libraryon-import-"));
  try {
    const filename = path.join(root, "page.md");
    const next = {};
    await writeManaged(root, "page.md", "Unchanged", {}, {}, []);
    await utimes(filename, new Date("2020-01-01"), new Date("2020-01-01"));
    const before = await stat(filename);
    assert.equal(
      await writeManaged(root, "page.md", "Unchanged", {}, next, []),
      true,
    );
    assert.equal((await stat(filename)).mtimeMs, before.mtimeMs);
    assert.ok(next["page.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("obsolete generated sessions are removed only while their checksums match", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "libraryon-sessions-"));
  try {
    const previous = {};
    const obsolete = "src/content/sessions/obsolete.json";
    const edited = "src/content/sessions/edited.json";
    const active = "src/content/sessions/active.json";
    for (const file of [obsolete, edited, active])
      await writeManaged(root, file, "Original", {}, previous, []);
    await writeManaged(root, edited, "Author edit", previous, {}, []);
    const next = { ...previous };
    const conflicts = [];
    await pruneSessions(root, previous, next, new Set([active]), conflicts);
    await assert.rejects(readFile(path.join(root, obsolete)), {
      code: "ENOENT",
    });
    assert.equal(
      await readFile(path.join(root, edited), "utf8"),
      "Author edit",
    );
    assert.equal(await readFile(path.join(root, active), "utf8"), "Original");
    assert.deepEqual(conflicts, [edited]);
    assert.equal(next[obsolete], undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('source "Last updated" lines become ISO metadata and leave the body', () => {
  const plain = extractUpdatedDate(
    "# Title\n\nLast updated: 3 June 2026\n\nBody text.\n",
  );
  assert.equal(plain.updated_on, "2026-06-03");
  assert.equal(plain.body, "# Title\n\nBody text.\n");
  const decorated = extractUpdatedDate(
    "Last updated: Friday **31 October 2025.**\n\nBody.\n",
  );
  assert.equal(decorated.updated_on, "2025-10-31");
  const unchanged = extractUpdatedDate("It was last updated on 1 May 2025.\n");
  assert.equal(unchanged.updated_on, undefined);
  assert.equal(unchanged.body, "It was last updated on 1 May 2025.\n");
});

test("empty bold joins, typed bullets and double line breaks become clean Markdown", () => {
  const body = cleanContent(
    "<p><strong>In 2025</strong><strong>.</strong></p><p>• One</p><p>• Two</p><p>End.<br><br>Next.</p>",
    "https://libraryon.org/x",
  );
  assert.ok(!body.includes("****"));
  assert.ok(body.includes("- One\n- Two"));
  assert.ok(body.includes("End.\n\nNext."));
});

test("only the first source H1 stays a top-level heading", () => {
  const body = cleanContent(
    "<h1>Title</h1><h1>Section one</h1><h1>Section two</h1>",
    "https://libraryon.org/x",
  );
  assert.ok(body.startsWith("# Title"));
  assert.ok(body.includes("## Section one") && body.includes("## Section two"));
});

test("recommendations, timeline headings, timeline spans, and link captions are preserved", () => {
  const html =
    '<button id="accordion-button-1" aria-controls="accordion-panel-1" aria-expanded="false" class="Recommendation__StyledLi"><p class="Recommendation__RecTitle">Gardening for Women</p><span class="Recommendation__StyledTypography">Frances Wolseley</span><span class="Recommendation__StyledTypography">1908</span><span role="region" id="accordion-panel-1" class="Recommendation__RecDescription">A guide to horticulture.</span></button>' +
    '<button aria-controls="copy-container-0" aria-expanded="true"><h3>16th century</h3></button>' +
    '<ol class="Timeline__TimelineList"><li><span>1 March 2023</span><span>Fund launched</span></li></ol>' +
    '<p class="Links__StyledTypography"><a href="https://example.org">Archive</a><span>Digital collection</span></p>';
  const body = cleanContent(html, "https://libraryon.org/special-collections");
  assert.ok(body.includes("### Gardening for Women (Frances Wolseley, 1908)"));
  assert.ok(body.includes("A guide to horticulture."));
  assert.ok(body.includes("### 16th century"));
  assert.ok(body.includes("**1 March 2023** — Fund launched"));
  assert.ok(
    body.includes("[Archive](https://example.org/) — Digital collection"),
  );
});
