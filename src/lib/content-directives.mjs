import { ArrowUpRight } from "lucide";

function element(tagName, className, children) {
  return {
    type: "paragraph",
    data: {
      hName: tagName,
      hProperties: className ? { className: [className] } : {},
    },
    children,
  };
}

const text = (value) => ({ type: "text", value });
const imageParagraph = (node) =>
  node.type === "paragraph" &&
  node.children.length === 1 &&
  node.children[0].type === "image";

export function contentDirectives() {
  return (tree, file) => {
    const visit = (node) => {
      for (const child of node.children || []) visit(child);
      if (
        !["containerDirective", "leafDirective", "textDirective"].includes(
          node.type,
        )
      )
        return;
      const attributes = node.attributes || {};
      const fail = (message) => file.fail(`${node.name}: ${message}`, node);
      const safeLink = (value) => {
        if (value?.startsWith("/") && !value.startsWith("//")) return value;
        try {
          if (["https:", "http:"].includes(new URL(value).protocol))
            return value;
        } catch {}
        fail("links must use HTTP(S) or a local path");
      };
      if (node.name !== "video" && node.type !== "containerDirective")
        fail("use a container block with opening and closing ::: markers");
      const block = (tagName, className) => {
        node.data = { hName: tagName, hProperties: { className: [className] } };
      };
      if (["testimonial", "quote"].includes(node.name)) {
        if (!attributes.author?.trim()) fail("an author is required");
        const images = node.children.filter(imageParagraph);
        const quotes = node.children.filter(
          (child) => child.type === "blockquote",
        );
        if (
          !quotes.length ||
          images.length > 1 ||
          node.children.length !== images.length + quotes.length
        )
          fail("include only a blockquote and, for a testimonial, one image");
        if (node.name === "testimonial" && images.length !== 1)
          fail("one image is required");
        if (node.name === "quote" && images.length)
          fail("use testimonial for a quote with an image");
        const attribution = [
          element("span", "quote-author", [text(attributes.author)]),
        ];
        if (attributes.role || attributes.organisation) {
          const role = attributes.role ? [text(attributes.role)] : [];
          if (attributes.organisation) {
            if (role.length) role.push(text(", "));
            role.push(
              attributes.url
                ? {
                    type: "link",
                    url: safeLink(attributes.url),
                    children: [text(attributes.organisation)],
                  }
                : text(attributes.organisation),
            );
          }
          attribution.push(element("span", "quote-role", role));
        }
        const body = [
          {
            type: "blockquote",
            children: quotes.flatMap((quote) => quote.children),
          },
          element("figcaption", "quote-attribution", attribution),
        ];
        block(
          "figure",
          node.name === "testimonial"
            ? "testimonial-card"
            : "testimonial-quote",
        );
        node.children = images.length
          ? [
              element("div", "testimonial-media", images[0].children),
              element("div", "testimonial-body", body),
            ]
          : body;
      } else if (node.name === "cards") {
        if (
          !node.children.length ||
          node.children.some(
            (child) =>
              child.type !== "containerDirective" || child.name !== "card",
          )
        )
          fail("include only card blocks");
        block("div", "imported-content-card-grid");
      } else if (node.name === "card") {
        const hasLink = (child) =>
          child.type === "link" ||
          child.type === "linkReference" ||
          (child.children || []).some(hasLink);
        if (attributes.href && node.children.some(hasLink))
          fail("whole-card links cannot contain other links");
        block(attributes.href ? "a" : "div", "imported-content-card");
        node.data.hProperties.className.push("content-card");
        if (attributes.href)
          node.data.hProperties.href = safeLink(attributes.href);
        const images = node.children
          .filter(imageParagraph)
          .flatMap((child) => child.children);
        const body = node.children.filter((child) => !imageParagraph(child));
        for (const heading of body.filter(
          (child) => child.type === "heading",
        )) {
          heading.data = {
            ...(heading.data || {}),
            hProperties: {
              ...(heading.data?.hProperties || {}),
              className: ["content-card-heading"],
            },
          };
          if (attributes.href) {
            const arrow = element("svg", "content-card-arrow", []);
            arrow.data.hProperties = {
              className: ["content-card-arrow"],
              width: 20,
              height: 20,
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              ariaHidden: "true",
            };
            arrow.data.hChildren = ArrowUpRight.map(
              ([tagName, properties]) => ({
                type: "element",
                tagName,
                properties,
                children: [],
              }),
            );
            heading.children = [element("span", "", heading.children), arrow];
          }
        }
        node.children = [...images, element("div", "content-card-body", body)];
      } else if (node.name === "list-panel") {
        const lists = node.children.filter((child) => child.type === "list");
        if (lists.length !== 1) fail("include exactly one list");
        block("section", "library-can-do-panel");
        lists[0].data = { hProperties: { className: ["library-can-do-list"] } };
      } else if (node.name === "video") {
        if (node.type !== "leafDirective" || node.children.length)
          fail("use ::video with src and title attributes on one line");
        const url = new URL(safeLink(attributes.src), "https://local.invalid");
        if (
          ![
            "www.youtube.com",
            "youtube.com",
            "www.youtube-nocookie.com",
            "youtube-nocookie.com",
          ].includes(url.hostname) ||
          !url.pathname.startsWith("/embed/")
        )
          fail("use a YouTube embed URL");
        const watch = new URL("https://www.youtube.com/watch");
        watch.searchParams.set(
          "v",
          url.pathname.slice("/embed/".length).split("/")[0],
        );
        if (url.searchParams.has("start"))
          watch.searchParams.set("t", `${url.searchParams.get("start")}s`);
        block("figure", "video-embed");
        node.data.hChildren = [
          {
            type: "element",
            tagName: "div",
            properties: { className: ["video-embed-player"] },
            children: [
              {
                type: "element",
                tagName: "iframe",
                properties: {
                  src: attributes.src,
                  title: attributes.title || "Embedded YouTube video",
                  loading: "lazy",
                  referrerPolicy: "strict-origin-when-cross-origin",
                  allowFullScreen: true,
                  allow:
                    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
                },
                children: [],
              },
            ],
          },
          {
            type: "element",
            tagName: "figcaption",
            properties: {},
            children: [
              {
                type: "element",
                tagName: "a",
                properties: {
                  href: watch.href,
                  target: "_blank",
                  rel: ["noopener", "noreferrer"],
                },
                children: [{ type: "text", value: "Watch on YouTube" }],
              },
            ],
          },
        ];
      } else fail("unknown content block");
    };
    visit(tree);
  };
}
