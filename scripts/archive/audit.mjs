import {
  readFile,
  readdir,
  mkdir,
  writeFile,
  appendFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { load } from "cheerio";
import { parse } from "yaml";
import sharp from "sharp";
import {
  allowed,
  digest,
  editorialURL,
  objectPath,
  origin,
  references,
  collectionRequestURL,
  paginationComplete,
} from "./collect.mjs";
import {
  pageImages,
  responsiveSources,
  largestAvailableImage,
  serializedPageData,
} from "./media.mjs";
import {
  uniqueFilename,
  sourceFilename,
  isDescriptiveImageLabel,
  reviewedImageDescriptions,
} from "../migrate-filenames.mjs";
import { createDirectory } from "../../src/lib/directory-model.mjs";

const mediaExtension =
  /\.(?:jpe?g|png|gif|webp|avif|svg|tiff?|pdf|docx?|pptx?|xlsx?|zip|mp[34])(?:[?#]|$)/i;
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const normalURL = (value) => {
  const url = new URL(value, origin);
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
};

export async function auditArchive({
  root = process.cwd(),
  repair = false,
} = {}) {
  const absolute = (file) => path.join(root, file);
  const json = async (file) =>
    JSON.parse(await readFile(absolute(file), "utf8"));
  const bundle = async (file) =>
    JSON.parse(gunzipSync(await readFile(absolute(file))));
  const report = await json("migration/import-report.json");
  const reviewed = reviewedImageDescriptions(root);
  const state = await json("migration/import-state.json");
  const captured = await bundle("preservation/content.json.gz");
  const data = await bundle("preservation/data.json.gz");
  const entries = new Map(
    (await readFile(absolute("archive/manifest.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => {
        const entry = JSON.parse(line);
        return [entry.url, entry];
      }),
  );
  const findings = {
    capturedAt: new Date().toISOString(),
    scope:
      "Public first-party pages, sitemap routes, public datasets, media and page dependencies",
    pages: [],
    datasets: [],
    assets: [],
    images: [],
    limitations: [
      "Sitemaps and public links cannot prove coverage of unlinked CMS content or unreferenced uploads.",
      "Directory data is audited against source records and sitemap routes; every generated detail page is not separately rendered.",
      "Third-party videos, presentations, event images, maps and private CMS content are not mirrored.",
      "Unavailable variants are reported; the largest successfully decoded candidate is retained without upscaling.",
    ],
  };
  const supplements = [];
  const capture = async (url, result) => {
    if (!repair) return;
    const sha256 = digest(result.bytes);
    const previous = entries.get(url);
    if (previous?.sha256 === sha256) return;
    const file = `${objectPath(url)}-${sha256.slice(0, 12)}`;
    await mkdir(absolute("archive/objects"), { recursive: true });
    await writeFile(absolute(`archive/${file}`), result.bytes);
    const entry = {
      url,
      capturedAt: findings.capturedAt,
      status: result.status,
      contentType: result.type,
      headers: {},
      file,
      bytes: result.bytes.length,
      sha256,
    };
    await appendFile(
      absolute("archive/manifest.jsonl"),
      `${JSON.stringify(entry)}\n`,
    );
    entries.set(url, entry);
  };
  const read = async (url, fresh = false, redirects = 0) => {
    if (!allowed(url, true))
      throw new Error(`Outside first-party scope: ${url}`);
    if (redirects > 10) throw new Error(`Redirect limit: ${url}`);
    const entry = entries.get(url);
    if (!fresh && entry?.status === 200) {
      const bytes = await readFile(absolute(`archive/${entry.file}`));
      if (digest(bytes) !== entry.sha256)
        throw new Error(`Raw checksum mismatch: ${url}`);
      return {
        bytes,
        status: 200,
        type: entry.contentType,
        resolved: url,
        cached: true,
      };
    }
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    const result = {
      bytes: Buffer.from(await response.arrayBuffer()),
      status: response.status,
      type: response.headers.get("content-type") || "",
      resolved: url,
      cached: false,
    };
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get("location")
    )
      return read(
        new URL(response.headers.get("location"), url).href,
        fresh,
        redirects + 1,
      );
    await capture(url, result);
    return result;
  };
  const safelyRead = async (url, fresh = false) => {
    try {
      return await read(url, fresh);
    } catch (error) {
      return {
        bytes: Buffer.alloc(0),
        status: 0,
        type: "",
        error: error.message,
        resolved: url,
      };
    }
  };
  const saveBundle = async (name, value) => {
    if (!repair) {
      try {
        const file = `preservation/${name}.json.gz`;
        const bytes = await readFile(absolute(file));
        supplements.push({ file, sha256: digest(bytes), bytes: bytes.length });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      return;
    }
    const bytes = gzipSync(jsonText(value), { level: 9 });
    const file = `preservation/${name}.json.gz`;
    await writeFile(absolute(file), bytes);
    supplements.push({ file, sha256: digest(bytes), bytes: bytes.length });
  };
  const robots = await read(`${origin}/robots.txt`, true);
  if (
    robots.status !== 200 ||
    !robots.bytes.toString().includes("Disallow: /cms/")
  )
    throw new Error("Review robots policy before continuing");
  const sitemap = await read(`${origin}/sitemap.xml`, true);
  if (sitemap.status !== 200)
    throw new Error(`Sitemap unavailable: ${sitemap.status}`);
  const xml = load(sitemap.bytes.toString(), { xml: true });
  const sitemapURLs = xml("url > loc")
    .map((index, element) => xml(element).text().trim())
    .get();
  const pendingPages = new Set([
    `${origin}/`,
    ...sitemapURLs.map((url) => editorialURL(url)).filter(Boolean),
    ...captured
      .map((page) => page.canonical)
      .filter((url) => editorialURL(url)),
  ]);
  const originalPages = new Set(
    captured.map((page) => normalURL(page.canonical)),
  );
  const pageEvidence = [];
  const imageRecords = [];
  const embeddedData = [];
  const assetLabels = new Map();
  const wantedAssets = new Set();
  const addPageMedia = (html, url) => {
    embeddedData.push(...serializedPageData(html));
    const document = load(html);
    const label =
      document("title")
        .first()
        .text()
        .replace(/\s*\|.*$/, "") || new URL(url).pathname;
    imageRecords.push(
      ...pageImages(html, url)
        .filter((image) => image.candidates.length)
        .map((image) => ({ ...image, page: url })),
    );
    for (const asset of references(html, url, "text/html")) {
      wantedAssets.add(asset);
      if (!assetLabels.has(asset))
        assetLabels.set(asset, `${label} supporting image`);
    }
  };
  for (const page of captured) {
    addPageMedia(page.html, page.canonical);
    for (const image of page.images || [])
      imageRecords.push({
        source: image.url,
        alt: image.alt,
        page: page.canonical,
        candidates: responsiveSources(image.url, image.srcset, page.canonical),
      });
  }
  for (const entry of [...entries.values()].filter(
    (entry) =>
      entry.status === 200 &&
      entry.contentType.includes("text/html") &&
      editorialURL(entry.url) &&
      !new URL(entry.url).search,
  )) {
    addPageMedia((await read(entry.url)).bytes.toString(), entry.url);
  }
  const visited = new Set();
  for (const url of pendingPages) {
    const canonical = normalURL(url);
    if (visited.has(canonical)) continue;
    if (visited.size >= 250)
      throw new Error("Editorial crawl exceeded 250 pages; review scope");
    visited.add(canonical);
    const response = await safelyRead(url, true);
    const html = response.bytes.toString();
    const local = originalPages.has(canonical);
    findings.pages.push({
      url,
      status: response.status,
      resolved: response.resolved,
      inOriginalBundle: local,
      error: response.error,
    });
    if (response.status !== 200 || !response.type.includes("html")) continue;
    pageEvidence.push({ url, resolved: response.resolved, html });
    addPageMedia(html, response.resolved);
    const document = load(html);
    for (const link of document("a[href]").toArray()) {
      const target = editorialURL(
        document(link).attr("href"),
        response.resolved,
      );
      if (target) pendingPages.add(target);
    }
    console.log(
      `Page ${visited.size}: ${response.status} ${url}${local ? "" : " (new evidence)"}`,
    );
  }
  const freshData = {};
  for (const endpoint of [
    "libraries",
    "authorities",
    "events",
    "event-tags",
    "mobile-libraries",
    "alerts",
  ]) {
    const records = [];
    let pagination;
    let status = 200;
    let error;
    for (let page = 1; page <= 200; page += 1) {
      const response = await safelyRead(
        collectionRequestURL(endpoint, page).href,
        true,
      );
      status = response.status;
      if (status !== 200) {
        error = response.error;
        break;
      }
      let payload;
      try {
        payload = JSON.parse(response.bytes);
      } catch {
        status = 0;
        error = "Non-JSON API response";
        break;
      }
      if (!Array.isArray(payload.data)) {
        error = "No public data array";
        break;
      }
      records.push(...payload.data);
      if (pagination && payload.meta?.pagination?.total !== pagination.total) {
        error = "API total changed during capture";
        break;
      }
      pagination = payload.meta?.pagination;
      if (!pagination || page >= pagination.pageCount) break;
    }
    const complete =
      status === 200 &&
      !error &&
      Boolean(pagination) &&
      paginationComplete(records, pagination);
    freshData[`${endpoint}.json`] = { data: records, pagination, complete };
    const previous = data[`${endpoint}.json`];
    const previousIDs = new Set(
      (previous?.data || []).map((record) => record.id),
    );
    const currentIDs = new Set(records.map((record) => record.id));
    findings.datasets.push({
      endpoint,
      status,
      complete,
      expected: pagination?.total,
      captured: records.length,
      originalCaptured: previous?.data?.length,
      addedIDs: records
        .filter((record) => !previousIDs.has(record.id))
        .map((record) => record.id),
      absentIDs: complete
        ? [...previousIDs].filter((id) => !currentIDs.has(id))
        : [],
      error,
    });
    console.log(
      `Dataset ${endpoint}: ${records.length}/${pagination?.total ?? "?"} complete=${complete} status=${status}`,
    );
  }
  const scanData = (value) => {
    if (typeof value === "string") {
      for (const asset of references(value, origin, "application/json"))
        wantedAssets.add(asset);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (
      typeof value.url === "string" &&
      (value.formats || value.mime?.startsWith("image/"))
    ) {
      const variants = [value, ...Object.values(value.formats || {})].filter(
        (item) => item?.url,
      );
      const candidates = variants.flatMap((item) =>
        responsiveSources(item.url, "", origin).map((candidate) => ({
          ...candidate,
          width: item.width || 0,
        })),
      );
      if (candidates.length)
        imageRecords.push({
          source: candidates[0].url,
          alt: value.alternativeText || value.caption || value.name || "",
          page: "public CMS media metadata",
          candidates,
        });
    }
    for (const child of Object.values(value)) scanData(child);
  };
  scanData(data);
  scanData(freshData);
  scanData(embeddedData);
  const records = async (folder) =>
    Promise.all(
      (await readdir(absolute(folder)))
        .filter((file) => file.endsWith(".json"))
        .map((file) => json(`${folder}/${file}`)),
    );
  const directory = createDirectory(
    await records("src/content/authorities"),
    await records("src/content/libraries"),
  );
  const localRoutes = new Set([
    ...directory.authorities.map((authority) =>
      normalURL(`${origin}/libraries/${authority.slug}`),
    ),
    ...directory.libraries.map((library) =>
      normalURL(`${origin}${directory.libraryPath(library)}`),
    ),
  ]);
  const directoryURLs = sitemapURLs.filter((url) =>
    new URL(url).pathname.startsWith("/libraries/"),
  );
  const pages = await Promise.all(
    (await readdir(absolute("src/content/pages")))
      .filter((file) => file.endsWith(".md"))
      .map(async (file) => {
        const source = await readFile(
          absolute(`src/content/pages/${file}`),
          "utf8",
        );
        return parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(source)[1]);
      }),
  );
  const pageURLs = new Set(
    pages.flatMap((page) => [
      normalURL(`${origin}${page.path}`),
      ...(page.source_url ? [normalURL(page.source_url)] : []),
    ]),
  );
  findings.sitemap = {
    total: sitemapURLs.length,
    directoryPages: directoryURLs.length,
    missingDirectoryRoutes: directoryURLs.filter(
      (url) => !localRoutes.has(normalURL(url)),
    ),
    missingEditorialEntries: findings.pages
      .filter(
        (page) =>
          page.status === 200 &&
          !pageURLs.has(normalURL(page.url)) &&
          !pageURLs.has(normalURL(page.resolved)),
      )
      .map((page) => page.url),
  };
  findings.sitemap.directoryRouteIssues = [];
  for (const url of findings.sitemap.missingDirectoryRoutes) {
    const response = await safelyRead(url, true);
    findings.sitemap.directoryRouteIssues.push({
      url,
      status: response.status,
    });
  }
  findings.sitemap.sourceRecordsWithoutSlugs = data["libraries.json"].data
    .filter((record) => !record.attributes.slug)
    .map((record) => ({ id: record.id, name: record.attributes.name }));
  const parents = new Map();
  const find = (url) => {
    if (!parents.has(url)) parents.set(url, url);
    if (parents.get(url) !== url) parents.set(url, find(parents.get(url)));
    return parents.get(url);
  };
  for (const image of imageRecords) {
    if (!image.candidates.length) continue;
    const parent = find(image.candidates[0].url);
    for (const candidate of image.candidates)
      parents.set(find(candidate.url), parent);
  }
  const groups = new Map();
  for (const image of imageRecords) {
    if (!image.candidates.length) continue;
    const key = find(image.candidates[0].url);
    if (!groups.has(key))
      groups.set(key, {
        candidates: new Map(),
        pages: new Set(),
        alt: image.alt,
      });
    const group = groups.get(key);
    group.pages.add(image.page);
    if (
      !isDescriptiveImageLabel(group.alt) &&
      isDescriptiveImageLabel(image.alt)
    )
      group.alt = image.alt;
    for (const candidate of image.candidates)
      group.candidates.set(candidate.url, candidate);
  }
  const folder = "public/uploads/archive";
  const usedNames = new Set(
    (await readdir(absolute(folder))).map((file) => file.toLowerCase()),
  );
  const byChecksum = new Map(
    report.assets.map((asset) => [asset.sha256, asset]),
  );
  const masters = {
    version: 1,
    capturedAt: findings.capturedAt,
    aliases: {},
    sources: {},
  };
  const newAssets = [];
  let newPreservedBytes = 0;
  const preserve = async (url, bytes, label, extension, resolved = url) => {
    const sha256 = digest(bytes);
    let asset = byChecksum.get(sha256);
    if (!asset && repair) {
      const file = `${folder}/${uniqueFilename(label, extension, usedNames)}`;
      await writeFile(absolute(file), bytes, { flag: "wx" });
      asset = {
        source: url,
        resolved,
        file,
        url: file.slice("public".length),
        sha256,
      };
      report.assets.push(asset);
      newAssets.push(asset);
      newPreservedBytes += bytes.length;
      byChecksum.set(sha256, asset);
      state.files[file] = sha256;
    }
    return asset;
  };
  for (const group of groups.values()) {
    const candidates = [...group.candidates.values()];
    const selected = await largestAvailableImage(candidates, async (url) => {
      const result = await read(url);
      if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
      return result;
    });
    const image = selected.image;
    const aliases = report.assets.filter((asset) =>
      candidates.some(
        (candidate) =>
          candidate.url === asset.source || candidate.url === asset.resolved,
      ),
    );
    const previous = [];
    for (const asset of aliases) {
      try {
        const info = await sharp(
          await readFile(absolute(asset.file)),
        ).metadata();
        previous.push({
          url: asset.url,
          width: info.width,
          height: info.height,
        });
      } catch (error) {
        previous.push({ url: asset.url, error: error.message });
      }
    }
    let master;
    if (image) {
      const context = [...group.pages].find((page) =>
        page.startsWith("https://"),
      );
      const label = `${[reviewed.get(digest(image.bytes))?.description, group.alt, sourceFilename(image.url), context ? `${new URL(context).pathname.split("/").filter(Boolean).join(" ")} image` : ""].find(isDescriptiveImageLabel) || ""} original`;
      const extension = image.format === "jpeg" ? ".jpg" : `.${image.format}`;
      const asset = await preserve(
        image.url,
        image.bytes,
        label,
        extension,
        image.resolved,
      );
      if (asset) {
        master = {
          url: asset.url,
          file: asset.file,
          source: image.url,
          sha256: asset.sha256,
          width: image.width,
          height: image.height,
        };
        for (const alias of aliases) masters.aliases[alias.url] = master;
        for (const candidate of candidates)
          masters.sources[candidate.url] = master;
      }
    }
    findings.images.push({
      alt: group.alt,
      pages: [...group.pages],
      candidates: selected.available,
      failures: selected.failures,
      previous,
      master,
      bestAvailable: image
        ? { source: image.url, width: image.width, height: image.height }
        : null,
      upgraded: previous.some(
        (item) => item.width * item.height < image?.width * image?.height,
      ),
    });
    console.log(
      `Image ${findings.images.length}/${groups.size}: ${image ? `${image.width}x${image.height}` : "UNAVAILABLE"} ${group.alt?.slice(0, 70)}`,
    );
  }
  const handled = new Set();
  const templates = [];
  for (const url of wantedAssets) {
    if (handled.has(url)) continue;
    if (handled.size >= 5000)
      throw new Error("Asset audit exceeded 5000 URLs; review scope");
    handled.add(url);
    const response = await safelyRead(url);
    const assetFinding = {
      url,
      status: response.status,
      cached: response.cached || false,
      error: response.error,
    };
    if (
      response.status !== 200 &&
      url.startsWith(`${origin}/lon1.digitaloceanspaces.com/libraryon/`)
    ) {
      const recoveredURL = `https://${new URL(url).pathname.slice(1)}`;
      const recovered = await safelyRead(recoveredURL);
      assetFinding.recovery = { url: recoveredURL, status: recovered.status };
    }
    findings.assets.push(assetFinding);
    if (response.status !== 200) continue;
    if (
      /css|javascript|^font\//.test(response.type) ||
      /\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(url)
    )
      templates.push({
        url,
        type: response.type,
        sha256: digest(response.bytes),
        encoding: "base64",
        body: response.bytes.toString("base64"),
      });
    if (/css|javascript/.test(response.type))
      for (const asset of references(
        response.bytes.toString(),
        response.resolved,
        response.type,
      ))
        wantedAssets.add(asset);
    if (response.type.startsWith("image/") && !masters.sources[url]) {
      const description = reviewed.get(digest(response.bytes));
      const label =
        [
          description?.description,
          sourceFilename(url),
          assetLabels.get(url),
        ].find(isDescriptiveImageLabel) || "";
      const metadata = await sharp(response.bytes).metadata();
      const extension =
        description?.extension ||
        (metadata.format === "jpeg" ? ".jpg" : `.${metadata.format}`);
      const asset = await preserve(
        url,
        response.bytes,
        label,
        extension,
        response.resolved,
      );
      if (asset) {
        try {
          const metadata = await sharp(response.bytes).metadata();
          if (metadata.width && metadata.height) {
            const master = {
              url: asset.url,
              file: asset.file,
              source: url,
              sha256: asset.sha256,
              width: metadata.width,
              height: metadata.height,
            };
            masters.sources[url] = master;
            masters.aliases[asset.url] = master;
          }
        } catch (error) {
          assetFinding.dimensionError = error.message;
        }
      }
    } else if (mediaExtension.test(url) && !response.type.startsWith("image/"))
      await preserve(
        url,
        response.bytes,
        sourceFilename(url) || "libraryon-download",
        path.extname(new URL(url).pathname),
        response.resolved,
      );
  }
  await saveBundle("audit-pages", pageEvidence);
  await saveBundle("audit-data", freshData);
  await saveBundle("audit-templates", templates);
  findings.supplements = supplements;
  findings.summary = {
    successfulPages: findings.pages.filter((page) => page.status === 200)
      .length,
    unavailablePages: findings.pages.filter((page) => page.status !== 200)
      .length,
    previouslyUnbundledPages: findings.pages.filter(
      (page) => page.status === 200 && !page.inOriginalBundle,
    ).length,
    imageGroups: findings.images.length,
    upgradedImageGroups: findings.images.filter((image) => image.upgraded)
      .length,
    unavailableImageGroups: findings.images.filter(
      (image) => !image.bestAvailable,
    ).length,
    imageVariantFailures: findings.images.reduce(
      (count, image) => count + image.failures.length,
      0,
    ),
    newPreservedFiles: newAssets.length,
    newPreservedBytes,
    failedAssets: findings.assets.filter((asset) => asset.status !== 200)
      .length,
    unrecoveredAssets: findings.assets.filter(
      (asset) => asset.status !== 200 && asset.recovery?.status !== 200,
    ).length,
    masterFiles: new Set(
      Object.values(masters.sources).map((master) => master.file),
    ).size,
    completePublicDatasets: findings.datasets.filter(
      (dataset) => dataset.complete,
    ).length,
  };
  if (repair) {
    await writeFile(absolute("migration/import-report.json"), jsonText(report));
    await writeFile(absolute("migration/import-state.json"), jsonText(state));
    await writeFile(absolute("src/data/media-masters.json"), jsonText(masters));
  }
  await writeFile(
    absolute("migration/coverage-audit.json"),
    jsonText(findings),
  );
  return findings;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const findings = await auditArchive({
    repair: process.argv.includes("--repair"),
  });
  console.log(JSON.stringify(findings.summary, null, 2));
}
