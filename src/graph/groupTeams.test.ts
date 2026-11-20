import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { GraphGroup, GraphNode } from "../types";
import { canAssignGroup, childrenOf } from "./groupTree";
import { ensureMapGroupTeams, setGroupLocked } from "./groupTeams";

function group(id: string, parentId: string | null = null, extra: Partial<GraphGroup> = {}): GraphGroup {
  return { id, title: id, parentId, sortOrder: 0, locked: extra.locked, kind: extra.kind ?? "group", templateTeamId: extra.templateTeamId ?? null, assignees: extra.assignees ?? [], notes: extra.notes ?? "", ...extra };
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

describe("map group teams", () => {
  it("copies Long Lead children onto every locked group", () => {
    let ids = 0;
    const groups = [
      group("folder", null, { locked: false, title: "Project Lifecycle" }),
      group("long", "folder", { locked: true, title: "Long Lead" }),
      group("mkt", "long", { kind: "team", title: "Marketing" }),
      group("corp", "long", { kind: "team", title: "Corporate" }),
      group("setup", "folder", { locked: true, title: "Project Setup" }),
    ];
    const next = ensureMapGroupTeams(groups, () => `id-${ids++}`, "setup");
    const setupTeams = childrenOf(next, "setup");
    assert.deepEqual(setupTeams.map((item) => item.title).sort(), ["Corporate", "Marketing"]);
    assert.ok(setupTeams.every((item) => item.kind === "team" && item.locked === false && item.templateTeamId == null));
    assert.equal(canAssignGroup(next, "setup"), true);
    assert.equal(canAssignGroup(next, "long"), true);
  });

  it("is idempotent once a group has teams", () => {
    const groups = [
      group("long", null, { locked: true, title: "Long Lead" }),
      group("mkt", "long", { kind: "team", title: "Marketing" }),
      group("setup", null, { locked: true, title: "Project Setup" }),
      group("setup-mkt", "setup", { kind: "team", title: "Marketing", templateTeamId: "mkt" }),
    ];
    const next = ensureMapGroupTeams(groups, () => "should-not-run", "setup");
    assert.equal(next.length, groups.length);
    assert.equal(next.find((item) => item.id === "setup-mkt")?.title, "Marketing");
  });

  it("leaves each group's teams alone when the template changes", () => {
    const groups = [
      group("long", null, { locked: true, title: "Long Lead" }),
      group("mkt", "long", { kind: "team", title: "Brand", color: "#111111", notes: "Template note" }),
      group("setup", null, { locked: true, title: "Project Setup" }),
      group("setup-mkt", "setup", {
        kind: "team",
        title: "Marketing",
        color: "#222222",
        templateTeamId: "mkt",
        notes: "Setup only",
        assignees: [{ name: "Bea", email: "bea@example.com" }],
      }),
      group("closeout", null, { locked: true, title: "Closeout" }),
      group("closeout-mkt", "closeout", { kind: "team", title: "Marketing", notes: "Closeout only" }),
    ];
    const next = ensureMapGroupTeams(groups, () => "fresh", "setup");
    const setupTeam = next.find((item) => item.id === "setup-mkt");
    const closeoutTeam = next.find((item) => item.id === "closeout-mkt");
    assert.equal(setupTeam?.title, "Marketing");
    assert.equal(setupTeam?.color, "#222222");
    assert.equal(setupTeam?.notes, "Setup only");
    assert.equal(setupTeam?.assignees[0]?.name, "Bea");
    assert.equal(closeoutTeam?.title, "Marketing");
    assert.equal(closeoutTeam?.notes, "Closeout only");
    assert.equal(next.find((item) => item.id === "fresh"), undefined);
    assert.equal(next.find((item) => item.id === "mkt")?.title, "Brand");
  });

  it("blocks unlocking while map nodes remain", () => {
    const groups = [group("long", null, { locked: true, title: "Long Lead" })];
    const nodes = [node("n1", "long")];
    const result = setGroupLocked(groups, nodes, "long", false, () => "x");
    assert.equal(result.error, "Move this group's map nodes before unlocking");
    assert.equal(result.groups[0]?.locked, true);
  });
});
