import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkDirective from "remark-directive";
import { normalizeListSpacing } from "../src/lib/markdown-format.mjs";
import { originalAssetReferences } from "./migrate-filenames.mjs";
import { digest } from "./archive/collect.mjs";

export function normalizeLinkedCards(source) {
  const tree = unified().use(remarkParse).use(remarkDirective).parse(source);
  const edits = [];
  let linked = 0;
  const visit = (node) => {
    if (
      node.type === "containerDirective" &&
      node.name === "card" &&
      !node.attributes.href
    ) {
      const links = [];
      const collect = (child, parent) => {
        if (child.type === "link") links.push({ node: child, parent });
        if (child.type === "linkReference") links.push({ node: child, parent });
        (child.children || []).forEach((item) => collect(item, child));
      };
      collect(node);
      if (links.length === 1 && links[0].node.type === "link") {
        const { node: link, parent } = links[0];
        if (
          parent.children.length === 1 &&
          ["paragraph", "heading"].includes(parent.type)
        ) {
          const end = source.indexOf("\n", node.position.start.offset);
          const opening = source
            .slice(node.position.start.offset, end)
            .replace(/\r$/, "");
          const encoded = link.url
            .replaceAll("&", "&amp;")
            .replaceAll('"', "&quot;");
          const next = opening.endsWith("}")
            ? `${opening.slice(0, -1)} href="${encoded}"}`
            : `${opening}{href="${encoded}"}`;
          edits.push({
            start: node.position.start.offset,
            end: end - (source[end - 1] === "\r" ? 1 : 0),
            value: next,
          });
          if (parent.type === "paragraph")
            edits.push({
              start: parent.position.start.offset,
              end: parent.position.end.offset,
              value: "",
            });
          else
            edits.push({
              start: link.position.start.offset,
              end: link.position.end.offset,
              value: source.slice(
                link.children[0].position.start.offset,
                link.children.at(-1).position.end.offset,
              ),
            });
          linked += 1;
        }
      }
    }
    (node.children || []).forEach(visit);
  };
  visit(tree);
  for (const edit of edits.sort((first, second) => second.start - first.start))
    source = `${source.slice(0, edit.start)}${edit.value}${source.slice(edit.end)}`;
  return { source, linked };
}

export async function normalizeContent({
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
  const baseline = (await json("migration/source-articles.json")).articles;
  const mappings = (await json("migration/filenames.json")).renames;
  const updates = [];
  for (const folder of ["pages", "faqs"]) {
    for (const filename of (
      await readdir(absolute(`src/content/${folder}`))
    ).filter((file) => file.endsWith(".md"))) {
      const file = `src/content/${folder}/${filename}`;
      const source = await readFile(absolute(file), "utf8");
      const header = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(source)[0];
      const body = source.slice(header.length);
      const original = baseline.find((entry) => entry.file === file);
      const tracked = manifest.pages.find((entry) => entry.file === file);
      const expected = tracked?.body_sha256 || original?.body_sha256;
      if (
        expected &&
        digest(originalAssetReferences(body, mappings)) !== expected
      )
        throw new Error(`Unexpected source change: ${file}`);
      const result = normalizeLinkedCards(normalizeListSpacing(body));
      if (result.source === body) continue;
      if (!snapshots.some((entry) => entry.file === file))
        snapshots.push({ file, markdown: source });
      if (original || tracked) {
        const entry = tracked || { file, faqs: [] };
        entry.body_sha256 = digest(
          originalAssetReferences(result.source, mappings),
        );
        entry.formatting_normalized = true;
        if (!tracked) manifest.pages.push(entry);
      }
      updates.push({
        file,
        source: header + result.source,
        linked: result.linked,
      });
    }
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
      await writeFile(absolute(update.file), update.source);
  }
  return updates.map(({ file, linked }) => ({ file, linked }));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  console.log(
    JSON.stringify(
      await normalizeContent({ apply: process.argv.includes("--apply") }),
      null,
      2,
    ),
  );
