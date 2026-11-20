import type { GraphGroup, GraphNode } from "../types";
import { groupTitle, UNGROUPED_FILTER } from "./groups";

export type GroupTreeResult = {
  groups: GraphGroup[];
  nodes: GraphNode[];
};

function parentKey(value: string | null | undefined, selfId?: string) {
  if (value == null) return null;
  const next = String(value).trim();
  if (!next || next === "null" || next === "undefined" || next === selfId) return null;
  return next;
}

function byParent(groups: GraphGroup[], parentId: string | null, exceptId?: string) {
  return groups
    .filter((group) => group.id !== exceptId && parentKey(group.parentId, group.id) === parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));
}

export function childrenOf(groups: GraphGroup[], parentId: string | null): GraphGroup[] {
  return byParent(groups, parentId);
}

export function isLeaf(groups: GraphGroup[], id: string) {
  return !groups.some((group) => parentKey(group.parentId, group.id) === id);
}

export function isTeam(group: GraphGroup | undefined) {
  return group?.kind === "team";
}

function groupDefaults(group: Omit<GraphGroup, "kind" | "templateTeamId" | "assignees" | "notes"> & Partial<GraphGroup>): GraphGroup {
  return {
    ...group,
    kind: group.kind === "team" ? "team" : "group",
    templateTeamId: group.templateTeamId ?? null,
    assignees: group.assignees ?? [],
    notes: group.notes ?? "",
  };
}

/** Locked groups hold map nodes, even when they have team children. */
export function isMapGroup(groups: GraphGroup[], id: string) {
  const group = groups.find((item) => item.id === id);
  if (!group || isTeam(group)) return false;
  if (group.locked != null) return group.locked;
  if (isLeaf(groups, id)) return true;
  const title = groupTitle(group.title).toLowerCase();
  if (title === "long lead") return true;
  const source = groups.find((item) => groupTitle(item.title).toLowerCase() === "long lead");
  if (!source) return false;
  const roster = new Set(
    groups
      .filter((item) => parentKey(item.parentId, item.id) === source.id)
      .map((item) => groupTitle(item.title).toLowerCase()),
  );
  if (!roster.size) return false;
  const kids = groups.filter((item) => parentKey(item.parentId, item.id) === id);
  return kids.length > 0 && kids.every((kid) => roster.has(groupTitle(kid.title).toLowerCase()));
}

export function groupAssignees(group: GraphGroup | undefined) {
  return group?.assignees ?? [];
}

export function rootGroups(groups: GraphGroup[]): GraphGroup[] {
  const known = new Set(groups.map((group) => group.id));
  return groups
    .filter((group) => {
      const parentId = parentKey(group.parentId, group.id);
      return !parentId || !known.has(parentId);
    })
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));
}

export function leafGroups(groups: GraphGroup[]): GraphGroup[] {
  const leaves: GraphGroup[] = [];
  const seen = new Set<string>();

  function visit(id: string) {
    if (seen.has(id)) return;
    const group = groups.find((item) => item.id === id);
    if (!group) return;
    seen.add(id);
    const kids = childrenOf(groups, id);
    if (!kids.length) leaves.push(group);
    else kids.forEach((kid) => visit(kid.id));
  }

  rootGroups(groups).forEach((root) => visit(root.id));
  return leaves;
}

/** Map-assignable groups (locked), walking the forest so pickers stay stable. */
export function mapGroups(groups: GraphGroup[]): GraphGroup[] {
  const out: GraphGroup[] = [];
  const seen = new Set<string>();

  function visit(id: string) {
    if (seen.has(id)) return;
    const group = groups.find((item) => item.id === id);
    if (!group) return;
    seen.add(id);
    if (isMapGroup(groups, id)) out.push(group);
    childrenOf(groups, id).forEach((kid) => visit(kid.id));
  }

  rootGroups(groups).forEach((root) => visit(root.id));
  return out;
}

export function groupPath(groups: GraphGroup[], id: string): string[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const titles: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    titles.unshift(groupTitle(current.title));
    const parentId = parentKey(current.parentId, current.id);
    current = parentId ? byId.get(parentId) : undefined;
  }
  return titles;
}

export function wouldCycle(groups: GraphGroup[], id: string, newParentId: string | null) {
  if (newParentId == null) return false;
  if (newParentId === id) return true;
  const byId = new Map(groups.map((group) => [group.id, group]));
  const seen = new Set<string>();
  let cursor: string | null = newParentId;
  while (cursor) {
    if (cursor === id || seen.has(cursor)) return true;
    seen.add(cursor);
    const current = byId.get(cursor);
    cursor = current ? parentKey(current.parentId, current.id) : null;
  }
  return false;
}

export function subtreeIds(groups: GraphGroup[], id: string): string[] {
  if (!groups.some((group) => group.id === id)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (current: string) => {
    if (seen.has(current)) return;
    seen.add(current);
    out.push(current);
    for (const child of childrenOf(groups, current)) walk(child.id);
  };
  walk(id);
  return out;
}

function firstLeafId(groups: GraphGroup[], id: string, seen = new Set<string>()): string | null {
  if (seen.has(id)) return null;
  seen.add(id);
  const kids = childrenOf(groups, id);
  if (!kids.length) return groups.some((group) => group.id === id) ? id : null;
  for (const kid of kids) {
    const leaf = firstLeafId(groups, kid.id, seen);
    if (leaf) return leaf;
  }
  return null;
}

function nextSortOrder(groups: GraphGroup[], parentId: string | null, exceptId?: string) {
  const kids = byParent(groups, parentId, exceptId);
  if (!kids.length) return 0;
  return Math.max(...kids.map((group) => group.sortOrder ?? 0)) + 1;
}

function moveMembers(nodes: GraphNode[], fromId: string, toId: string): GraphNode[] {
  if (fromId === toId) return nodes;
  return nodes.map((node) => (node.groupId === fromId ? { ...node, groupId: toId } : node));
}

export function memberCount(nodes: GraphNode[], groupId: string) {
  return nodes.reduce((count, node) => count + (node.groupId === groupId ? 1 : 0), 0);
}

export function descendantMemberCount(groups: GraphGroup[], nodes: GraphNode[], groupId: string) {
  const ids = new Set(subtreeIds(groups, groupId));
  ids.delete(groupId);
  return nodes.reduce((count, node) => count + (node.groupId && ids.has(node.groupId) ? 1 : 0), 0);
}

export function canAssignGroup(groups: GraphGroup[], groupId: string | null) {
  if (groupId == null) return true;
  return isMapGroup(groups, groupId);
}

/** The one leaf group a filter is showing, or null when the filter is not a single assignable group. */
export function inheritGroupFromFilter(groupFilters: string[], groups: GraphGroup[]) {
  if (groupFilters.length !== 1) return null;
  const id = groupFilters[0];
  if (!id || id === UNGROUPED_FILTER) return null;
  return canAssignGroup(groups, id) ? id : null;
}

/** Parent that can receive members after this group is removed, or null when they must be ungrouped. */
export function groupDeleteDestination(groups: GraphGroup[], id: string) {
  const group = groups.find((item) => item.id === id);
  if (!group) return null;
  const parentId = parentKey(group.parentId, group.id);
  if (!parentId) return null;
  const remove = new Set(subtreeIds(groups, id));
  const remaining = groups.filter((item) => !remove.has(item.id));
  return canAssignGroup(remaining, parentId) ? parentId : null;
}

export function addChildGroup(
  groups: GraphGroup[],
  nodes: GraphNode[],
  parentId: string | null,
  draft: { id: string; title: string; color?: string },
): GroupTreeResult {
  if (parentId && !groups.some((group) => group.id === parentId)) return { groups, nodes };
  const parent = parentId ? groups.find((group) => group.id === parentId) : undefined;
  if (isTeam(parent)) return { groups, nodes };
  const asTeam = Boolean(parent && isMapGroup(groups, parent.id));
  const child = groupDefaults({
    id: draft.id,
    title: draft.title,
    color: draft.color,
    parentId,
    sortOrder: nextSortOrder(groups, parentId),
    locked: asTeam ? false : true,
    kind: asTeam ? "team" : "group",
  });
  const nextNodes =
    parentId && !asTeam && isLeaf(groups, parentId) && !isMapGroup(groups, parentId)
      ? moveMembers(nodes, parentId, child.id)
      : nodes;
  return { groups: [...groups, child], nodes: nextNodes };
}

export function reparentGroup(
  groups: GraphGroup[],
  nodes: GraphNode[],
  id: string,
  newParentId: string | null,
): GroupTreeResult | null {
  const group = groups.find((item) => item.id === id);
  if (!group) return null;
  if (parentKey(group.parentId, group.id) === newParentId) return { groups, nodes };
  if (newParentId && !groups.some((item) => item.id === newParentId)) return null;
  if (wouldCycle(groups, id, newParentId)) return null;

  let nextNodes = nodes;
  if (newParentId && isLeaf(groups, newParentId) && !isMapGroup(groups, newParentId)) {
    const dest = firstLeafId(groups, id);
    if (!dest) return null;
    nextNodes = moveMembers(nodes, newParentId, dest);
  }

  const nextGroups = groups.map((item) =>
    item.id === id ? { ...item, parentId: newParentId, sortOrder: nextSortOrder(groups, newParentId, id) } : item,
  );
  return { groups: nextGroups, nodes: nextNodes };
}

export function deleteGroup(groups: GraphGroup[], nodes: GraphNode[], id: string): GroupTreeResult {
  const remove = new Set(subtreeIds(groups, id));
  if (!remove.size) return { groups, nodes };
  const destination = groupDeleteDestination(groups, id);
  return {
    groups: groups.filter((group) => !remove.has(group.id)),
    nodes: nodes.map((node) =>
      node.groupId && remove.has(node.groupId) ? { ...node, groupId: destination } : node,
    ),
  };
}

export function reorderSiblings(groups: GraphGroup[], parentId: string | null, orderedIds: string[]): GraphGroup[] {
  const rank = new Map<string, number>();
  let next = 0;
  for (const id of orderedIds) {
    const group = groups.find((item) => item.id === id);
    if (!group || parentKey(group.parentId, group.id) !== parentId) continue;
    rank.set(id, next);
    next += 1;
  }
  return groups.map((group) => {
    if (parentKey(group.parentId, group.id) !== parentId) return group;
    const sortOrder = rank.has(group.id) ? rank.get(group.id)! : next++;
    return (group.sortOrder ?? 0) === sortOrder ? group : { ...group, sortOrder };
  });
}

export type GroupDeleteMember = { id: string; title: string; groupTitle: string };
export type GroupDeleteImpact = {
  id: string;
  ids: string[];
  title: string;
  nestedGroups: { id: string; title: string }[];
  members: GroupDeleteMember[];
  childCount: number;
  memberCount: number;
  /** Parent title when this group has a parent, even if that parent cannot hold nodes. */
  parentTitle: string | null;
  /** Parent that will receive assigned nodes, when deleting this group leaves it as a leaf. */
  destination: { id: string; title: string } | null;
};

export function groupDeleteImpact(groups: GraphGroup[], nodes: GraphNode[], id: string): GroupDeleteImpact {
  const ids = subtreeIds(groups, id);
  const idSet = new Set(ids);
  const byId = new Map(groups.map((group) => [group.id, group]));
  const nestedGroups = ids
    .filter((groupId) => groupId !== id)
    .map((groupId) => ({ id: groupId, title: groupTitle(byId.get(groupId)?.title) }));
  const members = nodes.flatMap((node) => {
    if (!node.groupId || !idSet.has(node.groupId)) return [];
    return [
      {
        id: node.id,
        title: node.title.trim() || "Untitled",
        groupTitle: groupTitle(byId.get(node.groupId)?.title),
      },
    ];
  });
  const parentId = parentKey(byId.get(id)?.parentId, id);
  const destinationId = groupDeleteDestination(groups, id);
  const destinationGroup = destinationId ? byId.get(destinationId) : undefined;
  return {
    id,
    ids,
    title: groupTitle(byId.get(id)?.title),
    nestedGroups,
    members,
    childCount: nestedGroups.length,
    memberCount: members.length,
    parentTitle: parentId ? groupTitle(byId.get(parentId)?.title) : null,
    destination: destinationGroup ? { id: destinationGroup.id, title: groupTitle(destinationGroup.title) } : null,
  };
}
