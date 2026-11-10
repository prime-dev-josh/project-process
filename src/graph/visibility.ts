import { UNGROUPED_FILTER, groupTitle } from "./groups";
import { groupPath, isLeaf, subtreeIds } from "./groupTree";
import { nodeWorkflowStatus, type WorkflowStatus } from "./workflowStatus";
import type { ColorBy, GraphGroup, GraphLink, GraphNode } from "../types";

export function childrenOf(nodes: GraphNode[], id: string) {
  return nodes.filter((n) => n.parentId === id);
}

export function descendantsOf(nodes: GraphNode[], id: string) {
  const out: string[] = [];
  const walk = (parentId: string) => {
    for (const child of childrenOf(nodes, parentId)) {
      out.push(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

export function linkEnds(link: GraphLink | { source: unknown; target: unknown }) {
  const src = typeof link.source === "object" && link.source && "id" in link.source
    ? String((link.source as { id: string }).id)
    : String(link.source);
  const tgt = typeof link.target === "object" && link.target && "id" in link.target
    ? String((link.target as { id: string }).id)
    : String(link.target);
  return { source: src, target: tgt };
}

export function matchesQuery(node: GraphNode, query: string) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return node.title.toLowerCase().includes(q) || node.description.toLowerCase().includes(q);
}

export function isFiltered(
  node: GraphNode,
  query: string,
  colorBy: ColorBy,
  options?: {
    statusFilters?: WorkflowStatus[];
    employeeEmail?: string | null;
    groupIds?: string[];
  },
) {
  if (!matchesQuery(node, query)) return false;
  const statusFilters = options?.statusFilters ?? [];
  if (statusFilters.length) {
    if (!statusFilters.includes(nodeWorkflowStatus(node, colorBy))) return false;
  }
  const employeeEmail = options?.employeeEmail;
  if (employeeEmail === "__unassigned__") {
    if (node.employeeEmail.trim()) return false;
  } else if (employeeEmail) {
    if (node.employeeEmail.trim().toLowerCase() !== employeeEmail.trim().toLowerCase()) return false;
  }
  const groupIds = options?.groupIds ?? [];
  if (groupIds.length) {
    const named = groupIds.filter((id) => id !== UNGROUPED_FILTER);
    const inNamed = Boolean(node.groupId && named.includes(node.groupId));
    const inUngrouped = groupIds.includes(UNGROUPED_FILTER) && !node.groupId;
    if (!inNamed && !inUngrouped) return false;
  }
  return true;
}

export type GraphFilterOptions = {
  statusFilters?: WorkflowStatus[];
  employeeEmail?: string | null;
  groupIds?: string[];
};

export function hasActiveFilters(
  query: string,
  options?: GraphFilterOptions,
) {
  return Boolean(
    query.trim() ||
      (options?.statusFilters?.length ?? 0) > 0 ||
      options?.employeeEmail != null ||
      (options?.groupIds?.length ?? 0) > 0,
  );
}

/** Groups that match the active filter (ancestors included). `null` when no filters are active. */
export function visibleGroupIdsForTree(
  groups: GraphGroup[],
  nodes: GraphNode[],
  query: string,
  colorBy: ColorBy,
  options?: GraphFilterOptions,
): Set<string> | null {
  if (!hasActiveFilters(query, options)) return null;
  const byId = new Map(groups.map((group) => [group.id, group]));
  const hit = new Set<string>();
  const q = query.trim().toLowerCase();

  const addAncestors = (id: string) => {
    let cur: string | null = id;
    while (cur) {
      hit.add(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
  };

  const titleHits = (group: GraphGroup) => {
    if (!q) return false;
    const pathStr = groupPath(groups, group.id).join(" ").toLowerCase();
    return groupTitle(group.title).toLowerCase().includes(q) || pathStr.includes(q);
  };

  for (const group of groups) {
    const titleHit = titleHits(group);
    if (isLeaf(groups, group.id)) {
      const members = nodes.filter((node) => node.groupId === group.id);
      const nodeHit = members.some((node) => isFiltered(node, query, colorBy, options));
      if (nodeHit || titleHit) addAncestors(group.id);
    } else if (titleHit) {
      addAncestors(group.id);
      for (const id of subtreeIds(groups, group.id)) hit.add(id);
    }
  }

  return hit;
}

/** Status / people / group matches only. Search dims on the canvas instead of dropping nodes. */
export function filterGraph(
  nodes: GraphNode[],
  links: GraphLink[],
  colorBy: ColorBy,
  options?: GraphFilterOptions,
) {
  if (!hasActiveFilters("", options)) return { nodes, links };
  const mapNodes = nodes.filter((node) => isFiltered(node, "", colorBy, options));
  const ids = new Set(mapNodes.map((node) => node.id));
  const mapLinks = links.filter((link) => {
    const e = linkEnds(link);
    return ids.has(e.source) && ids.has(e.target);
  });
  return { nodes: mapNodes, links: mapLinks };
}
