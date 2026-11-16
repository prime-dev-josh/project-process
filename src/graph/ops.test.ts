import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { GraphGroup, GraphLink, GraphNode } from "../types";
import { inheritFromLinkEnds, insertNodeBetween } from "./ops";

function node(partial: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    title: partial.id,
    description: "",
    level: 0,
    parentId: null,
    type: "concept",
    employee: "",
    employeeEmail: "",
    groupId: null,
    size: 1,
    ...partial,
  };
}

function link(kind: GraphLink["kind"] = "parent"): GraphLink {
  return { id: "l", source: "a", target: "b", kind, arrows: "one" };
}

function group(id: string, parentId: string | null = null): GraphGroup {
  return { id, title: id, parentId, sortOrder: 0 };
}

describe("insert between nodes", () => {
  it("copies the shared assignee and group", () => {
    const src = node({ id: "a", employee: "Ada", employeeEmail: "ada@primeeng.com", groupId: "leaf" });
    const tgt = node({ id: "b", level: 1, employee: "Ada", employeeEmail: "ada@primeeng.com", groupId: "leaf" });
    const groups = [group("leaf")];
    const inherited = inheritFromLinkEnds(link(), src, tgt, groups);
    assert.equal(inherited.employeeEmail, "ada@primeeng.com");
    assert.equal(inherited.groupId, "leaf");
    const next = insertNodeBetween([src, tgt], [link()], "l", groups);
    const mid = next?.nodes.find((item) => item.id === next.id);
    assert.equal(mid?.groupId, "leaf");
    assert.equal(mid?.employee, "Ada");
  });

  it("uses the higher node when assignee or group differs", () => {
    const src = node({ id: "a", level: 0, employee: "Ada", employeeEmail: "ada@primeeng.com", groupId: "top" });
    const tgt = node({ id: "b", level: 2, employee: "Bea", employeeEmail: "bea@primeeng.com", groupId: "low" });
    const groups = [group("top"), group("low")];
    const inherited = inheritFromLinkEnds(link("cross"), src, tgt, groups);
    assert.equal(inherited.employeeEmail, "ada@primeeng.com");
    assert.equal(inherited.groupId, "top");
  });

  it("follows the parent end of a parent link even when the child is shallower", () => {
    const src = node({ id: "a", level: 3, employee: "Parent", employeeEmail: "p@primeeng.com", groupId: "p" });
    const tgt = node({ id: "b", level: 1, employee: "Child", employeeEmail: "c@primeeng.com", groupId: "c" });
    const groups = [group("p"), group("c")];
    const inherited = inheritFromLinkEnds(link("parent"), src, tgt, groups);
    assert.equal(inherited.employee, "Parent");
    assert.equal(inherited.groupId, "p");
  });

  it("does not assign a folder", () => {
    const src = node({ id: "a", groupId: "folder" });
    const tgt = node({ id: "b", level: 1, groupId: "folder" });
    const groups = [group("folder"), group("leaf", "folder")];
    const inherited = inheritFromLinkEnds(link(), src, tgt, groups);
    assert.equal(inherited.groupId, null);
  });
});
