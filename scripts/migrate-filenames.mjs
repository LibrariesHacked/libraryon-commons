import path from "node:path";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { parse } from "yaml";

export function descriptiveSlug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2018\u2019]/g, "")
    .replace(/(?:^|[-_])[a-f0-9]{8,}(?=[-_.]|$)/gi, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140)
    .replace(/-$/g, "");
}

export function uniqueFilename(label, extension, used) {
  const stem = /\.(?:jpe?g|png|gif|webp|avif|svg|tiff?|ico|heic|img)$/i.test(
    extension,
  )
    ? imageFilenameStem(label)
    : descriptiveSlug(label);
  if (!stem) throw new Error(`Missing descriptive filename for ${label}`);
  let candidate = `${stem}${extension}`;
  let number = 2;
  while (used.has(candidate.toLowerCase()))
    candidate = `${stem}-${number++}${extension}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

export function imageFilenameStem(label) {
  if (!isDescriptiveImageLabel(label)) return "";
  const variant = /(?:\s|-)(original|master)(?:-\d+)?$/i.exec(String(label));
  const suffix = variant ? `-${variant[1].toLowerCase()}` : "";
  const sentence = String(label)
    .replace(/(?:\s|-)(original|master)(?:-\d+)?$/i, "")
    .split(/[.!?](?:\s|$)/)[0];
  const words = descriptiveSlug(sentence).split("-").filter(Boolean);
  const selected = [];
  for (const word of words) {
    if (
      selected.length >= 10 ||
      [...selected, word].join("-").length > 64 - suffix.length
    )
      break;
    selected.push(word);
  }
  while (
    selected.length > 1 &&
    /^(?:a|an|the|of|at|in|to|with|for|and|on|by|or)$/.test(selected.at(-1))
  )
    selected.pop();
  const stem =
    selected.join("-") ||
    descriptiveSlug(sentence)
      .slice(0, 64 - suffix.length)
      .replace(/-$/, "");
  return stem ? `${stem}${suffix}` : "";
}

export function isDescriptiveImageLabel(value) {
  const stem = descriptiveSlug(value);
  return (
    Boolean(stem) &&
    !/^(?:(?:libraryon-|historical-archive-|archival-)?(?:supporting-)?(?:image|photo|picture|img|untitled|untitled-image|unknown|download|thumbnail)(?:-(?:original|master))?(?:-\d+)?|\d+)$/.test(
      stem,
    )
  );
}

export function reviewedImageDescriptions(root = process.cwd()) {
  const file = path.join(root, "migration/image-descriptions.json");
  if (!existsSync(file)) return new Map();
  return new Map(readJSON(file).images.map((image) => [image.sha256, image]));
}

export function sourceFilename(url) {
  try {
    const parsed = new URL(url, "https://local.invalid");
    const filename =
      parsed.searchParams.get("filename") ||
      path.posix.basename(parsed.pathname);
    return descriptiveSlug(path.posix.parse(decodeURIComponent(filename)).name);
  } catch {
    return "";
  }
}

const checksum = (body) => createHash("sha256").update(body).digest("hex");
const readJSON = (filename) => JSON.parse(readFileSync(filename, "utf8"));
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

function filesIn(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(folder, entry.name);
    return entry.isDirectory() ? filesIn(filename) : [filename];
  });
}

function replacementFunction(replacements) {
  if (!replacements.length) return (value) => value;
  const lookup = new Map(replacements);
  const pattern = new RegExp(
    [...lookup.keys()]
      .sort((first, second) => second.length - first.length)
      .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|"),
    "g",
  );
  return (value) => value.replace(pattern, (match) => lookup.get(match));
}

export function originalAssetReferences(body, mappings) {
  const history = new Map(
    mappings
      .filter((entry) => entry.from.startsWith("public/uploads/"))
      .map((entry) => [
        entry.to.slice("public".length),
        entry.from.slice("public".length),
      ]),
  );
  const original = (value) => {
    const seen = new Set();
    while (history.has(value) && !seen.has(value)) {
      seen.add(value);
      value = history.get(value);
    }
    return value;
  };
  return replacementFunction(
    mappings
      .filter((entry) => entry.from.startsWith("public/uploads/"))
      .map((entry) => [
        entry.to.slice("public".length),
        original(entry.from.slice("public".length)),
      ]),
  )(body);
}

export function migrateFilenames({ root = process.cwd(), apply = false } = {}) {
  const absolute = (filename) => path.join(root, filename);
  const mappingFile = absolute("migration/filenames.json");
  const previous = existsSync(mappingFile) ? readJSON(mappingFile).renames : [];
  const report = readJSON(absolute("migration/import-report.json"));
  const reviewed = reviewedImageDescriptions(root);
  const mediaMasters = existsSync(absolute("src/data/media-masters.json"))
    ? readJSON(absolute("src/data/media-masters.json"))
    : { aliases: {} };
  const contentFiles = filesIn(absolute("src/content"))
    .filter((filename) => /\.(md|json)$/.test(filename))
    .sort();
  const records = contentFiles.map((filename) => {
    const text = readFileSync(filename, "utf8");
    const data = filename.endsWith(".md")
      ? parse(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)[1])
      : JSON.parse(text);
    return { file: path.relative(root, filename), text, data };
  });
  const labels = new Map();
  const addLabel = (url, label, priority) => {
    if (!url?.startsWith("/uploads/") || !descriptiveSlug(label)) return;
    if (!url?.startsWith("/uploads/") || !isDescriptiveImageLabel(label))
      return;
    const key = decodeURIComponent(url.split(/[?#]/)[0]);
    if (!labels.has(key) || labels.get(key).priority < priority)
      labels.set(key, { label, priority });
  };
  for (const { data, text } of records) {
    for (const image of [data.hero, ...(data.gallery || [])].filter(Boolean))
      addLabel(
        image.image,
        [image.alt, image.caption, data.title].find(isDescriptiveImageLabel),
        5,
      );
    if (data.url) addLabel(data.url, data.title, 3);
    for (const match of text.matchAll(
      /(!?)\[([^\]\r\n]*)\]\((\/uploads\/[^\s)]+)(?:\s+"[^"]*")?\)/g,
    ))
      addLabel(match[3], match[2], match[1] ? 4 : 3);
    for (const match of text.matchAll(/\/uploads\/[^\s"'<>\\)]+/g))
      addLabel(
        match[0],
        `${data.title || data.question || data.name} ${/\.pdf$/i.test(match[0]) ? "document" : "image"}`,
        1,
      );
  }
  const sessionLabels = new Map();
  for (const { file, data } of records.filter((record) =>
    record.file.startsWith("src/content/sessions/"),
  )) {
    for (const id of data.resources || []) {
      const resource = records.find(
        (record) => record.file === `src/content/resources/${id}.json`,
      );
      if (!resource) throw new Error(`Missing resource ${id} in ${file}`);
      const label = `${data.title} ${resource.data.kind}`;
      sessionLabels.set(resource.file, label);
      addLabel(resource.data.url, label, 6);
    }
  }
  const homepage = readJSON(absolute("src/data/homepage.json"));
  for (const image of homepage.carousel || [])
    addLabel(image.image, image.alt, 5);
  addLabel(homepage.image, homepage.image_alt, 5);
  const bundle = absolute("preservation/content.json.gz");
  if (existsSync(bundle)) {
    const sourceAssets = new Map(
      report.assets.flatMap((asset) => [
        [asset.source, asset.url],
        [asset.resolved, asset.url],
      ]),
    );
    for (const page of JSON.parse(gunzipSync(readFileSync(bundle)))) {
      for (const image of page.images || []) {
        for (const source of [
          image.url,
          ...(image.srcset || "")
            .split(",")
            .map((item) => item.trim().split(/\s/)[0]),
        ])
          addLabel(
            sourceAssets.get(source),
            image.alt || `${page.title} image`,
            image.alt ? 4 : 1,
          );
      }
      for (const link of page.links || [])
        addLabel(sourceAssets.get(link.url), link.text || page.title, 2);
    }
  }
  const renames = [];
  for (const collection of ["faqs", "resources", "sessions"]) {
    const folder = `src/content/${collection}`;
    const entries = records.filter(
      (record) => path.dirname(record.file) === folder,
    );
    const opaque = (file) =>
      /(?:^|[-_])[a-f0-9]{16,}(?=\.)/.test(path.basename(file));
    const used = new Set(
      entries
        .filter((record) => !opaque(record.file))
        .map((record) => path.basename(record.file).toLowerCase()),
    );
    for (const { file, data } of entries.filter((record) =>
      opaque(record.file),
    )) {
      const label =
        collection === "faqs"
          ? data.question
          : collection === "sessions"
            ? `${data.conference} ${data.title}`
            : sessionLabels.get(file) || data.title;
      renames.push({
        from: file,
        to: `${folder}/${uniqueFilename(label, path.extname(file), used)}`,
      });
    }
  }
  const uploadFiles = filesIn(absolute("public/uploads")).sort();
  const opaqueUpload = (filename) =>
    /^[a-f0-9]{32,}\.[a-z0-9]+$/i.test(path.basename(filename)) ||
    !isDescriptiveImageLabel(path.parse(filename).name) ||
    (/\.(?:jpe?g|png|gif|webp|avif|svg|tiff?|ico|heic|img)$/i.test(filename) &&
      (path.parse(filename).name.length > 72 ||
        /-(?:a|an|the|of|at|in|to|with|for|and|on|by|or)(?:-(?:original|master))?(?:-\d+)?$/i.test(
          path.parse(filename).name,
        )));
  const usedByFolder = new Map();
  for (const filename of uploadFiles.filter((file) => !opaqueUpload(file))) {
    const folder = path.dirname(filename);
    if (!usedByFolder.has(folder)) usedByFolder.set(folder, new Set());
    usedByFolder.get(folder).add(path.basename(filename).toLowerCase());
  }
  for (const filename of uploadFiles.filter(opaqueUpload)) {
    const from = path.relative(root, filename);
    const url = from.slice("public".length);
    const sources = report.assets.filter((asset) => asset.file === from);
    const sha256 = checksum(readFileSync(filename));
    const description =
      reviewed.get(sha256) || reviewed.get(mediaMasters.aliases[url]?.sha256);
    const sourceLabel = sources
      .flatMap((asset) => [
        sourceFilename(asset.resolved),
        sourceFilename(asset.source),
      ])
      .find(isDescriptiveImageLabel);
    const contextual = labels.get(url);
    let label =
      description?.description ||
      (contextual?.priority >= 4
        ? contextual.label
        : sourceLabel ||
          contextual?.label ||
          (isDescriptiveImageLabel(path.parse(from).name)
            ? path.parse(from).name
            : ""));
    if (description && /(?:^|-)original(?:-\d+)?$/.test(path.parse(from).name))
      label += " original";
    if (!label) throw new Error(`No descriptive metadata found for ${from}`);
    const folder = path.dirname(filename);
    if (!usedByFolder.has(folder)) usedByFolder.set(folder, new Set());
    renames.push({
      from,
      to: path.join(
        path.dirname(from),
        uniqueFilename(
          label,
          description?.extension || path.extname(from),
          usedByFolder.get(folder),
        ),
      ),
      sha256,
    });
  }
  if (!apply || !renames.length) return { renames, applied: false };
  const replacements = renames.flatMap(({ from, to }) =>
    from.startsWith("public/")
      ? [
          [from, to],
          [from.slice("public".length), to.slice("public".length)],
        ]
      : [
          [from, to],
          [
            path.basename(from, path.extname(from)),
            path.basename(to, path.extname(to)),
          ],
        ],
  );
  const replace = replacementFunction(replacements);
  const state = readJSON(absolute("migration/import-state.json"));
  const managed = new Map(
    Object.entries(state.files).map(([file, hash]) => [
      file,
      existsSync(absolute(file)) &&
        checksum(readFileSync(absolute(file))) === hash,
    ]),
  );
  const editable = [
    ...filesIn(absolute("src")),
    ...filesIn(absolute("public/admin")),
    absolute("migration/import-report.json"),
    ...(existsSync(absolute("migration/coverage-audit.json"))
      ? [absolute("migration/coverage-audit.json")]
      : []),
  ].filter((file) => /\.(md|json|ya?ml|astro|m?js|ts|css|html)$/.test(file));
  const updates = editable
    .map((file) => {
      const before = readFileSync(file, "utf8");
      return { file, before, after: replace(before) };
    })
    .filter(({ before, after }) => before !== after);
  for (const { file, after } of updates) writeFileSync(file, after);
  for (const { from, to } of renames) renameSync(absolute(from), absolute(to));
  state.files = Object.fromEntries(
    Object.entries(state.files).map(([file, hash]) => {
      const target = replace(file);
      return [
        target,
        managed.get(file) ? checksum(readFileSync(absolute(target))) : hash,
      ];
    }),
  );
  writeFileSync(absolute("migration/import-state.json"), jsonText(state));
  writeFileSync(
    mappingFile,
    jsonText({ version: 1, renames: [...previous, ...renames] }),
  );
  return { renames, applied: true };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const result = migrateFilenames({ apply: process.argv.includes("--apply") });
  console.log(JSON.stringify(result, null, 2));
}
