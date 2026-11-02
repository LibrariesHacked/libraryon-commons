import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "cheerio";
import { digest } from "./collect.mjs";
import {
  uniqueFilename,
  reviewedImageDescriptions,
} from "../migrate-filenames.mjs";
import { pageImages, largestAvailableImage } from "./media.mjs";

export function originalHomeCarousel(
  html,
  sourceURL = "https://libraryon.org/",
) {
  const document = load(html);
  const seen = new Set();
  return document('#banner-home [aria-roledescription="slide"] img')
    .toArray()
    .map((image) => {
      const source = document(image).attr("src");
      if (!source)
        throw new Error("Original carousel image is missing its source");
      return {
        source: new URL(source, sourceURL).href,
        alt: document(image).attr("alt")?.trim(),
      };
    })
    .filter((image) => {
      if (!image.alt || !image.source.startsWith("https://"))
        throw new Error(
          "Original carousel image is missing its description or HTTPS source",
        );
      if (seen.has(image.source)) return false;
      seen.add(image.source);
      return true;
    });
}

export async function importHomeCarousel({
  root = process.cwd(),
  fetcher = fetch,
} = {}) {
  const sourceURL = "https://libraryon.org/";
  const response = await fetcher(sourceURL);
  if (!response.ok)
    throw new Error(`Homepage fetch failed: ${response.status}`);
  const html = await response.text();
  const slides = originalHomeCarousel(html, sourceURL);
  const images = pageImages(html, sourceURL);
  if (slides.length < 2)
    throw new Error("Original homepage carousel was not found");
  const downloads = await Promise.all(
    slides.map(async (slide) => {
      const candidates =
        images.find((image) => image.source === slide.source)?.candidates || [];
      const selected = await largestAvailableImage(candidates, async (url) => {
        const image = await fetcher(url);
        if (
          !image.ok ||
          !image.headers.get("content-type")?.startsWith("image/")
        )
          throw new Error(`Image fetch failed: ${url} (${image.status})`);
        return { bytes: Buffer.from(await image.arrayBuffer()) };
      });
      if (!selected.image)
        throw new Error(`No original image available: ${slide.source}`);
      return {
        ...slide,
        source: selected.image.url,
        bytes: selected.image.bytes,
        sha256: digest(selected.image.bytes),
      };
    }),
  );
  const folder = path.join(root, "public/uploads/archive");
  await mkdir(folder, { recursive: true });
  const usedNames = new Set(
    (await readdir(folder)).map((file) => file.toLowerCase()),
  );
  const reportFile = path.join(root, "migration/import-report.json");
  const stateFile = path.join(root, "migration/import-state.json");
  const homepageFile = path.join(root, "src/data/homepage.json");
  const report = JSON.parse(await readFile(reportFile, "utf8"));
  const reviewed = reviewedImageDescriptions(root);
  const state = JSON.parse(await readFile(stateFile, "utf8"));
  const homepage = JSON.parse(await readFile(homepageFile, "utf8"));
  const carousel = [];
  for (const slide of downloads) {
    const existing = report.assets.find(
      (asset) => asset.sha256 === slide.sha256,
    );
    const file =
      existing?.file ||
      `public/uploads/archive/${uniqueFilename(reviewed.get(slide.sha256)?.description || slide.alt, path.extname(new URL(slide.source).pathname), usedNames)}`;
    const target = path.join(root, file);
    if (existing) {
      if (digest(await readFile(target)) !== slide.sha256)
        throw new Error(`Local media has changed: ${file}`);
    } else {
      await writeFile(target, slide.bytes, { flag: "wx" });
      state.files[file] = slide.sha256;
    }
    const url = file.slice("public".length);
    if (
      !report.assets.some(
        (asset) =>
          asset.source === slide.source && asset.sha256 === slide.sha256,
      )
    )
      report.assets.push({
        source: slide.source,
        resolved: slide.source,
        file,
        url,
        sha256: slide.sha256,
      });
    carousel.push({ image: url, alt: slide.alt });
  }
  homepage.carousel = carousel;
  for (const [file, value] of [
    [homepageFile, homepage],
    [reportFile, report],
    [stateFile, state],
  ])
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return carousel;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  console.log(JSON.stringify(await importHomeCarousel(), null, 2));
}
