import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { parse } from "yaml";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import remarkDirective from "remark-directive";
import { transformImportedMarkup } from "./legacy-markup.mjs";
import { digest } from "./collect.mjs";
import { originalAssetReferences } from "../migrate-filenames.mjs";

const text = (node) => node.value || (node.children || []).map(text).join("");
const hasClass = (node, name) => node.properties?.className?.includes(name);
const find = (node, predicate) =>
  predicate(node)
    ? node
    : (node.children || [])
        .map((child) => find(child, predicate))
        .find(Boolean);
const attributes = (values) => {
  const entries = Object.entries(values).filter(([, value]) => value);
  return entries.length
    ? `{${entries.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ")}}`
    : "";
};

export async function explicitMarkdown(body) {
  let sourceTree;
  let renderedTree;
  const processor = await createMarkdownProcessor({
    syntaxHighlight: false,
    smartypants: false,
    remarkPlugins: [
      remarkDirective,
      () => (tree) => {
        sourceTree = structuredClone(tree);
      },
    ],
    rehypePlugins: [
      () => (tree) => {
        transformImportedMarkup(tree, "");
        renderedTree = tree;
      },
    ],
  });
  await processor.render(body);
  const roots = sourceTree.children;
  const bounds = (node) => {
    const positions = [];
    const visit = (child) => {
      if (child.position) positions.push(child.position);
      (child.children || []).forEach(visit);
    };
    visit(node);
    if (!positions.length)
      throw new Error("Legacy component has no source positions");
    const start = Math.min(
      ...positions.map((position) => position.start.offset),
    );
    const end = Math.max(...positions.map((position) => position.end.offset));
    const first = roots.findIndex(
      (root) =>
        root.position.start.offset <= start &&
        root.position.end.offset >= start,
    );
    const last = roots.findIndex(
      (root) =>
        root.position.start.offset <= end && root.position.end.offset >= end,
    );
    if (first < 0 || last < 0)
      throw new Error("Cannot locate original component source");
    return {
      start: roots[first].position.start.offset,
      end: roots[last].position.end.offset,
      first,
      last,
    };
  };
  const atomic = [];
  for (const root of roots) {
    if (root.type !== "paragraph") continue;
    const value = text(root).trim();
    const { start, end } = root.position;
    if (value === "View" || /^\d+\/\d+$/.test(value) || value === "12345")
      atomic.push({ start: start.offset, end: end.offset, value: "" });
    else if (/^\u2022\s*/.test(value))
      atomic.push({
        start: start.offset,
        end: end.offset,
        value: body.slice(start.offset, end.offset).replace(/^\u2022\s*/, "- "),
      });
  }
  const apply = (source, edits, offset = 0) => {
    for (const edit of [...edits].sort(
      (first, second) => second.start - first.start,
    ))
      source = `${source.slice(0, edit.start - offset)}${edit.value}${source.slice(edit.end - offset)}`;
    return source;
  };
  const fragment = (range) =>
    apply(
      body.slice(range.start, range.end),
      atomic.filter(
        (edit) => edit.start >= range.start && edit.end <= range.end,
      ),
      range.start,
    ).trim();
  const attribution = (group) => {
    const author = find(group, (node) => hasClass(node, "quote-author"));
    const role = find(group, (node) => hasClass(node, "quote-role"));
    const organisation = role && find(role, (node) => node.tagName === "a");
    const organisationText = organisation ? text(organisation) : "";
    const roleText = role ? text(role).trim() : "";
    const roleLabel =
      organisationText && roleText.endsWith(organisationText)
        ? roleText
            .slice(0, -organisationText.length)
            .replace(/,\s*$/, "")
            .trim()
        : roleText;
    return {
      author: text(author),
      role: roleLabel,
      organisation: organisationText,
      url: organisation?.properties.href,
    };
  };
  const groups = [];
  const visit = (node) => {
    const type = [
      "testimonial-card",
      "testimonial-quote",
      "imported-content-card-grid",
      "library-can-do-panel",
      "video-embed",
      "faq-section",
    ].find((name) => hasClass(node, name));
    if (type) {
      const range = bounds(node);
      if (
        roots[range.first].type === "containerDirective" ||
        roots[range.first].type === "leafDirective"
      )
        return;
      let value;
      if (type === "testimonial-card" || type === "testimonial-quote") {
        const quote = find(node, (child) => child.tagName === "blockquote");
        const quoteRange = bounds(quote);
        let content = fragment(quoteRange);
        const sourceQuote = roots[quoteRange.last];
        const last =
          sourceQuote.type === "blockquote"
            ? sourceQuote.children.at(-1)
            : null;
        if (
          last?.type === "paragraph" &&
          /^[\u2014\u2013]\s/.test(text(last).trim())
        ) {
          const lineStart =
            body.lastIndexOf("\n", last.position.start.offset) + 1;
          content = body.slice(quoteRange.start, lineStart).trim();
        }
        const image = find(node, (child) => child.tagName === "img");
        const name = image ? "testimonial" : "quote";
        value = `:::${name}${attributes(attribution(node))}\n\n${image ? `${fragment(bounds(image))}\n\n` : ""}${content}\n\n:::`;
      } else if (type === "imported-content-card-grid") {
        const cards = node.children.map((card) => {
          const source = bounds(card);
          return `:::card${attributes({ href: card.properties.href })}\n\n${fragment(source)}\n\n:::`;
        });
        const previous = roots[range.first - 1];
        if (previous?.type === "paragraph" && text(previous).trim() === "[")
          range.start = previous.position.start.offset;
        const next = roots[range.last + 1];
        if (
          next?.type === "paragraph" &&
          /^\]\([^)]+\)/.test(text(next).trim())
        )
          range.end = next.position.end.offset;
        value = `::::cards\n\n${cards.join("\n\n")}\n\n::::`;
      } else if (type === "library-can-do-panel")
        value = `:::list-panel\n\n${fragment(range)}\n\n:::`;
      else if (type === "video-embed") {
        const frame = find(node, (child) => child.tagName === "iframe");
        value = `::video${attributes({ src: frame.properties.src, title: frame.properties.title })}`;
      } else
        throw new Error(
          "Inline FAQ sections must be modularized before making content explicit",
        );
      groups.push({ ...range, value, type });
      return;
    }
    (node.children || []).forEach(visit);
  };
  visit(renderedTree);
  const edits = [
    ...groups,
    ...atomic.filter(
      (edit) =>
        !groups.some(
          (group) => edit.start >= group.start && edit.end <= group.end,
        ),
    ),
  ];
  const sorted = [...edits].sort((first, second) => first.start - second.start);
  for (const [index, edit] of sorted.entries()) {
    if (index && sorted[index - 1].end > edit.start)
      throw new Error("Overlapping legacy component ranges");
  }
  return {
    body: apply(body, edits),
    groups: groups.map((group) => group.type),
    cleanup: edits.length - groups.length,
  };
}

export async function makeContentExplicit({
  root = process.cwd(),
  apply = false,
} = {}) {
  const absolute = (file) => path.join(root, file);
  const json = async (file) =>
    JSON.parse(await readFile(absolute(file), "utf8"));
  const manifest = await json("migration/modular-content.json");
  const snapshots = JSON.parse(
    gunzipSync(await readFile(absolute(manifest.snapshot.file))),
  );
  const mappings = (await json("migration/filenames.json")).renames;
  const originals = (await json("migration/source-articles.json")).articles;
  const updates = [];
  for (const filename of (await readdir(absolute("src/content/pages"))).filter(
    (file) => file.endsWith(".md"),
  )) {
    const file = `src/content/pages/${filename}`;
    const markdown = await readFile(absolute(file), "utf8");
    const header = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(markdown);
    const metadata = parse(header[1]);
    const body = markdown.slice(header[0].length);
    const migrated = manifest.pages.find((page) => page.file === file);
    const expected =
      migrated?.body_sha256 ||
      originals.find((page) => page.file === file)?.body_sha256;
    if (
      expected &&
      digest(originalAssetReferences(body, mappings)) !== expected
    )
      throw new Error(`Unexpected source change: ${file}`);
    if (migrated?.components_explicit) continue;
    const result = await explicitMarkdown(body);
    if (result.body === body) continue;
    const newline = header[0].includes("\r\n") ? "\r\n" : "\n";
    const nextBody = result.body.replace(/\r?\n/g, newline);
    if (!snapshots.some((snapshot) => snapshot.file === file))
      snapshots.push({ file, markdown });
    const entry = migrated || { file, faqs: metadata.faqs || [] };
    entry.body_sha256 = digest(originalAssetReferences(nextBody, mappings));
    entry.components_explicit = true;
    if (!migrated) manifest.pages.push(entry);
    updates.push({
      file,
      markdown: header[0] + nextBody,
      groups: result.groups,
      cleanup: result.cleanup,
    });
  }
  if (apply && updates.length) {
    const bytes = gzipSync(`${JSON.stringify(snapshots, null, 2)}\n`, {
      level: 9,
    });
    await writeFile(absolute(manifest.snapshot.file), bytes);
    manifest.snapshot = {
      file: manifest.snapshot.file,
      sha256: digest(bytes),
      bytes: bytes.length,
    };
    await writeFile(
      absolute("migration/modular-content.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    for (const update of updates)
      await writeFile(absolute(update.file), update.markdown);
  }
  return updates.map(({ file, groups, cleanup }) => ({
    file,
    groups,
    cleanup,
  }));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  console.log(
    JSON.stringify(
      await makeContentExplicit({ apply: process.argv.includes("--apply") }),
      null,
      2,
    ),
  );
