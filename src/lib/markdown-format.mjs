import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkDirective from "remark-directive";

export const markdownOptions = {
  bullet: "-",
  listItemIndent: "one",
  emphasis: "*",
  strong: "*",
  fences: true,
};

export function normalizeListSpacing(source) {
  const tree = unified().use(remarkParse).use(remarkDirective).parse(source);
  const edits = [];
  const indentation = new Map();
  const visit = (node) => {
    if (node.type === "listItem") {
      const start = node.position.start.offset;
      const marker = /^([-+*]|\d+[.)])( {2,})/.exec(source.slice(start));
      if (marker) {
        const surplus = marker[2].length - 1;
        edits.push({
          start: start + marker[1].length + 1,
          end: start + marker[0].length,
          value: "",
        });
        const threshold = node.position.start.column - 1 + marker[0].length;
        let line = source.indexOf("\n", start) + 1;
        while (line > 0 && line < node.position.end.offset) {
          const spaces = /^ */.exec(source.slice(line))[0].length;
          if (spaces >= threshold)
            indentation.set(line, (indentation.get(line) || 0) + surplus);
          const next = source.indexOf("\n", line);
          line = next < 0 ? 0 : next + 1;
        }
      }
    }
    (node.children || []).forEach(visit);
  };
  visit(tree);
  for (const [start, count] of indentation)
    edits.push({ start, end: start + count, value: "" });
  for (const edit of edits.sort((first, second) => second.start - first.start))
    source = `${source.slice(0, edit.start)}${edit.value}${source.slice(edit.end)}`;
  return source;
}
