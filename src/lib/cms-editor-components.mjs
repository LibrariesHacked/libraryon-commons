import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { toMarkdown } from "mdast-util-to-markdown";
import { contentDirectives } from "./content-directives.mjs";
import { markdownOptions } from "./markdown-format.mjs";

const parser = unified().use(remarkParse).use(remarkDirective);
const preview = unified()
  .use(remarkParse)
  .use(remarkDirective)
  .use(contentDirectives)
  .use(remarkRehype)
  .use(rehypeStringify);
const markdown = (children) =>
  toMarkdown({ type: "root", children }, markdownOptions).trim();
const parse = (value) => parser.parse(String(value || "")).children;
const attributes = (values) => {
  const entries = Object.entries(values).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  const escaped = (value) =>
    String(value).replace(
      /[&"<>\r\n]/g,
      (character) =>
        ({
          "&": "&amp;",
          '"': "&quot;",
          "<": "&lt;",
          ">": "&gt;",
          "\r": "&#13;",
          "\n": "&#10;",
        })[character],
    );
  return entries.length
    ? `{${entries.map(([key, value]) => `${key}="${escaped(value)}"`).join(" ")}}`
    : "";
};
const wrap = (name, body, values = {}, fence = ":::") =>
  `${fence}${name}${attributes(values)}\n\n${body.trim()}\n\n${fence}`;
const imageParagraph = (node) =>
  node.type === "paragraph" &&
  node.children.length === 1 &&
  node.children[0].type === "image";
const text = (value) => ({ type: "text", value: String(value || "") });
const imageNode = (data) => ({
  type: "paragraph",
  children: [
    {
      type: "image",
      url: data.image,
      alt: data.alt || "",
      title: data.image_title || null,
    },
  ],
});
const headingNode = (data) => ({
  type: "heading",
  depth: Number(data.heading_level || 3),
  children: parse(data.title || "")[0]?.children || [text("")],
});
const markdownField = (name, label, required = false) => ({
  name,
  label,
  widget: "markdown",
  required,
  editor_components: [],
  modes: ["rich_text", "raw"],
});
const stringField = (name, label, required = false) => ({
  name,
  label,
  widget: "string",
  required,
});
const linkField = (name, label) => ({
  ...stringField(name, label),
  pattern: [
    "^(?:/(?!/)|https?://).*$|^$",
    "Use an HTTP(S) URL or a local path.",
  ],
});

function parseCard(node) {
  const children = [...node.children];
  const imageIndex = children.findIndex(imageParagraph);
  const image =
    imageIndex < 0 ? null : children.splice(imageIndex, 1)[0].children[0];
  const headingIndex = children.findIndex((child) => child.type === "heading");
  const heading = headingIndex < 0 ? null : children.splice(headingIndex, 1)[0];
  return {
    image: image?.url || "",
    alt: image?.alt || "",
    image_title: image?.title || "",
    title: heading
      ? markdown([{ type: "paragraph", children: heading.children }])
      : "",
    heading_level: heading?.depth || 3,
    href: node.attributes?.href || "",
    content: markdown(children),
  };
}

function cardMarkdown(data) {
  const children = [];
  if (data.image) children.push(imageNode(data));
  if (data.title) children.push(headingNode(data));
  children.push(...parse(data.content));
  return wrap("card", markdown(children), { href: data.href });
}

export function parseEditorBlock(source) {
  const node = parse(source)[0];
  if (!node?.name) throw new Error("Expected a named Markdown block");
  if (["testimonial", "quote"].includes(node.name)) {
    const image = node.children.find(imageParagraph)?.children[0];
    return {
      ...node.attributes,
      image: image?.url || "",
      alt: image?.alt || "",
      image_title: image?.title || "",
      quote: markdown(
        node.children
          .filter((child) => child.type === "blockquote")
          .flatMap((child) => child.children),
      ),
    };
  }
  if (node.name === "card") return parseCard(node);
  if (node.name === "cards") return { cards: node.children.map(parseCard) };
  if (node.name === "list-panel") {
    const listIndex = node.children.findIndex((child) => child.type === "list");
    const list = node.children[listIndex];
    const before = node.children.slice(0, listIndex);
    const headingIndex = before.findIndex((child) => child.type === "heading");
    const heading = headingIndex < 0 ? null : before.splice(headingIndex, 1)[0];
    return {
      title: heading
        ? markdown([{ type: "paragraph", children: heading.children }])
        : "",
      heading_level: heading?.depth || 2,
      introduction: markdown(before),
      ordered: list.ordered,
      start: list.start || 1,
      items: list.children.map((item) => ({ text: markdown(item.children) })),
      after: markdown(node.children.slice(listIndex + 1)),
    };
  }
  if (node.name === "video")
    return {
      src: node.attributes.src || "",
      title: node.attributes.title || "",
    };
  throw new Error(`Unsupported editor block: ${node.name}`);
}

export function serializeEditorBlock(name, data) {
  if (["testimonial", "quote"].includes(name)) {
    const children = [];
    if (name === "testimonial" && data.image) children.push(imageNode(data));
    children.push({ type: "blockquote", children: parse(data.quote) });
    return wrap(name, markdown(children), {
      author: data.author || "",
      role: data.role,
      organisation: data.organisation,
      url: data.url,
    });
  }
  if (name === "card") return cardMarkdown(data);
  if (name === "cards")
    return wrap(
      "cards",
      (data.cards || []).map(cardMarkdown).join("\n\n"),
      {},
      "::::",
    );
  if (name === "list-panel") {
    const children = [];
    if (data.title)
      children.push(
        headingNode({ ...data, heading_level: data.heading_level || 2 }),
      );
    children.push(...parse(data.introduction));
    children.push({
      type: "list",
      ordered: Boolean(data.ordered),
      start: data.ordered ? Number(data.start || 1) : null,
      spread: false,
      children: (data.items || []).map((item) => ({
        type: "listItem",
        spread: false,
        children: parse(item.text),
      })),
    });
    children.push(...parse(data.after));
    return wrap(name, markdown(children));
  }
  if (name === "video")
    return `::video${attributes({ src: data.src || "", title: data.title || "" })}`;
  if (["faqs", "resources"].includes(name)) return `{{${name}}}`;
  throw new Error(`Unsupported editor block: ${name}`);
}

const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

export function previewEditorBlock(name, data, getAsset) {
  if (name === "faqs")
    return "<section><h2>Frequently asked questions</h2></section>";
  if (name === "resources")
    return "<section><h2>Related resources</h2></section>";
  const asset = (image) =>
    image && getAsset ? String(getAsset(image)) : image;
  const values = {
    ...data,
    image: asset(data.image),
    cards: data.cards?.map((card) => ({ ...card, image: asset(card.image) })),
  };
  try {
    return String(preview.processSync(serializeEditorBlock(name, values)));
  } catch (error) {
    return `<p role="status">${escapeHTML(error.reason || error.message)}</p>`;
  }
}

const imageFields = (required = false) => [
  { name: "image", label: "Image", widget: "image", required },
  stringField("alt", "Alternative Text", required),
  stringField("image_title", "Image Title"),
];
const headingFields = (level = 3) => [
  stringField("title", "Heading"),
  {
    name: "heading_level",
    label: "Heading Level",
    widget: "select",
    default: level,
    options: [2, 3, 4],
    required: false,
  },
];
const cardFields = () => [
  ...imageFields(),
  ...headingFields(),
  {
    ...linkField("href", "Whole-Card Link"),
    hint: "Use for a single destination. Keep the text below free of other links; the whole card will be clickable.",
  },
  markdownField("content", "Text And Links"),
];
const attributionFields = () => [
  stringField("author", "Name", true),
  stringField("role", "Role"),
  stringField("organisation", "Organisation"),
  linkField("url", "Organisation Link"),
];
const containerPattern = (name, count = 3) =>
  new RegExp(
    `^(:{${count},})${name}(?:\\{[^\\r\\n]*\\})?[\\t ]*\\r?\\n[\\s\\S]*?\\r?\\n\\1[\\t ]*(?=\\r?\\n|$)`,
  );

export function createEditorComponents() {
  return [
    {
      name: "testimonial",
      label: "Testimonial",
      fields: [
        ...attributionFields(),
        ...imageFields(true),
        markdownField("quote", "Quote", true),
      ],
    },
    {
      name: "quote",
      label: "Attributed Quote",
      fields: [...attributionFields(), markdownField("quote", "Quote", true)],
    },
    {
      name: "cards",
      label: "Card Grid",
      fields: [
        {
          name: "cards",
          label: "Cards",
          widget: "list",
          min: 1,
          summary: "{{fields.title}}",
          fields: cardFields(),
        },
      ],
    },
    { name: "card", label: "Card", fields: cardFields() },
    {
      name: "list-panel",
      label: "List Panel",
      fields: [
        ...headingFields(2),
        markdownField("introduction", "Introduction"),
        {
          name: "ordered",
          label: "Numbered List",
          widget: "boolean",
          default: false,
          required: false,
        },
        {
          name: "start",
          label: "Starting Number",
          widget: "number",
          value_type: "int",
          default: 1,
          min: 1,
          required: false,
        },
        {
          name: "items",
          label: "Items",
          widget: "list",
          min: 1,
          summary: "{{fields.text}}",
          fields: [markdownField("text", "Item", true)],
        },
        markdownField("after", "After The List"),
      ],
    },
    {
      name: "video",
      label: "YouTube Video",
      fields: [
        {
          ...stringField("src", "YouTube Embed URL", true),
          pattern: [
            "^https://(?:www\\.)?(?:youtube\\.com|youtube-nocookie\\.com)/embed/[^\\s]+$",
            "Use a YouTube /embed/ URL.",
          ],
        },
        stringField("title", "Video Title", true),
      ],
    },
    { name: "faqs", label: "Linked FAQs", fields: [] },
    { name: "resources", label: "Linked Resources", fields: [] },
  ].map(({ name, label, fields }) => ({
    id: `library-${name}`,
    label,
    fields,
    pattern: ["faqs", "resources"].includes(name)
      ? new RegExp(`^\\{\\{${name}\\}\\}[\\t ]*(?=\\r?\\n|$)`)
      : name === "video"
        ? /^::video(?:\{[^\r\n]*\})?[\t ]*(?=\r?\n|$)/
        : containerPattern(name, name === "cards" ? 4 : 3),
    fromBlock: (match) =>
      ["faqs", "resources"].includes(name) ? {} : parseEditorBlock(match[0]),
    toBlock: (data) => serializeEditorBlock(name, data),
    toPreview: (data, getAsset) => previewEditorBlock(name, data, getAsset),
  }));
}

export function registerEditorComponents(cms) {
  for (const component of createEditorComponents())
    cms.registerEditorComponent(component);
}
