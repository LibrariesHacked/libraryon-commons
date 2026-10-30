import test from "node:test";
import assert from "node:assert/strict";
/** @file Validate CMS configuration and the committable content without raw captures. */
import {
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { parse, stringify } from "yaml";
import sharp from "sharp";
import { load } from "cheerio";
import { normalizeListSpacing } from "../src/lib/markdown-format.mjs";
import {
  createEditorComponents,
  previewEditorBlock,
  registerEditorComponents,
} from "../src/lib/cms-editor-components.mjs";
import { digest } from "../scripts/archive/collect.mjs";
import { libraries, authorities } from "../src/lib/directory.mjs";
import {
  descriptiveSlug,
  uniqueFilename,
  sourceFilename,
  migrateFilenames,
  originalAssetReferences,
  imageFilenameStem,
  isDescriptiveImageLabel,
  reviewedImageDescriptions,
} from "../scripts/migrate-filenames.mjs";

test("image placeholders are rejected and reviewed names preserve their source bytes", async () => {
  for (const label of [
    "Image",
    "image-original-12",
    "Photo",
    "Picture",
    "Historical archive image",
    "untitled",
    "12345",
  ]) {
    assert.equal(isDescriptiveImageLabel(label), false, label);
    assert.throws(
      () => uniqueFilename(label, ".jpg", new Set()),
      /Missing descriptive filename/,
    );
  }
  const report = JSON.parse(
    readFileSync("migration/import-report.json", "utf8"),
  );
  const assets = new Map(report.assets.map((asset) => [asset.sha256, asset]));
  const reviewed = reviewedImageDescriptions();
  assert.equal(reviewed.size, 49);
  for (const [sha256, description] of reviewed) {
    assert.ok(isDescriptiveImageLabel(description.description));
    const asset = assets.get(sha256);
    assert.ok(asset, `Missing reviewed image: ${description.description}`);
    const bytes = readFileSync(asset.file);
    assert.equal(digest(bytes), sha256);
    if (description.extension) {
      assert.equal(path.extname(asset.file), description.extension);
      assert.equal(
        (await sharp(bytes).metadata()).format,
        description.extension.slice(1),
      );
    }
  }
  for (const file of readdirSync("public/uploads/archive"))
    if (/\.(?:jpe?g|png|gif|webp|avif|svg|tiff?|ico|heic|img)$/i.test(file))
      assert.ok(
        isDescriptiveImageLabel(path.parse(file).name),
        `Generic image filename: ${file}`,
      );
});

test("image names stay short and avoid extra sentences and incomplete endings", () => {
  assert.equal(
    imageFilenameStem("A library reading group. Everyone enjoys meeting here."),
    "a-library-reading-group",
  );
  const stem = imageFilenameStem(
    "A very long description of a library visitor spending time studying alongside other visitors original",
  );
  assert.ok(stem.length <= 64);
  assert.ok(stem.endsWith("-original"));
  assert.ok(
    !imageFilenameStem(
      "A black and white illustration of the exterior of a",
    ).endsWith("-a"),
  );
  assert.equal(
    originalAssetReferences("/uploads/short.jpg", [
      { from: "public/uploads/hash.jpg", to: "public/uploads/long.jpg" },
      { from: "public/uploads/long.jpg", to: "public/uploads/short.jpg" },
    ]),
    "/uploads/hash.jpg",
  );
  for (const file of readdirSync("public/uploads/archive"))
    if (/\.(?:jpe?g|png|gif|webp|avif|svg|tiff?|ico|heic|img)$/i.test(file))
      assert.ok(
        path.parse(file).name.length <= 72,
        `Long image filename: ${file}`,
      );
});

test("audited image masters and supplemental source bundles retain verified original bytes", async () => {
  const masters = JSON.parse(
    readFileSync("src/data/media-masters.json", "utf8"),
  );
  const unique = new Map(
    Object.values(masters.sources).map((master) => [master.file, master]),
  );
  assert.ok(unique.size > 0);
  for (const master of unique.values()) {
    const bytes = readFileSync(master.file);
    assert.equal(
      digest(bytes),
      master.sha256,
      `Changed master: ${master.file}`,
    );
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, master.width);
    assert.equal(metadata.height, master.height);
  }
  for (const [alias, master] of Object.entries(masters.aliases)) {
    assert.ok(
      existsSync(`public${alias}`),
      `Missing preserved variant: ${alias}`,
    );
    assert.ok(unique.has(master.file));
  }
  const audit = JSON.parse(
    readFileSync("migration/coverage-audit.json", "utf8"),
  );
  for (const supplement of audit.supplements) {
    const bytes = readFileSync(supplement.file);
    assert.equal(digest(bytes), supplement.sha256);
    assert.doesNotThrow(() => JSON.parse(gunzipSync(bytes)));
  }
});

test("descriptive filenames remove opaque suffixes and resolve collisions without hashes", () => {
  assert.equal(
    descriptiveSlug("Children\u2019s Caf\u00e9 & Reading"),
    "childrens-cafe-and-reading",
  );
  assert.equal(
    sourceFilename("https://example.org/Reading_Room_a1b2c3d4e5.jpg"),
    "reading-room",
  );
  assert.equal(
    sourceFilename("https://example.org/5e56dcd9fe588d70527ad5598faacd9bb.jpg"),
    "",
  );
  const used = new Set();
  assert.equal(
    uniqueFilename("Library guide", ".pdf", used),
    "library-guide.pdf",
  );
  assert.equal(
    uniqueFilename("Library guide", ".pdf", used),
    "library-guide-2.pdf",
  );
  assert.equal(
    uniqueFilename("LIBRARY GUIDE", ".pdf", used),
    "library-guide-3.pdf",
  );
  assert.throws(() => uniqueFilename("", ".pdf", used), /Missing descriptive/);
});

test("filename migration preserves bytes, updates relations, protects edits and is repeatable", (context) => {
  const root = mkdtempSync(path.join(tmpdir(), "libraryon-filenames-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  for (const folder of [
    "src/content/pages",
    "src/content/resources",
    "src/content/faqs",
    "src/content/sessions",
    "src/data",
    "public/uploads/archive",
    "public/admin",
    "migration",
  ])
    mkdirSync(path.join(root, folder), { recursive: true });
  const asset = `public/uploads/archive/${"a".repeat(64)}.pdf`;
  const resource = `src/content/resources/resource-${"b".repeat(20)}.json`;
  const faq = `src/content/faqs/faq-${"c".repeat(16)}.md`;
  const page = "src/content/pages/home.md";
  const body = `[Guide](/${asset.slice("public/".length)}#page=2)\r\n`;
  const originals = {
    [asset]: Buffer.from([0, 1, 2, 255]),
    [resource]: JSON.stringify({
      title: "Library guide",
      url: `/${asset.slice("public/".length)}`,
    }),
    [faq]: "---\nquestion: How do I join?\n---\n\nVisit the library.\n",
    [page]: `---\r\ntitle: Home\r\nresources:\r\n  - resource-${"b".repeat(20)}\r\nfaqs:\r\n  - faq-${"c".repeat(16)}\r\n---\r\n${body}`,
  };
  for (const [file, value] of Object.entries(originals))
    writeFileSync(path.join(root, file), value);
  const writeJSON = (file, value) =>
    writeFileSync(path.join(root, file), JSON.stringify(value));
  writeJSON("src/data/homepage.json", {});
  writeJSON("migration/import-report.json", {
    assets: [
      {
        source: "https://example.org/Library_guide.pdf",
        resolved: "https://example.org/Library_guide.pdf",
        file: asset,
        url: `/${asset.slice("public/".length)}`,
      },
    ],
  });
  writeJSON("migration/import-state.json", {
    files: {
      [asset]: digest(originals[asset]),
      [resource]: digest(originals[resource]),
      [page]: "previous-import-checksum",
    },
  });
  const plan = migrateFilenames({ root });
  assert.equal(plan.applied, false);
  assert.ok(existsSync(path.join(root, asset)));
  const result = migrateFilenames({ root, apply: true });
  assert.equal(result.renames.length, 3);
  assert.deepEqual(
    readFileSync(path.join(root, "public/uploads/archive/library-guide.pdf")),
    originals[asset],
  );
  const migrated = readFileSync(path.join(root, page), "utf8");
  assert.match(migrated, /resources:\r\n  - library-guide/);
  assert.match(migrated, /faqs:\r\n  - how-do-i-join/);
  assert.match(migrated, /library-guide\.pdf#page=2/);
  assert.equal(
    originalAssetReferences(
      migrated.replace(/^---\r\n[\s\S]*?\r\n---\r\n/, ""),
      result.renames,
    ),
    body,
  );
  const state = JSON.parse(
    readFileSync(path.join(root, "migration/import-state.json")),
  ).files;
  assert.equal(state[page], "previous-import-checksum");
  assert.equal(
    state["src/content/resources/library-guide.json"],
    digest(
      readFileSync(path.join(root, "src/content/resources/library-guide.json")),
    ),
  );
  assert.equal(migrateFilenames({ root, apply: true }).renames.length, 0);
});

const config = parse(
  readFileSync(new URL("../public/admin/config.yml", import.meta.url), "utf8"),
);
const settings = JSON.parse(
  readFileSync(new URL("../src/data/settings.json", import.meta.url)),
);

test("CMS form controls are registered before initialization and keep Markdown available", () => {
  const components = createEditorComponents();
  const registered = [];
  registerEditorComponents({
    registerEditorComponent: (component) => registered.push(component.id),
  });
  assert.equal(registered.length, 8);
  assert.equal(new Set(registered).size, 8);
  const body = config.collections
    .find((collection) => collection.name === "pages")
    .fields.find((field) => field.name === "body");
  assert.deepEqual(body.modes, ["rich_text", "raw"]);
  for (const component of components)
    assert.ok(body.editor_components.includes(component.id));
  const admin = readFileSync("src/pages/admin/index.astro", "utf8");
  assert.ok(
    admin.indexOf("CMS_MANUAL_INIT") < admin.indexOf("unpkg.com/decap-cms"),
  );
  assert.ok(
    admin.indexOf("registerEditorComponents(cms)") <
      admin.indexOf("cms.init()"),
  );
});

test("every existing named Markdown block survives a CMS form round trip", () => {
  const components = createEditorComponents();
  let checked = 0;
  for (const file of readdirSync("src/content/pages").filter((file) =>
    file.endsWith(".md"),
  )) {
    const source = readFileSync(`src/content/pages/${file}`, "utf8").replace(
      /^---\r?\n[\s\S]*?\r?\n---\r?\n/,
      "",
    );
    for (const component of components) {
      const pattern = new RegExp(
        component.pattern.source,
        `${component.pattern.flags}gm`,
      );
      for (const match of source.matchAll(pattern)) {
        const data = component.fromBlock(match);
        assert.ok(
          !component.pattern.flags.includes("m"),
          "Decap patterns must match only the current block",
        );
        assert.equal(
          component.pattern.exec(`An ordinary paragraph.\n\n${match[0]}`),
          null,
        );
        assert.equal(
          component.pattern.exec(`${match[0]}\n\nFollowing content.`)?.[0],
          match[0],
        );
        const output = component.toBlock(data);
        const next = output.match(component.pattern);
        assert.ok(
          next,
          `${file}: ${component.label} is recognized after saving`,
        );
        assert.deepEqual(
          component.fromBlock(next),
          data,
          `${file}: ${component.label} fields survive editing`,
        );
        checked += 1;
      }
    }
  }
  assert.ok(checked > 40, `${checked} existing blocks were checked`);
});

test("CMS blocks preserve punctuation and nested lists and preview untrusted values safely", () => {
  const components = createEditorComponents();
  const quote = components.find(
    (component) => component.id === "library-quote",
  );
  const data = {
    author: 'Tracy "T" & family',
    role: "Reader {and} volunteer",
    organisation: "Library & friends",
    url: "/libraries/example",
    quote: "**Welcome** to the library.\n\nAnother paragraph.",
    image: "",
    alt: "",
    image_title: "",
  };
  assert.deepEqual(
    quote.fromBlock(quote.toBlock(data).match(quote.pattern)),
    data,
  );
  const panel = components.find(
    (component) => component.id === "library-list-panel",
  );
  const list = {
    title: "Activities",
    heading_level: 2,
    introduction: "Welcome.",
    ordered: true,
    start: 4,
    items: [{ text: "Learn **skills**\n\n- Nested activity" }],
    after: "Visit again.",
  };
  assert.deepEqual(
    panel.fromBlock(panel.toBlock(list).match(panel.pattern)),
    list,
  );
  const rendered = previewEditorBlock("quote", {
    author: "<script>alert(1)</script>",
    quote: "Safe text.",
  });
  assert.ok(!rendered.includes("<script>"));
  assert.equal(
    load(rendered)(".quote-author").text(),
    "<script>alert(1)</script>",
  );
  const repeated = `${quote.toBlock(data)}\n\nAn ordinary paragraph.\n\n${quote.toBlock({ ...data, author: "Diane" })}`;
  assert.equal(
    [...repeated.matchAll(new RegExp(quote.pattern.source, "gm"))].length,
    2,
  );
});

/** Read CMS entries by filename stem, using YAML for Markdown front matter. */
function contentRecords(folder, extension) {
  return new Map(
    readdirSync(folder)
      .filter((file) => file.endsWith(extension))
      .map((file) => {
        const body = readFileSync(path.join(folder, file), "utf8");
        const match =
          extension === ".md"
            ? /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body)
            : null;
        if (extension === ".md")
          assert.ok(match, `${file} has YAML front matter`);
        return [
          file.slice(0, -extension.length),
          { data: match ? parse(match[1]) : JSON.parse(body), body },
        ];
      }),
  );
}

/** Check upload references without requiring the future site's routing or a network. */
function assertUploadsExist(body, label) {
  for (const match of body.matchAll(/\/uploads\/[^\s"'<>\\)]+/g)) {
    const pathname = decodeURIComponent(
      new URL(match[0], "https://local.invalid").pathname,
    );
    assert.ok(existsSync(`public${pathname}`), `${label}: missing ${pathname}`);
  }
}

/** Ensure each editable CMS object/list exposes the corresponding settings keys. */
function assertSettingsFields(
  fields,
  values,
  label = "settings",
  exact = true,
) {
  const fieldNames = fields.map((field) => field.name);
  if (exact)
    assert.deepEqual(
      fieldNames.sort(),
      Object.keys(values).sort(),
      `${label} fields`,
    );
  else
    for (const key of Object.keys(values))
      assert.ok(
        fieldNames.includes(key),
        `${label}.${key} is editable in the CMS`,
      );
  for (const field of fields) {
    const value = values[field.name];
    if (field.widget === "object" && value)
      assertSettingsFields(field.fields, value, `${label}.${field.name}`);
    if (field.widget === "list" && value?.length)
      for (const item of value)
        assertSettingsFields(
          field.fields,
          item,
          `${label}.${field.name}[]`,
          false,
        );
  }
}

test("Decap uses the repository backend and tracked editable files, not archive data", () => {
  assert.equal(config.backend.repo, "LibrariesHacked/libraryon-commons");
  assert.equal(config.backend.branch, "main");
  assert.equal(config.local_backend, true);
  assert.equal(config.media_library, undefined);
  assert.ok(existsSync(config.media_folder));
  for (const collection of config.collections) {
    if (collection.folder) {
      assert.ok(existsSync(collection.folder));
      assert.ok(!collection.folder.startsWith("archive/"));
    }
    for (const file of collection.files || []) assert.ok(existsSync(file.file));
  }
  for (const name of ["libraries", "authorities"])
    assert.ok(
      config.collections.some((collection) => collection.name === name),
    );
  assert.ok(
    !config.collections.some(
      (collection) => collection.name === "mobile-libraries",
    ),
  );
  assert.equal(
    config.collections.find((collection) => collection.name === "libraries")
      .folder,
    "src/content/libraries",
  );
});

test("site settings have configured fields and preserve data after a YAML round trip", () => {
  const fields = config.collections.find(
    (collection) => collection.name === "settings",
  ).files[0].fields;
  assertSettingsFields(fields, settings);
  assert.deepEqual(parse(stringify(settings)), settings);
});

test("menu hierarchy, single footer attribution, and CMS-only content origin are configured", () => {
  const [libraryLink, discover, about] = settings.navigation;
  assert.equal(libraryLink.label, "Find a library");
  assert.equal(discover.label, "Discover");
  assert.deepEqual(
    discover.children.map((item) => item.label),
    ["Reading", "Work and skills", "Your community", "Special collections"],
  );
  assert.equal(about.label, "About");
  for (const item of [...discover.children, ...about.children])
    assert.ok(item.url);
  assert.ok(settings.footer.attribution);
  assert.ok(settings.footer.links_heading);
  assert.ok(settings.footer.links.length);
  assert.equal(settings.ui.editorial.original_content_label, undefined);
  assert.equal(settings.ui.editorial.new_content_label, undefined);
  const pages = config.collections.find(
    (collection) => collection.name === "pages",
  );
  const origin = pages.fields.find((field) => field.name === "content_origin");
  assert.deepEqual(
    origin.options.map((option) => option.value),
    ["libraryon", "commons"],
  );
  const published = pages.fields.find((field) => field.name === "published");
  assert.equal(published.widget, "boolean");
  assert.equal(published.default, true);
  assert.ok(
    !settings.footer.links.some((link) =>
      /accessibility statement|privacy notice/i.test(link.label),
    ),
  );
});

test("pages retain credits and galleries, and sessions associate slides with conferences", () => {
  const pages = config.collections.find(
    (collection) => collection.name === "pages",
  );
  const gallery = pages.fields.find((field) => field.name === "gallery");
  assert.ok(gallery.fields.some((field) => field.name === "credit"));
  assert.ok(gallery.fields.some((field) => field.name === "alt"));
  const pathField = pages.fields.find((field) => field.name === "path");
  assert.match("/about/pressplay", new RegExp(pathField.pattern[0]));
  assert.ok(!new RegExp(pathField.pattern[0]).test("https://example.com"));
  const collections = new Set(
    config.collections.map((collection) => collection.name),
  );
  for (const collection of config.collections) {
    for (const field of collection.fields || []) {
      if (field.widget === "relation")
        assert.ok(collections.has(field.collection));
    }
  }
  const sessions = config.collections.find(
    (collection) => collection.name === "sessions",
  );
  assert.deepEqual(
    sessions.fields.find((field) => field.name === "conference").filters,
    [{ field: "kind", values: ["conference"] }],
  );
  assert.equal(
    sessions.fields.find((field) => field.name === "resources").multiple,
    true,
  );
});

test("editable Markdown lists use a single space after their markers", () => {
  for (const folder of ["pages", "faqs"]) {
    for (const [id, record] of contentRecords(`src/content/${folder}`, ".md")) {
      const body = record.body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
      assert.equal(
        normalizeListSpacing(body),
        body,
        `${folder}/${id}: list-marker spacing`,
      );
    }
  }
});

test("CMS records have unique public paths, valid relations and existing local files", () => {
  const pages = contentRecords("src/content/pages", ".md");
  const faqs = contentRecords("src/content/faqs", ".md");
  const resources = contentRecords("src/content/resources", ".json");
  const sessions = contentRecords("src/content/sessions", ".json");
  const paths = new Set();
  const pattern = new RegExp(
    config.collections
      .find((collection) => collection.name === "pages")
      .fields.find((field) => field.name === "path").pattern[0],
  );
  assert.ok(pages.size > 0);
  for (const [id, record] of pages) {
    assert.ok(record.data.title, `${id}: missing title`);
    assert.match(record.data.path, pattern);
    if (record.data.published !== false) {
      assert.ok(
        !paths.has(record.data.path),
        `Duplicate public page path: ${record.data.path}`,
      );
      paths.add(record.data.path);
    }
    for (const resource of record.data.resources || [])
      assert.ok(resources.has(resource), `${id}: missing ${resource}`);
    for (const faq of record.data.faqs || []) {
      assert.ok(faqs.has(faq), `${id}: missing FAQ ${faq}`);
      assert.ok(
        !record.body.includes(`### ${faqs.get(faq).data.question}`),
        `${id}: inline copy of FAQ ${faq}`,
      );
    }
    if (record.data.faqs?.length)
      assert.equal(
        [...record.body.matchAll(/^\{\{faqs\}\}\r?$/gm)].length,
        1,
        `${id}: FAQ module is placed once`,
      );
    assertUploadsExist(record.body, id);
  }
  for (const [id, record] of faqs) assertUploadsExist(record.body, id);
  for (const [id, record] of resources) {
    assert.ok(record.data.title, `${id}: missing title`);
    assert.ok(record.data.url, `${id}: missing URL`);
    assertUploadsExist(record.body, id);
  }
  for (const [id, record] of sessions) {
    assert.equal(
      pages.get(record.data.conference)?.data.kind,
      "conference",
      `${id}: invalid conference`,
    );
    for (const resource of record.data.resources || [])
      assert.ok(resources.has(resource), `${id}: missing ${resource}`);
  }
});

test("obsolete legal pages remain in the CMS but are unpublished", () => {
  const pages = contentRecords("src/content/pages", ".md");
  for (const id of [
    "legal--privacy-notice",
    "legal--ai-statement",
    "legal--accessibility-statement",
  ]) {
    assert.ok(pages.has(id), `${id} remains editable in the CMS`);
    assert.equal(
      pages.get(id).data.published,
      false,
      `${id} is archived from the public site`,
    );
  }
});

test("the original library-map and events snapshots remain archived but unpublished", () => {
  const pages = contentRecords("src/content/pages", ".md");
  assert.ok(pages.has("libraries"));
  assert.equal(pages.get("libraries").data.path, "/libraries");
  assert.equal(pages.get("libraries").data.published, false);
  assert.ok(pages.has("events"));
  assert.equal(pages.get("events").data.path, "/events");
  assert.equal(pages.get("events").data.published, false);
});

test("original article snapshots and reference-only page bodies remain verified", () => {
  const baseline = JSON.parse(
    readFileSync("migration/source-articles.json", "utf8"),
  );
  const mappings = existsSync("migration/filenames.json")
    ? JSON.parse(readFileSync("migration/filenames.json", "utf8")).renames
    : [];
  const modular = existsSync("migration/modular-content.json")
    ? JSON.parse(readFileSync("migration/modular-content.json", "utf8"))
    : { pages: [] };
  let snapshots = [];
  if (modular.snapshot) {
    const bytes = readFileSync(modular.snapshot.file);
    assert.equal(digest(bytes), modular.snapshot.sha256);
    snapshots = JSON.parse(gunzipSync(bytes));
  }
  for (const article of baseline.articles) {
    const body = readFileSync(article.file, "utf8").replace(
      /^---\r?\n[\s\S]*?\r?\n---\r?\n/,
      "",
    );
    const migrated = modular.pages.find((page) => page.file === article.file);
    const snapshot = snapshots.find((page) => page.file === article.file);
    if (migrated) {
      assert.ok(snapshot, `Missing original snapshot: ${article.file}`);
      const originalBody = snapshot.markdown.replace(
        /^---\r?\n[\s\S]*?\r?\n---\r?\n/,
        "",
      );
      assert.equal(
        digest(originalAssetReferences(originalBody, mappings)),
        article.body_sha256,
        `Changed original snapshot: ${article.file}`,
      );
    }
    assert.equal(
      digest(originalAssetReferences(body, mappings)),
      migrated?.body_sha256 || article.body_sha256,
      `Unexpected article body change: ${article.file}`,
    );
  }
});

test("homepage controls point to existing content and preserve the main heading", () => {
  const homepage = JSON.parse(readFileSync("src/data/homepage.json", "utf8"));
  const paths = new Set(
    [...contentRecords("src/content/pages", ".md").values()]
      .filter((record) => record.data.published !== false)
      .map((record) => record.data.path),
  );
  for (const path of [
    ...homepage.feature_pages,
    ...homepage.collection_pages,
    ...homepage.community_pages,
  ])
    assert.ok(paths.has(path), `Missing homepage selection: ${path}`);
  assert.equal(homepage.title, "Libraries are for everyone");
  if (homepage.image) assert.ok(existsSync(`public${homepage.image}`));
  assert.ok(Array.isArray(homepage.carousel) && homepage.carousel.length >= 3);
  const testimonialImage = JSON.parse(
    readFileSync("migration/import-report.json", "utf8"),
  ).assets.find(
    (asset) =>
      asset.sha256 ===
      "d8d54cb7e50d820ae0c8f4b528263d433b20427a5c76a332990590d644007f69",
  )?.url;
  assert.ok(
    testimonialImage,
    "The preserved testimonial image has a current upload path",
  );
  for (const slide of homepage.carousel) {
    assert.ok(
      slide.image && existsSync(`public${slide.image}`),
      `Missing carousel image: ${slide.image}`,
    );
    assert.ok(
      slide.alt && slide.alt.trim().length > 0,
      `Missing carousel alt text for ${slide.image}`,
    );
    assert.ok(
      slide.image !== testimonialImage,
      "Tracy testimonial photo must remain a testimonial image, not a hero carousel image",
    );
  }
  const fields = config.collections
    .find((collection) => collection.name === "settings")
    .files.find((file) => file.name === "homepage").fields;
  assert.deepEqual(
    fields.map((field) => field.name).sort(),
    Object.keys(homepage).sort(),
  );
});

test("all original directory listings are represented in the editable CMS source", () => {
  const source = JSON.parse(
    gunzipSync(readFileSync("preservation/data.json.gz")),
  );
  const sourceLibraries = source["libraries.json"].data;
  const sourceAuthorities = source["authorities.json"].data;
  const ids = new Set(libraries.map((library) => String(library.source_id)));
  const authorityIds = new Set(
    authorities.map((authority) => String(authority.source_id)),
  );
  for (const library of sourceLibraries)
    assert.ok(
      ids.has(String(library.id)),
      `Missing source library ${library.id}`,
    );
  const sourceUprns = sourceLibraries.filter(
    (library) => library.attributes?.uprn,
  );
  assert.ok(
    sourceUprns.length > 0,
    "Source archive contains populated UPRN values",
  );
  for (const source of sourceUprns) {
    const editable = libraries.find(
      (library) => String(library.source_id) === String(source.id),
    );
    assert.equal(
      editable?.uprn,
      source.attributes.uprn,
      `UPRN lost for source library ${source.id}`,
    );
  }
  for (const authority of sourceAuthorities)
    assert.ok(
      authorityIds.has(String(authority.id)),
      `Missing source authority ${authority.id}`,
    );
  const authorityFields = config.collections.find(
    (collection) => collection.name === "authorities",
  ).fields;
  const libraryFields = config.collections.find(
    (collection) => collection.name === "libraries",
  ).fields;
  const uprn = libraryFields.find((field) => field.name === "uprn");
  assert.equal(uprn.widget, "string");
  assert.equal(uprn.required, false);
  const countries = authorityFields.find(
    (field) => field.name === "country",
  ).options;
  for (const authority of authorities)
    assert.ok(
      countries.includes(authority.country),
      `Country not editable: ${authority.country}`,
    );
});

test("imported archive media is checksummed, deduplicated and within ordinary-Git limits", () => {
  const checksums = new Set();
  const report = JSON.parse(
    readFileSync("migration/import-report.json", "utf8"),
  );
  const expected = new Map(
    report.assets.map((asset) => [asset.file, asset.sha256]),
  );
  for (const file of readdirSync("public/uploads/archive")) {
    const filename = path.join("public/uploads/archive", file);
    const checksum = digest(readFileSync(filename));
    assert.equal(
      checksum,
      expected.get(filename),
      `Changed imported media: ${file}`,
    );
    assert.ok(!checksums.has(checksum), `Duplicate imported media: ${file}`);
    assert.ok(
      statSync(filename).size < 100 * 1024 * 1024,
      `GitHub file limit: ${file}`,
    );
    checksums.add(checksum);
  }
});

test("saving in the CMS stamps a date field that exists in each collection", () => {
  const admin = readFileSync("src/pages/admin/index.astro", "utf8");
  assert.ok(admin.includes("name: 'preSave'"));
  for (const [name, fields] of Object.entries({
    pages: ["updated_on"],
    resources: ["updated_on"],
    sessions: ["updated_on"],
    contributors: ["updated_on"],
    authorities: ["updated_on", "reviewed_on"],
    libraries: ["updated_on", "reviewed_on"],
  })) {
    const collection = config.collections.find((item) => item.name === name);
    assert.ok(
      admin.includes(
        `${name}: [${fields.map((field) => `'${field}'`).join(", ")}]`,
      ),
      `${name} is stamped`,
    );
    for (const field of fields)
      assert.ok(
        collection.fields.some((item) => item.name === field),
        `${name} has ${field}`,
      );
  }
});

test("library records carry their services and the original update date", () => {
  const withServices = libraries.filter((library) => library.services?.length);
  assert.ok(withServices.length > 3700);
  for (const library of libraries) {
    assert.match(
      library.updated_on,
      /^\d{4}-\d{2}-\d{2}$/,
      `${library.name} has an update date`,
    );
    for (const item of library.services || [])
      assert.ok(item.service, `${library.name} service name`);
  }
  const tenby = libraries.find((library) => library.slug === "tenby-library");
  assert.deepEqual(
    tenby.services.map((item) => item.service),
    ["Books", "Printing", "Free Wi-Fi"],
  );
  assert.ok(
    authorities.every((authority) =>
      /^\d{4}-\d{2}-\d{2}$/.test(authority.updated_on),
    ),
  );
});

test('original "Last updated" dates are metadata, not repeated body text', () => {
  const pages = contentRecords("src/content/pages", ".md");
  assert.equal(pages.get("work-and-skills").data.updated_on, "2026-01-30");
  for (const [id, record] of pages) {
    const body = record.body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
    assert.ok(!/^Last updated:/m.test(body), `${id} repeats its updated date`);
  }
});

test("library text fields are plain strings and facility labels keep original wording", async () => {
  const { facilityLabel } = await import("../src/lib/directory-model.mjs");
  for (const library of libraries)
    for (const field of ["openingTimesNotes", "notes", "address"])
      assert.equal(typeof library[field], "string", `${library.name} ${field}`);
  assert.equal(facilityLabel("step-free-access"), "Step-free access");
  assert.equal(facilityLabel("hearing-loop-system"), "Hearing loop system");
});
