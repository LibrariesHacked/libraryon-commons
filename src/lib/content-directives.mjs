import { ArrowUpRight } from "lucide";

function element(tagName, className, children, properties = {}) {
  return {
    type: "paragraph",
    data: {
      hName: tagName,
      hProperties: {
        ...properties,
        ...(className ? { className: [className] } : {}),
      },
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
    const textParagraph = (node) =>
      node?.type === "paragraph" &&
      !(node.children || []).some((child) => child.type === "image");
    const groupFloatedImages = (node) => {
      const children = node.children || [];
      children.forEach(groupFloatedImages);
      if (!children.length) return;

      const grouped = [];
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        const layout =
          child.type === "containerDirective" &&
          child.name === "collection-image"
            ? child.attributes?.layout
            : null;
        if (!new Set(["float-left", "float-right"]).has(layout)) {
          grouped.push(child);
          continue;
        }

        const preceding = [];
        while (textParagraph(grouped.at(-1))) preceding.unshift(grouped.pop());
        const following = [];
        let nextIndex = index + 1;
        if (!preceding.length) {
          while (textParagraph(children[nextIndex]))
            following.push(children[nextIndex++]);
        }
        const copy = preceding.length ? preceding : following;
        if (!copy.length) {
          grouped.push(child);
          continue;
        }

        const start = preceding.length
          ? copy[0].position.start
          : child.position.start;
        const end = preceding.length
          ? child.position.end
          : copy.at(-1).position.end;
        const content = {
          type: "containerDirective",
          name: "collection-image-copy",
          attributes: {},
          children: copy,
          position: { start: copy[0].position.start, end: copy.at(-1).position.end },
        };
        grouped.push({
          type: "containerDirective",
          name: "collection-image-row",
          attributes: { layout },
          children: preceding.length ? [content, child] : [child, content],
          position: { start, end },
        });
        if (!preceding.length) index = nextIndex - 1;
      }
      node.children = grouped;
    };

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
      if (
        ["slide", "hotspot", "accordion-item", "recommendation-item"].includes(
          node.name,
        )
      ) {
        return;
      } else if (node.name === "collection-image-row") {
        node.data = {
          hName: "div",
          hProperties: {
            className: [
              "collection-image-row",
              `collection-image-row--${node.attributes.layout}`,
            ],
          },
        };
      } else if (node.name === "collection-image-copy") {
        node.data = {
          hName: "div",
          hProperties: { className: ["collection-image-copy"] },
        };
      } else if (node.name === "collection-image") {
        const layout = attributes.layout || "standard";
        const image = node.children.filter(imageParagraph);
        if (image.length !== 1) fail("include exactly one image");
        if (
          !["standard", "inset", "full", "float-left", "float-right"].includes(
            layout,
          )
        )
          fail("layout must be standard, inset, full, float-left or float-right");
        const caption = node.children.filter((child) => child !== image[0]);
        if (caption[0]) {
          caption[0].data = {
            ...(caption[0].data || {}),
            hName: "figcaption",
          };
        }
        node.data = {
          hName: "figure",
          hProperties: {
            className: ["collection-image", `collection-image--${layout}`],
          },
        };
        node.children = [
          ...image,
          ...caption,
          ...(attributes.zoom === "true"
            ? [
                element(
                  "button",
                  "collection-image-zoom",
                  [text("View")],
                  {
                    type: "button",
                    ariaLabel: "Zoom in on image",
                    dataCollectionZoom: "",
                  },
                ),
              ]
            : []),
        ];
      } else if (node.name === "collection-aside") {
        const layout = attributes.layout || "block";
        const title = attributes.title?.trim();
        if (!title) fail("include a title");
        if (!["block", "float-left", "float-right"].includes(layout))
          fail("layout must be block, float-left or float-right");
        node.data = {
          hName: "aside",
          hProperties: {
            className: ["collection-aside", `collection-aside--${layout}`],
            ariaLabel: title,
          },
        };
        node.children = [
          element("h3", "collection-aside-title", [text(title)]),
          ...node.children,
        ];
      } else if (node.name === "collection-recommendations") {
        const title = attributes.title?.trim();
        const items = node.children.filter(
          (child) =>
            child.type === "containerDirective" &&
            child.name === "recommendation-item",
        );
        if (!title) fail("include a section title");
        if (!items.length || items.length !== node.children.length)
          fail("include one or more recommendation-item blocks and no other content");

        const covers = [];
        const recommendationItems = [];
        items.forEach((item, index) => {
          const bookTitle = item.attributes.title?.trim();
          const images = item.children.filter(imageParagraph);
          if (!bookTitle) fail("each recommendation needs a title");
          if (images.length !== 1) fail("each recommendation needs one cover image");
          const identifier = `${node.position.start.line}-${index}`;
          const meta = [item.attributes.author, item.attributes.year]
            .filter(Boolean)
            .join(" · ");
          covers.push(
            element(
              "figure",
              "collection-recommendation-cover",
              [images[0]],
              {
                dataRecommendationCover: String(index),
                ...(index ? { hidden: true } : {}),
              },
            ),
          );
          recommendationItems.push(
            element("li", "collection-recommendation-item", [
              element(
                "button",
                "collection-recommendation-select",
                [
                  element("span", "collection-recommendation-title", [
                    text(bookTitle),
                  ]),
                  ...(meta
                    ? [
                        element("span", "collection-recommendation-meta", [
                          text(meta),
                        ]),
                      ]
                    : []),
                ],
                {
                  type: "button",
                  ariaPressed: index === 0 ? "true" : "false",
                  ariaExpanded: index === 0 ? "true" : "false",
                  ariaControls: `collection-book-cover-${identifier} collection-book-description-${identifier}`,
                  dataRecommendationSelect: String(index),
                },
              ),
              element(
                "div",
                "collection-recommendation-description",
                item.children.filter((child) => child !== images[0]),
                {
                  id: `collection-book-description-${identifier}`,
                  dataRecommendationDescription: String(index),
                  ...(index ? { hidden: true } : {}),
                },
              ),
            ]),
          );
          covers.at(-1).data.hProperties.id = `collection-book-cover-${identifier}`;
        });
        node.data = {
          hName: "section",
          hProperties: {
            className: ["collection-recommendations"],
            role: "region",
            ariaLabel: title,
            dataCollectionRecommendations: "",
          },
        };
        node.children = [
          element("h2", "collection-recommendations-heading", [text(title)]),
          element("div", "collection-recommendations-layout", [
            element("div", "collection-recommendations-media", covers),
            element("div", "collection-recommendations-copy", [
              element("ul", "collection-recommendations-list", recommendationItems),
            ]),
          ]),
        ];
      } else if (node.name === "collection-carousel") {
        const kind = attributes.kind;
        const introAside = node.children.find(
          (child) =>
            child.type === "containerDirective" &&
            child.name === "collection-aside",
        );
        const slides = node.children.filter(
          (child) =>
            child.type === "containerDirective" && child.name === "slide",
        );
        if (
          !slides.length ||
          slides.length + Number(Boolean(introAside)) !== node.children.length ||
          (introAside && kind !== "hotspots")
        )
          fail("include slides and, for hotspot galleries, at most one collection aside");
        if (!["images", "quotes", "hotspots"].includes(kind))
          fail("kind must be images, quotes or hotspots");
        slides.forEach((slide, index) => {
          const properties = {
            role: "group",
            ariaLabel: `Slide ${index + 1} of ${slides.length}`,
            ariaRoledescription: "slide",
            dataCarouselSlide: "",
          };
          if (kind === "images") {
            const images = slide.children.filter(imageParagraph);
            if (images.length !== 1) fail("each image slide needs one image");
            slide.data = {
              hName: "figure",
              hProperties: {
                ...properties,
                className: ["collection-carousel-slide", "collection-carousel-slide--image"],
              },
            };
            if (slide.attributes.zoom === "true")
              slide.children.push(
                element(
                  "button",
                  "collection-image-zoom",
                  [text("View")],
                  {
                    type: "button",
                    ariaLabel: "Zoom in on image",
                    dataCollectionZoom: "",
                  },
                ),
              );
          } else if (kind === "quotes") {
            const attributedQuotes = slide.children.filter(
              (child) =>
                child.type === "containerDirective" && child.name === "quote",
            );
            if (attributedQuotes.length) {
              if (attributedQuotes.length !== 1 || slide.children.length !== 1)
                fail("include exactly one attributed quote per slide");
              slide.children = attributedQuotes;
            } else if (
              !slide.children.some((child) => child.type === "blockquote")
            ) {
              fail("each quote slide needs a blockquote");
            }
            slide.data = {
              hName: "div",
              hProperties: {
                ...properties,
                className: ["collection-carousel-slide", "collection-carousel-slide--quote"],
              },
            };
          } else {
            const images = slide.children.filter(imageParagraph);
            const hotspots = slide.children.filter(
              (child) =>
                child.type === "containerDirective" && child.name === "hotspot",
            );
            if (images.length !== 1 || !hotspots.length)
              fail("each hotspot slide needs one image and one or more hotspots");
            const markers = [];
            const notes = [];
            hotspots.forEach((hotspot, hotspotIndex) => {
              const x = Number(hotspot.attributes.x);
              const y = Number(hotspot.attributes.y);
              const title = hotspot.attributes.title?.trim();
              if (!title) fail("each hotspot needs a title");
              if (!Number.isFinite(x) || x < 0 || x > 100)
                fail("hotspot x must be between 0 and 100");
              if (!Number.isFinite(y) || y < 0 || y > 100)
                fail("hotspot y must be between 0 and 100");
              markers.push(
                element(
                  "button",
                  "collection-hotspot-marker",
                  [text(String(hotspotIndex + 1))],
                  {
                    type: "button",
                    ariaLabel: `${title}, note ${hotspotIndex + 1}`,
                    ariaPressed: hotspotIndex === 0 ? "true" : "false",
                    dataHotspotSelect: String(hotspotIndex),
                    style: `left:${x}%;top:${y}%;`,
                  },
                ),
              );
              notes.push(
                element(
                  "div",
                  "collection-hotspot-note",
                  [
                    element("h4", "", [text(title)]),
                    ...hotspot.children,
                  ],
                  {
                    dataHotspotNote: String(hotspotIndex),
                    ...(hotspotIndex ? { hidden: true } : {}),
                  },
                ),
              );
            });
            slide.data = {
              hName: "div",
              hProperties: {
                ...properties,
                className: ["collection-carousel-slide", "collection-hotspot-slide"],
              },
            };
            slide.children = [
              element("div", "collection-hotspot-image", [
                images[0],
                ...markers,
              ]),
              element("aside", "collection-hotspot-aside", [
                ...(introAside
                  ? [
                      element(
                        "div",
                        "collection-hotspot-intro",
                        structuredClone(introAside.children),
                      ),
                    ]
                  : []),
                ...notes,
              ]),
            ];
          }
        });
        node.data = {
          hName: "section",
          hProperties: {
            className: ["collection-carousel", `collection-carousel--${kind}`],
            role: "region",
            ariaLabel: attributes.label || "Collection gallery",
            ariaRoledescription: "carousel",
            dataCollectionCarousel: "",
            dataCarouselKind: kind,
          },
        };
        node.children = [
          element(
            "div",
            "collection-carousel-viewport",
            [element("div", "collection-carousel-track", slides)],
            { dataCarouselViewport: "", tabindex: "0" },
          ),
          element("div", "collection-carousel-controls", [
            element(
              "button",
              "collection-carousel-previous",
              [text("Previous")],
              { type: "button", ariaLabel: "Previous slide", dataCarouselPrevious: "" },
            ),
            element(
              "span",
              "collection-carousel-status",
              [text(`1 / ${slides.length}`)],
              { ariaLive: "polite", dataCarouselStatus: "" },
            ),
            element(
              "button",
              "collection-carousel-next",
              [text("Next")],
              { type: "button", ariaLabel: "Next slide", dataCarouselNext: "" },
            ),
            ...(kind === "hotspots"
              ? [
                  element("label", "collection-hotspot-toggle", [
                    element(
                      "input",
                      "",
                      [],
                      {
                        type: "checkbox",
                        checked: true,
                        dataHotspotVisibilityToggle: "",
                      },
                    ),
                    text("Show hotspots"),
                  ]),
                ]
              : []),
          ]),
        ];
      } else if (node.name === "collection-accordion") {
        const items = node.children.filter(
          (child) =>
            child.type === "containerDirective" && child.name === "accordion-item",
        );
        if (!items.length || items.length !== node.children.length)
          fail("include one or more accordion items and no other content");
        for (const item of items) {
          const title = item.attributes.title?.trim();
          if (!title) fail("each item needs a title");
          const meta = [item.attributes.author, item.attributes.year]
            .filter(Boolean)
            .join(" · ");
          item.data = {
            hName: "details",
            hProperties: { className: ["collection-accordion-item"] },
          };
          item.children = [
            element("summary", "collection-accordion-summary", [
              element("span", "collection-accordion-title", [text(title)]),
              ...(meta
                ? [element("span", "collection-accordion-meta", [text(meta)])]
                : []),
            ]),
            element("div", "collection-accordion-content", item.children),
          ];
        }
        node.data = {
          hName: "div",
          hProperties: {
            className: ["collection-accordion"],
            role: "region",
            ariaLabel: attributes.label || "Collection details",
          },
        };
      } else if (["testimonial", "quote"].includes(node.name)) {
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
    groupFloatedImages(tree);
    visit(tree);
  };
}
