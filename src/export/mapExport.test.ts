import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { GraphGroup, GraphLink, GraphNode } from "../types";
import {
  buildDocumentation,
  buildDocumentationBook,
  buildFullCsv,
  flowchartPagesForGroups,
  layoutFlowchart,
  layoutFlowchartPages,
  outlineNumber,
} from "./mapExport";

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

describe("map export", () => {
  it("numbers the node forest for CSV and docs", () => {
    const nodes = [
      node({ id: "a", title: "Alpha" }),
      node({ id: "b", title: "Beta", parentId: "a" }),
      node({ id: "c", title: "Gamma" }),
    ];
    const csv = buildFullCsv(nodes, [], [group("g")]);
    assert.match(csv, /# Nodes/);
    assert.match(csv, /# Groups/);
    assert.match(csv, /Alpha/);
    assert.match(csv, /1,a,/);
    const docs = buildDocumentation(nodes, [], [group("g")]);
    assert.equal(docs[0]?.number, "1");
    assert.equal(docs.find((row) => row.id === "b")?.number, "1.1");
    const book = buildDocumentationBook(
      [
        node({ id: "a", title: "Alpha", groupId: "g" }),
        node({ id: "c", title: "Gamma", groupId: "g" }),
      ],
      [],
      [group("folder"), group("g", "folder")],
    );
    assert.equal(book.parts[0]?.title, "g");
    assert.equal(book.parts[0]?.processes.length, 0);
    assert.deepEqual(book.parts[0]?.other.map((step) => step.id), ["a", "c"]);
  });

  it("orders a start-to-end process and nests the shorter branch", () => {
    const nodes = [
      node({ id: "start", title: "Open", size: 5.5, groupId: "g", description: "Begin" }),
      node({ id: "main", title: "Main path", groupId: "g" }),
      node({ id: "side", title: "Side path", groupId: "g" }),
      node({ id: "merge", title: "Merge", groupId: "g" }),
      node({ id: "end", title: "Close", size: 6.5, groupId: "g" }),
      node({ id: "loose", title: "Loose note", groupId: "g", description: "Not on the flow" }),
    ];
    const links: GraphLink[] = [
      { id: "1", source: "start", target: "main", kind: "parent", arrows: "one" },
      { id: "2", source: "start", target: "side", kind: "cross", arrows: "one" },
      { id: "3", source: "main", target: "merge", kind: "parent", arrows: "one" },
      { id: "4", source: "side", target: "merge", kind: "cross", arrows: "one" },
      { id: "5", source: "merge", target: "end", kind: "parent", arrows: "one" },
    ];
    const book = buildDocumentationBook(nodes, links, [group("g")]);
    const process = book.parts[0]?.processes[0];
    assert.equal(process?.title, "From Open");
    assert.equal(process?.number, "1.1");
    assert.deepEqual(process?.steps.map((step) => step.id), ["start", "main", "merge", "end"]);
    assert.deepEqual(process?.steps.map((step) => step.number), ["1.1.1", "1.1.2", "1.1.3", "1.1.4"]);
    const branch = process?.steps[0]?.branches[0];
    assert.equal(branch?.kind, "branch");
    assert.equal(branch?.number, "1.1.1.1");
    assert.deepEqual(branch?.steps.map((step) => step.id), ["side"]);
    assert.deepEqual(branch?.steps.map((step) => step.number), ["1.1.1.1.1"]);
    assert.equal(process?.steps.some((step) => step.branches.some((item) => item.steps.some((nested) => nested.id === "merge"))), false);
    assert.equal(book.parts[0]?.otherNumber, "1.2");
    assert.deepEqual(book.parts[0]?.other.map((step) => step.number), ["1.2.1"]);
  });

  it("follows parent links when the map has no start class", () => {
    const nodes = [
      node({ id: "a", title: "First", groupId: "g" }),
      node({ id: "b", title: "Second", groupId: "g", parentId: "a" }),
      node({ id: "c", title: "Third", groupId: "g", parentId: "b", size: 6.5 }),
    ];
    const book = buildDocumentationBook(nodes, [], [group("g")]);
    assert.deepEqual(book.parts[0]?.processes[0]?.steps.map((step) => step.id), ["a", "b", "c"]);
    assert.deepEqual(book.parts[0]?.processes[0]?.steps.map((step) => step.number), ["1.1.1", "1.1.2", "1.1.3"]);
    assert.equal(book.parts[0]?.other.length, 0);
  });

  it("lays flowcharts top to bottom and keeps the full title", () => {
    const long = "Communications checks clients 90 days after close and confirms the instrument details";
    const nodes = [
      node({ id: "start", title: long, size: 5.5 }),
      node({ id: "mid", title: "Do work", parentId: "start" }),
      node({ id: "end", title: "End", size: 6.5, parentId: "mid" }),
    ];
    const links: GraphLink[] = [
      { id: "l1", source: "start", target: "mid", kind: "parent", arrows: "one" },
      { id: "l2", source: "mid", target: "end", kind: "parent", arrows: "one" },
    ];
    const layout = layoutFlowchart(nodes, links);
    const ys = Object.fromEntries(layout.boxes.map((box) => [box.id, box.y]));
    assert.ok((ys.start ?? 0) < (ys.mid ?? 0));
    assert.ok((ys.mid ?? 0) < (ys.end ?? 0));
    assert.equal(layout.boxes.find((box) => box.id === "start")?.title, long);
    assert.ok((layout.boxes.find((box) => box.id === "start")?.h ?? 0) > 52);
    assert.equal(layout.boxes.find((box) => box.id === "start")?.kind, "start");
    assert.equal(layout.boxes.find((box) => box.id === "end")?.kind, "end");
  });

  it("continues a tall group onto another portrait page", () => {
    const nodes = Array.from({ length: 24 }, (_, index) =>
      node({
        id: `n${index}`,
        title: `Step ${index} with a title long enough to wrap onto two lines in the box`,
        parentId: index === 0 ? null : `n${index - 1}`,
      }),
    );
    const links: GraphLink[] = nodes.slice(1).map((item, index) => ({
      id: `l${index}`,
      source: `n${index}`,
      target: item.id,
      kind: "parent" as const,
      arrows: "one" as const,
    }));
    const pages = layoutFlowchartPages(nodes, links, "Integration");
    assert.ok(pages.length > 1);
    assert.equal(pages[0]?.label, "Integration");
    const placed = pages.flatMap((page) => page.boxes.map((box) => box.id));
    assert.equal(new Set(placed).size, nodes.length);
  });

  it("joins outline numbers", () => {
    assert.equal(outlineNumber([1, 2, 3]), "1.2.3");
  });

  it("builds one flowchart page per selected leaf group", () => {
    const nodes = [
      node({ id: "a", title: "A", groupId: "leaf-a" }),
      node({ id: "b", title: "B", groupId: "leaf-b" }),
      node({ id: "c", title: "C", groupId: "leaf-a" }),
    ];
    const links: GraphLink[] = [
      { id: "l1", source: "a", target: "c", kind: "flow", arrows: "one" },
      { id: "l2", source: "a", target: "b", kind: "flow", arrows: "one" },
    ];
    const groups = [group("folder"), group("leaf-a", "folder"), group("leaf-b", "folder")];
    const pages = flowchartPagesForGroups(nodes, links, groups, ["leaf-a", "leaf-b"]);
    assert.equal(pages.length, 2);
    assert.deepEqual(
      pages.map((page) => page.groupId),
      ["leaf-a", "leaf-b"],
    );
    assert.equal(pages[0]?.nodes.length, 2);
    assert.equal(pages[0]?.links.length, 1);
    assert.equal(pages[1]?.nodes.length, 1);
    assert.equal(pages[1]?.links.length, 0);
    assert.match(pages[0]?.color ?? "", /^#/);
  });

  it("lays out flowcharts with cyclic links without hanging", () => {
    const nodes = [
      node({ id: "a", title: "A" }),
      node({ id: "b", title: "B" }),
      node({ id: "c", title: "C" }),
    ];
    const links: GraphLink[] = [
      { id: "l1", source: "a", target: "b", kind: "flow", arrows: "one" },
      { id: "l2", source: "b", target: "c", kind: "flow", arrows: "one" },
      { id: "l3", source: "c", target: "a", kind: "flow", arrows: "one" },
    ];
    const started = Date.now();
    const layout = layoutFlowchart(nodes, links);
    assert.ok(Date.now() - started < 500);
    assert.equal(layout.boxes.length, 3);
  });
});
