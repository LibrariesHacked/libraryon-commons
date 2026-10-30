import { load } from "cheerio";
import sharp from "sharp";
import { parse } from "acorn";
import { allowed, origin } from "./scope.mjs";

export function serializedPageData(html) {
  const document = load(html);
  const records = [];
  const chunks = [];
  for (const script of document("script:not([src])").toArray()) {
    const node = document(script);
    const code = node.html() || "";
    if (node.attr("type")?.includes("json")) {
      try {
        records.push(JSON.parse(code));
      } catch {}
      continue;
    }
    if (!code.includes("__next_f")) continue;
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if (
        value.type === "CallExpression" &&
        value.callee?.property?.name === "push"
      ) {
        const elements = value.arguments[0]?.elements;
        if (
          elements?.[0]?.value === 1 &&
          typeof elements[1]?.value === "string"
        )
          chunks.push(elements[1].value);
      }
      for (const child of Object.values(value)) {
        if (Array.isArray(child)) child.forEach(visit);
        else if (child && typeof child === "object") visit(child);
      }
    };
    visit(parse(code, { ecmaVersion: "latest" }));
  }
  for (const line of chunks.join("").split("\n")) {
    const payload = line.slice(line.indexOf(":") + 1);
    if (!/^[\[{]/.test(payload)) continue;
    try {
      records.push(JSON.parse(payload));
    } catch {}
  }
  return records;
}

export function responsiveSources(source, srcset = "", base = origin) {
  const candidates = [
    { source, width: 0 },
    ...srcset.split(",").map((item) => {
      const [url, descriptor = ""] = item.trim().split(/\s+/);
      return {
        source: url,
        width: descriptor.endsWith("w") ? Number.parseInt(descriptor, 10) : 0,
      };
    }),
  ];
  const found = new Map();
  for (const candidate of candidates) {
    if (!candidate.source) continue;
    try {
      let url = new URL(candidate.source, base);
      if (url.pathname === "/_next/image" && url.searchParams.has("url"))
        url = new URL(url.searchParams.get("url"), url);
      url.hash = "";
      if (allowed(url.href))
        found.set(url.href, {
          url: url.href,
          width: candidate.width || found.get(url.href)?.width || 0,
        });
    } catch {}
  }
  return [...found.values()];
}

export function pageImages(html, base) {
  const document = load(html);
  const images = document("img")
    .toArray()
    .map((element) => {
      const image = document(element);
      const source = image.attr("src") || image.attr("data-src");
      const candidates = responsiveSources(
        source,
        image.attr("srcset") || image.attr("data-srcset"),
        base,
      );
      image
        .closest("picture")
        .find("source[srcset]")
        .each((index, item) => {
          candidates.push(
            ...responsiveSources(null, document(item).attr("srcset"), base),
          );
        });
      for (const value of [
        image.attr("data-original"),
        image.attr("data-full"),
        image.attr("data-fullsize"),
        image.closest("a").attr("href"),
      ]) {
        if (/\.(?:jpe?g|png|webp|avif|gif|tiff?)(?:[?#]|$)/i.test(value || ""))
          candidates.push(...responsiveSources(value, "", base));
      }
      return {
        source: source ? new URL(source, base).href : null,
        alt: image.attr("alt") || "",
        srcset: image.attr("srcset") || image.attr("data-srcset") || "",
        candidates: [
          ...new Map(
            candidates.map((candidate) => [candidate.url, candidate]),
          ).values(),
        ],
      };
    });
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (
      typeof value.url === "string" &&
      (value.formats || value.mime?.startsWith("image/"))
    ) {
      const variants = [value, ...Object.values(value.formats || {})].filter(
        (variant) => variant?.url,
      );
      const candidates = variants.flatMap((variant) =>
        responsiveSources(variant.url, "", base).map((candidate) => ({
          ...candidate,
          width: variant.width || 0,
        })),
      );
      if (candidates.length) {
        const urls = new Set(candidates.map((candidate) => candidate.url));
        const matches = images.filter((image) =>
          image.candidates.some((candidate) => urls.has(candidate.url)),
        );
        if (matches.length) {
          for (const image of matches)
            image.candidates = [
              ...new Map(
                [...image.candidates, ...candidates].map((candidate) => [
                  candidate.url,
                  candidate,
                ]),
              ).values(),
            ];
        } else
          images.push({
            source: candidates[0].url,
            alt: value.alternativeText || value.caption || value.name || "",
            srcset: "",
            candidates,
          });
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(serializedPageData(html));
  return images;
}

export async function largestAvailableImage(candidates, read) {
  const failures = [];
  const available = [];
  for (const candidate of candidates) {
    try {
      const result = await read(candidate.url);
      const metadata = await sharp(result.bytes, {
        animated: false,
      }).metadata();
      if (!metadata.width || !metadata.height)
        throw new Error("Image dimensions unavailable");
      available.push({
        ...result,
        url: candidate.url,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
      });
    } catch (error) {
      failures.push({ url: candidate.url, error: error.message });
    }
  }
  available.sort(
    (first, second) =>
      second.width * second.height - first.width * first.height ||
      second.bytes.length - first.bytes.length,
  );
  return {
    image: available[0] || null,
    failures,
    available: available.map(({ bytes, ...image }) => image),
  };
}
