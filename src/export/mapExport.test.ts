import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { GraphGroup, GraphLink, GraphNode } from "../types";
import { buildDocumentation, buildFullCsv, layoutFlowchart, outlineNumber } from "./mapExport";

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
  });

  it("lays out flowchart columns from parent and link order", () => {
    const nodes = [
      node({ id: "start", title: "Start", size: 5.5 }),
      node({ id: "mid", title: "Do work", parentId: "start" }),
      node({ id: "end", title: "End", size: 6.5, parentId: "mid" }),
    ];
    const links: GraphLink[] = [
      { id: "l1", source: "start", target: "mid", kind: "parent", arrows: "one" },
      { id: "l2", source: "mid", target: "end", kind: "parent", arrows: "one" },
    ];
    const layout = layoutFlowchart(nodes, links);
    const xs = Object.fromEntries(layout.boxes.map((box) => [box.id, box.x]));
    assert.ok((xs.start ?? 0) < (xs.mid ?? 0));
    assert.ok((xs.mid ?? 0) < (xs.end ?? 0));
    assert.equal(layout.boxes.find((box) => box.id === "start")?.kind, "start");
    assert.equal(layout.boxes.find((box) => box.id === "end")?.kind, "end");
  });

  it("joins outline numbers", () => {
    assert.equal(outlineNumber([1, 2, 3]), "1.2.3");
  });
});
