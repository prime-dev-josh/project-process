import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseGraphDocument } from "../schema/graph";
import type { GraphGroup, GraphNode } from "../types";
import {
  addChildGroup,
  canAssignGroup,
  childrenOf,
  deleteGroup,
  groupDeleteImpact,
  isLeaf,
  leafGroups,
  reparentGroup,
  rootGroups,
  subtreeIds,
  wouldCycle,
} from "./groupTree";

function group(id: string, parentId: string | null = null, sortOrder = 0): GraphGroup {
  return { id, title: id, parentId, sortOrder };
}

function node(id: string, groupId: string | null): GraphNode {
  return {
    id,
    title: id,
    description: "",
    level: 0,
    parentId: null,
    type: "concept",
    employee: "",
    employeeEmail: "",
    groupId,
    size: 1,
  };
}

describe("group tree", () => {
  it("treats groups with children as folders and the rest as leaves", () => {
    const groups = [group("A"), group("A1", "A", 0), group("B")];
    assert.equal(isLeaf(groups, "A"), false);
    assert.equal(isLeaf(groups, "A1"), true);
    assert.deepEqual(leafGroups(groups).map((item) => item.id), ["A1", "B"]);
    assert.deepEqual(childrenOf(groups, "A").map((item) => item.id), ["A1"]);
  });

  it("moves a leaf's nodes onto a new child", () => {
    const groups = [group("Leaf")];
    const nodes = [node("n1", "Leaf"), node("n2", "Leaf"), node("other", null)];
    const next = addChildGroup(groups, nodes, "Leaf", { id: "Child", title: "Child" });
    assert.equal(isLeaf(next.groups, "Leaf"), false);
    assert.equal(isLeaf(next.groups, "Child"), true);
    assert.deepEqual(
      next.nodes.map((item) => [item.id, item.groupId]),
      [
        ["n1", "Child"],
        ["n2", "Child"],
        ["other", null],
      ],
    );
  });

  it("blocks a reparent that would cycle", () => {
    const groups = [group("A"), group("B", "A")];
    assert.equal(wouldCycle(groups, "A", "B"), true);
    assert.equal(reparentGroup(groups, [], "A", "B"), null);
  });

  it("moves a target leaf's nodes onto the incoming leaf", () => {
    const groups = [group("Parent"), group("Incoming")];
    const nodes = [node("n1", "Parent")];
    const next = reparentGroup(groups, nodes, "Incoming", "Parent");
    assert.ok(next);
    assert.equal(next.nodes[0]?.groupId, "Incoming");
    assert.equal(isLeaf(next.groups, "Parent"), false);
  });

  it("rejects assigning a folder id", () => {
    const groups = [group("Folder"), group("Leaf", "Folder")];
    assert.equal(canAssignGroup(groups, "Folder"), false);
    assert.equal(canAssignGroup(groups, "Leaf"), true);
    assert.equal(canAssignGroup(groups, null), true);
    assert.equal(canAssignGroup(groups, "missing"), false);
  });

  it("deletes a folder subtree and ungroups its members", () => {
    const groups = [group("Folder"), group("Leaf", "Folder"), group("Keep")];
    const nodes = [node("n1", "Leaf"), node("n2", "Keep")];
    const next = deleteGroup(groups, nodes, "Folder");
    assert.deepEqual(next.groups.map((item) => item.id), ["Keep"]);
    assert.equal(next.nodes.find((item) => item.id === "n1")?.groupId, null);
    assert.equal(next.nodes.find((item) => item.id === "n2")?.groupId, "Keep");
  });

  it("lists nested groups and assigned nodes that a delete would affect", () => {
    const groups = [group("Folder"), group("Leaf", "Folder"), group("Keep")];
    const nodes = [node("n1", "Leaf"), node("n2", "Keep")];
    const impact = groupDeleteImpact(groups, nodes, "Folder");
    assert.equal(impact.id, "Folder");
    assert.equal(impact.childCount, 1);
    assert.equal(impact.memberCount, 1);
    assert.deepEqual(impact.nestedGroups.map((item) => item.title), ["Leaf"]);
    assert.deepEqual(impact.members.map((item) => [item.title, item.groupTitle]), [["n1", "Leaf"]]);
  });

  it("defaults hierarchy fields when importing an older document", () => {
    const doc = parseGraphDocument({
      nodes: [],
      links: [],
      groups: [{ id: "legacy", title: "Legacy" }],
    });
    assert.equal(doc.groups[0]?.parentId, null);
    assert.equal(doc.groups[0]?.sortOrder, 0);
  });

  it("reads SQL parent_id / sort_order aliases", () => {
    const doc = parseGraphDocument({
      nodes: [],
      links: [],
      groups: [{ id: "child", title: "Child", parent_id: "root", sort_order: 3 }],
    });
    assert.equal(doc.groups[0]?.parentId, "root");
    assert.equal(doc.groups[0]?.sortOrder, 3);
  });

  it("keeps every group in the forest, including nested SQL rows", () => {
    const prime = "94a97eca-0f18-4717-b514-a9dedeb77a06";
    const corporate = "c9c5708c-5d4d-452c-a781-6329fafe57f6";
    const groups = [
      group("business"),
      group("delivery"),
      group(prime, null, 6),
      group(corporate, prime),
      group("legal", corporate),
      group("hr", corporate),
      group("employee-lifecycle", prime),
      group("onboarding", prime),
      group("offboarding", prime),
      group("integration", prime),
      group("pursuit"),
    ];
    const placed = new Set(rootGroups(groups).flatMap((root) => subtreeIds(groups, root.id)));
    assert.equal(placed.size, groups.length);
    assert.deepEqual(
      childrenOf(groups, prime).map((item) => item.id).sort(),
      [corporate, "employee-lifecycle", "integration", "offboarding", "onboarding"],
    );
  });
});
