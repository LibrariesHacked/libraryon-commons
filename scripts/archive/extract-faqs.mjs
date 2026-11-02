import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { parse, stringify } from "yaml";
import {
  uniqueFilename,
  originalAssetReferences,
} from "../migrate-filenames.mjs";
import { digest } from "./collect.mjs";

export function extractFaqs({ root = process.cwd() } = {}) {
  const absolute = (file) => path.join(root, file);
  const folder = "src/content/faqs";
  mkdirSync(absolute(folder), { recursive: true });
  const usedNames = new Set(
    readdirSync(absolute(folder)).map((file) => file.toLowerCase()),
  );
  const manifestFile = "migration/modular-content.json";
  const snapshotFile = "preservation/modular-source-pages.json.gz";
  const manifest = existsSync(absolute(manifestFile))
    ? JSON.parse(readFileSync(absolute(manifestFile), "utf8"))
    : { version: 1, pages: [] };
  const snapshots = existsSync(absolute(snapshotFile))
    ? JSON.parse(gunzipSync(readFileSync(absolute(snapshotFile))))
    : [];
  const baseline = existsSync(absolute("migration/source-articles.json"))
    ? JSON.parse(
        readFileSync(absolute("migration/source-articles.json"), "utf8"),
      ).articles
    : [];
  const mappings = existsSync(absolute("migration/filenames.json"))
    ? JSON.parse(readFileSync(absolute("migration/filenames.json"), "utf8"))
        .renames
    : [];
  let extracted = 0;
  let modularized = 0;
  const writes = [];
  for (const filename of readdirSync(absolute("src/content/pages")).filter(
    (file) => file.endsWith(".md"),
  )) {
    const file = `src/content/pages/${filename}`;
    const source = readFileSync(absolute(file), "utf8");
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
    const data = parse(frontmatter[1]);
    const body = source.slice(frontmatter[0].length);
    const section =
      /^## ([^\r\n]*(?:questions|FAQs)[^\r\n]*)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/im.exec(
        body,
      );
    if (!section) continue;
    const questions = [
      ...section[2].matchAll(
        /^### ([^\r\n]+)\r?\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm,
      ),
    ];
    if (!questions.length) continue;
    if (snapshots.some((snapshot) => snapshot.file === file))
      throw new Error(`Inline FAQs were reintroduced in ${file}`);
    const original = baseline.find((article) => article.file === file);
    if (
      original &&
      digest(originalAssetReferences(body, mappings)) !== original.body_sha256
    )
      throw new Error(
        `Preserved article was changed before migration: ${file}`,
      );
    const references = [...(data.faqs || [])];
    if (references.length && references.length !== questions.length)
      throw new Error(`FAQ reference count differs in ${file}`);
    for (const [index, match] of questions.entries()) {
      const question = match[1].trim();
      const answer = match[2].trim();
      if (!answer) throw new Error(`Empty FAQ answer in ${file}: ${question}`);
      if (data.faqs?.length) {
        const entry = readFileSync(
          absolute(`${folder}/${references[index]}.md`),
          "utf8",
        );
        const metadata = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(entry)[1]);
        if (metadata.question !== question)
          throw new Error(
            `FAQ reference order differs in ${file}: ${question}`,
          );
        continue;
      }
      const filename = uniqueFilename(question, ".md", usedNames);
      const metadata = {
        question,
        source_url: data.source_url,
        attribution: data.attribution,
      };
      writes.push({
        file: `${folder}/${filename}`,
        source: `---\n${stringify(metadata)}---\n\n${answer}\n`,
        create: true,
      });
      references.push(filename.slice(0, -".md".length));
      extracted += 1;
    }
    const newline = frontmatter[0].includes("\r\n") ? "\r\n" : "\n";
    const heading = section[0].slice(0, section[0].length - section[2].length);
    const introduction = section[2].slice(0, questions[0].index);
    const replacement =
      `${heading}${introduction}`.replace(/\s*$/, `${newline}${newline}`) +
      `{{faqs}}${newline}${newline}`;
    const modularBody = `${body.slice(0, section.index)}${replacement}${body.slice(section.index + section[0].length)}`.replace(/(?:\r?\n)+$/, newline);
    let metadata = frontmatter[0];
    if (!data.faqs?.length) {
      const additions = stringify({
        faq_heading: section[1].trim(),
        faqs: references,
      }).replace(/\n/g, newline);
      const closing = metadata.lastIndexOf(`---${newline}`);
      metadata = `${metadata.slice(0, closing)}${additions}${metadata.slice(closing)}`;
    }
    snapshots.push({ file, markdown: source });
    manifest.pages.push({
      file,
      body_sha256: digest(originalAssetReferences(modularBody, mappings)),
      faqs: references,
    });
    writes.push({ file, source: `${metadata}${modularBody}` });
    modularized += 1;
  }
  if (modularized) {
    mkdirSync(absolute("preservation"), { recursive: true });
    mkdirSync(absolute("migration"), { recursive: true });
    const bytes = gzipSync(`${JSON.stringify(snapshots, null, 2)}\n`, {
      level: 9,
    });
    writeFileSync(absolute(snapshotFile), bytes);
    manifest.snapshot = {
      file: snapshotFile,
      sha256: digest(bytes),
      bytes: bytes.length,
    };
    writeFileSync(
      absolute(manifestFile),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    for (const write of writes)
      writeFileSync(
        absolute(write.file),
        write.source,
        write.create ? { flag: "wx" } : undefined,
      );
  }
  return { extracted, modularized };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  console.log(JSON.stringify(extractFaqs(), null, 2));
