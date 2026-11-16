import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { GraphLink } from "../types";
import { buildUndirectedAdjacency, DRAG_NEIGHBOR_HOPS, nodesWithinHops } from "./elasticDrag";

function link(source: string, target: string): GraphLink {
  return { id: `${source}-${target}`, source, target, kind: "parent", arrows: "one" };
}

describe("elastic drag neighborhood", () => {
  it("only includes immediately linked nodes", () => {
    const adj = buildUndirectedAdjacency([link("a", "b"), link("b", "c"), link("c", "d")]);
    const near = nodesWithinHops(new Set(["a"]), adj, DRAG_NEIGHBOR_HOPS);
    assert.deepEqual([...near].sort(), ["b"]);
  });
});
