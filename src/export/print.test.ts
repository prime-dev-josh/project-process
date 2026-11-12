import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { pdf } from "@react-pdf/renderer";
import type { GraphGroup, GraphNode } from "../types";
import { buildDocumentationBook } from "./mapExport";
import { folioFor, folioText, recordPage } from "./pdfFolio";
import { documentationDocument, flowchartDocument } from "./print";

function node(partial: Partial<GraphNode> & { id: string; title: string }): GraphNode {
  return {
    description: "",
    level: 0,
    parentId: null,
    type: "concept",
    employee: "",
    employeeEmail: "",
    groupId: null,
    size: 1.5,
    ...partial,
  };
}

function group(id: string, parentId: string | null = null): GraphGroup {
  return { id, title: id, parentId, sortOrder: 0 };
}

describe("documentation folios", () => {
  it("formats a single page and an inclusive range", () => {
    assert.equal(folioText(3), "3");
    assert.equal(folioText(12, 12), "12");
    assert.equal(folioText(12, 15), "12–15");
    const index = new Map<string, { start: number; end: number }>();
    recordPage(index, "part:g", 4);
    recordPage(index, "part:g", 6);
    assert.equal(folioFor(index, "part:g"), "4–6");
    assert.equal(folioFor(null, "part:g"), "");
  });

  it("renders a documentation pdf and records chapter pages", async () => {
    const nodes = Array.from({ length: 8 }, (_, index) =>
      node({
        id: `n${index}`,
        title: `Step ${index}`,
        groupId: "g",
        description: "Integration notes for the acquired team. ".repeat(18),
      }),
    );
    const book = buildDocumentationBook(nodes, [], [group("g")]);
    const index = new Map<string, { start: number; end: number }>();
    const first = await pdf(documentationDocument(book.parts, index, null, "")).toBlob();
    assert.ok(first.size > 1000);
    assert.ok(index.has("part:g"));
    assert.ok(index.has("ch:n0"));
    const range = index.get("part:g");
    assert.ok(range && range.start >= 2);
    const second = await pdf(documentationDocument(book.parts, index, new Map(index), "")).toBlob();
    assert.ok(second.size > first.size - 200);
  });

  it("renders a flowchart pdf with a cover", async () => {
    const blob = await pdf(
      flowchartDocument(
        [
          {
            groupId: "g",
            title: "Integration",
            path: "Integration",
            color: "#24328a",
            nodes: [node({ id: "a", title: "Start the review", size: 5.5 }), node({ id: "b", title: "File the record", parentId: "a" })],
            links: [],
          },
        ],
        "",
      ),
    ).toBlob();
    assert.ok(blob.size > 1000);
  });
});
