import type { GraphGroup, GraphNode } from "../types";
import { groupTitle } from "./groups";
import { childrenOf, isMapGroup, isTeam, memberCount } from "./groupTree";

export const TEAM_TEMPLATE_TITLE = "Long Lead";

export function isTeamTemplateSource(group: GraphGroup | undefined) {
  return Boolean(group && !isTeam(group) && groupTitle(group.title).toLowerCase() === TEAM_TEMPLATE_TITLE.toLowerCase());
}

export function teamTemplateSource(groups: GraphGroup[]) {
  return groups.find((group) => isTeamTemplateSource(group));
}

export function teamTemplates(groups: GraphGroup[]) {
  const source = teamTemplateSource(groups);
  if (!source) return [];
  return childrenOf(groups, source.id);
}

/** Mark Long Lead and its children. Leaves every other group's teams untouched. */
function normalizeTeamTemplate(groups: GraphGroup[]): GraphGroup[] {
  const source = teamTemplateSource(groups);
  if (!source) return groups;
  let changed = false;
  const next = groups.map((group) => {
    if (group.id === source.id && group.locked !== true) {
      changed = true;
      return { ...group, locked: true, kind: "group" as const };
    }
    if (group.parentId === source.id && !isTeam(group)) {
      changed = true;
      return { ...group, kind: "team" as const, locked: false };
    }
    return group;
  });
  return changed ? next : groups;
}

/** Give one locked group its own starting teams when it has none. */
function seedGroupTeams(groups: GraphGroup[], groupId: string, makeId: () => string): GraphGroup[] {
  const source = teamTemplateSource(groups);
  if (!source || groupId === source.id || !isMapGroup(groups, groupId)) return groups;
  if (childrenOf(groups, groupId).some((group) => isTeam(group))) return groups;
  const templates = childrenOf(groups, source.id).filter((group) => isTeam(group));
  if (!templates.length) return groups;
  return [
    ...groups,
    ...templates.map((template) => ({
      id: makeId(),
      title: template.title,
      color: template.color,
      parentId: groupId,
      sortOrder: template.sortOrder,
      locked: false,
      kind: "team" as const,
      templateTeamId: null,
      assignees: [],
      notes: "",
    })),
  ];
}

/**
 * Normalize Long Lead, and when seedGroupId is set, copy its teams onto that
 * one locked group if the group does not already have teams.
 */
export function ensureMapGroupTeams(groups: GraphGroup[], makeId: () => string, seedGroupId?: string): GraphGroup[] {
  const normalized = normalizeTeamTemplate(groups);
  if (!seedGroupId) return normalized;
  return seedGroupTeams(normalized, seedGroupId, makeId);
}

export function setGroupLocked(
  groups: GraphGroup[],
  nodes: GraphNode[],
  id: string,
  locked: boolean,
  makeId: () => string,
): { groups: GraphGroup[]; nodes: GraphNode[]; error?: string } {
  const group = groups.find((item) => item.id === id);
  if (!group) return { groups, nodes, error: "Missing group" };
  if (isTeam(group)) return { groups, nodes, error: "Teams stay attached to a locked group" };
  if (!locked && memberCount(nodes, id) > 0) {
    return { groups, nodes, error: "Move this group's map nodes before unlocking" };
  }
  const next = groups.map((item) => (item.id === id ? { ...item, locked, kind: "group" as const } : item));
  return { groups: locked ? ensureMapGroupTeams(next, makeId, id) : next, nodes };
}

export function groupsNeedTeamSync(groups: GraphGroup[]) {
  const next = normalizeTeamTemplate(groups);
  return next === groups ? null : next;
}
