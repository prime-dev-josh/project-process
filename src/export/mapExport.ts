import { childrenOf as nodeChildren, linkEnds } from "../graph/visibility";
import { childrenOf as groupChildren, groupPath, isLeaf, rootGroups } from "../graph/groupTree";
import { groupPaintColor, groupTitle } from "../graph/groups";
import { nodeClassFromSize, nodeClassLabel } from "../graph/nodeClass";
import { KIND_LABEL } from "../graph/ops";
import { nodeWorkflowStatus, WORKFLOW_STATUS_META } from "../graph/workflowStatus";
import type { GraphGroup, GraphLink, GraphNode } from "../types";
import { csvTable } from "./csv";

export type FlowchartBox = {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "start" | "process" | "end";
  status: string;
};

export type FlowchartEdge = {
  id: string;
  from: string;
  to: string;
  arrows: GraphLink["arrows"];
  kind: GraphLink["kind"];
  label: string;
};

export type FlowchartLayout = {
  boxes: FlowchartBox[];
  edges: FlowchartEdge[];
  width: number;
  height: number;
};

export type DocSection = {
  id: string;
  number: string;
  title: string;
  depth: number;
  description: string;
  status: string;
  assignee: string;
  groupPath: string;
  nodeClass: string;
  kind: string;
  children: string[];
  inbound: string[];
  outbound: string[];
};

const BOX_W = 168;
const BOX_H = 52;
const COL_GAP = 56;
const ROW_GAP = 36;

function nodeTitle(node: GraphNode) {
  const title = node.title.trim();
  return title || "Untitled";
}

function statusLabel(node: GraphNode) {
  const id = nodeWorkflowStatus(node, "custom");
  return WORKFLOW_STATUS_META.find((item) => item.id === id)?.label ?? id;
}

function nodePath(nodes: GraphNode[], id: string): GraphNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chain: GraphNode[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

export function nodeHierarchyRoots(nodes: GraphNode[]): GraphNode[] {
  const known = new Set(nodes.map((node) => node.id));
  return nodes
    .filter((node) => !node.parentId || !known.has(node.parentId))
    .sort((a, b) => nodeTitle(a).localeCompare(nodeTitle(b)) || a.id.localeCompare(b.id));
}

export function walkNodeForest(
  nodes: GraphNode[],
  visit: (node: GraphNode, depth: number, indexPath: number[]) => void,
) {
  const walk = (parentId: string | null, depth: number, path: number[]) => {
    const kids =
      parentId == null
        ? nodeHierarchyRoots(nodes)
        : nodeChildren(nodes, parentId).sort(
            (a, b) => nodeTitle(a).localeCompare(nodeTitle(b)) || a.id.localeCompare(b.id),
          );
    kids.forEach((kid, index) => {
      const next = [...path, index + 1];
      visit(kid, depth, next);
      walk(kid.id, depth + 1, next);
    });
  };
  walk(null, 0, []);
}

export function outlineNumber(path: number[]) {
  return path.join(".");
}

export function nodeLinkLists(nodes: GraphNode[], links: GraphLink[]) {
  const titles = new Map(nodes.map((node) => [node.id, nodeTitle(node)]));
  const inbound = new Map<string, string[]>();
  const outbound = new Map<string, string[]>();
  for (const node of nodes) {
    inbound.set(node.id, []);
    outbound.set(node.id, []);
  }
  for (const link of links) {
    const ends = linkEnds(link);
    if (!titles.has(ends.source) || !titles.has(ends.target)) continue;
    outbound.get(ends.source)?.push(titles.get(ends.target) ?? ends.target);
    inbound.get(ends.target)?.push(titles.get(ends.source) ?? ends.source);
  }
  return { inbound, outbound };
}

export function buildFullCsv(nodes: GraphNode[], links: GraphLink[], groups: GraphGroup[]) {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeRows: Array<Array<string | number>> = [];
  walkNodeForest(nodes, (node, _depth, path) => {
    const groupId = node.groupId ?? "";
    nodeRows.push([
      node.id,
      nodeTitle(node),
      node.description,
      outlineNumber(path),
      node.parentId ?? "",
      node.parentId ? nodeTitle(nodeById.get(node.parentId) ?? ({ title: "" } as GraphNode)) : "",
      KIND_LABEL[node.type] ?? node.type,
      nodeClassLabel(nodeClassFromSize(node.size)),
      statusLabel(node),
      node.employee,
      node.employeeEmail,
      groupId,
      groupId ? groupPath(groups, groupId).join(" / ") : "",
      node.level,
      node.x ?? "",
      node.y ?? "",
    ]);
  });

  const groupRows: Array<Array<string | number | boolean>> = [];
  const walkGroups = (parentId: string | null, path: number[]) => {
    const kids = parentId == null ? rootGroups(groups) : groupChildren(groups, parentId);
    kids.forEach((group, index) => {
      const next = [...path, index + 1];
      groupRows.push([
        group.id,
        groupTitle(group.title),
        outlineNumber(next),
        group.parentId ?? "",
        group.parentId ? groupTitle(groupById.get(group.parentId)?.title) : "",
        groupPath(groups, group.id).join(" / "),
        isLeaf(groups, group.id) ? "group" : "folder",
        groupPaintColor(group),
        group.sortOrder ?? 0,
      ]);
      walkGroups(group.id, next);
    });
  };
  walkGroups(null, []);

  const linkRows = links.map((link) => {
    const ends = linkEnds(link);
    return [
      link.id,
      ends.source,
      nodeTitle(nodeById.get(ends.source) ?? ({ title: ends.source } as GraphNode)),
      ends.target,
      nodeTitle(nodeById.get(ends.target) ?? ({ title: ends.target } as GraphNode)),
      link.kind,
      link.arrows,
    ];
  });

  const nodesCsv = csvTable(
    [
      "id",
      "title",
      "description",
      "outline",
      "parent_id",
      "parent_title",
      "kind",
      "class",
      "status",
      "assignee",
      "assignee_email",
      "group_id",
      "group_path",
      "level",
      "x",
      "y",
    ],
    nodeRows,
  );
  const groupsCsv = csvTable(
    ["id", "title", "outline", "parent_id", "parent_title", "path", "kind", "color", "sort_order"],
    groupRows,
  );
  const linksCsv = csvTable(
    ["id", "source_id", "source_title", "target_id", "target_title", "kind", "arrows"],
    linkRows,
  );

  return ["# Nodes", nodesCsv, "", "# Groups", groupsCsv, "", "# Links", linksCsv].join("\r\n");
}

export function buildDocumentation(nodes: GraphNode[], links: GraphLink[], groups: GraphGroup[]): DocSection[] {
  const { inbound, outbound } = nodeLinkLists(nodes, links);
  const sections: DocSection[] = [];
  walkNodeForest(nodes, (node, depth, path) => {
    const groupId = node.groupId ?? null;
    sections.push({
      id: node.id,
      number: outlineNumber(path),
      title: nodeTitle(node),
      depth,
      description: node.description.trim(),
      status: statusLabel(node),
      assignee: node.employee.trim() || node.employeeEmail.trim() || "Unassigned",
      groupPath: groupId ? groupPath(groups, groupId).join(" / ") : "Ungrouped",
      nodeClass: nodeClassLabel(nodeClassFromSize(node.size)),
      kind: KIND_LABEL[node.type] ?? node.type,
      children: nodeChildren(nodes, node.id).map(nodeTitle),
      inbound: inbound.get(node.id) ?? [],
      outbound: outbound.get(node.id) ?? [],
    });
  });
  return sections;
}

function flowchartKind(node: GraphNode): FlowchartBox["kind"] {
  const cls = nodeClassFromSize(node.size);
  if (cls === "start") return "start";
  if (cls === "end") return "end";
  return "process";
}

function rankNodes(nodes: GraphNode[], links: GraphLink[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const link of links) {
    const ends = linkEnds(link);
    if (!ids.has(ends.source) || !ids.has(ends.target)) continue;
    incoming.set(ends.target, (incoming.get(ends.target) ?? 0) + 1);
    outgoing.get(ends.source)?.push(ends.target);
  }
  const rank = new Map<string, number>();
  const queue: string[] = [];
  for (const node of nodes) {
    const roots = !node.parentId || !ids.has(node.parentId);
    if ((incoming.get(node.id) ?? 0) === 0 && roots) {
      rank.set(node.id, 0);
      queue.push(node.id);
    }
  }
  if (!queue.length) {
    for (const root of nodeHierarchyRoots(nodes)) {
      rank.set(root.id, 0);
      queue.push(root.id);
    }
  }
  while (queue.length) {
    const id = queue.shift()!;
    const r = rank.get(id) ?? 0;
    for (const child of nodeChildren(nodes, id)) {
      const next = Math.max(rank.get(child.id) ?? 0, r + 1);
      if (!rank.has(child.id) || next > (rank.get(child.id) ?? 0)) {
        rank.set(child.id, next);
        queue.push(child.id);
      }
    }
    for (const target of outgoing.get(id) ?? []) {
      const next = Math.max(rank.get(target) ?? 0, r + 1);
      if (!rank.has(target) || next > (rank.get(target) ?? 0)) {
        rank.set(target, next);
        queue.push(target);
      }
    }
  }
  for (const node of nodes) {
    if (!rank.has(node.id)) {
      const depth = nodePath(nodes, node.id).length - 1;
      rank.set(node.id, Math.max(0, depth));
    }
  }
  return rank;
}

export function layoutFlowchart(nodes: GraphNode[], links: GraphLink[]): FlowchartLayout {
  if (!nodes.length) {
    return { boxes: [], edges: [], width: 800, height: 600 };
  }
  const rank = rankNodes(nodes, links);
  const columns = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const r = rank.get(node.id) ?? 0;
    const col = columns.get(r) ?? [];
    col.push(node);
    columns.set(r, col);
  }
  const ranks = [...columns.keys()].sort((a, b) => a - b);
  for (const r of ranks) {
    columns.get(r)?.sort((a, b) => nodeTitle(a).localeCompare(nodeTitle(b)) || a.id.localeCompare(b.id));
  }
  const boxes: FlowchartBox[] = [];
  const byId = new Map<string, FlowchartBox>();
  ranks.forEach((r, colIndex) => {
    const col = columns.get(r) ?? [];
    col.forEach((node, row) => {
      const box: FlowchartBox = {
        id: node.id,
        title: nodeTitle(node),
        x: 48 + colIndex * (BOX_W + COL_GAP),
        y: 48 + row * (BOX_H + ROW_GAP),
        w: BOX_W,
        h: BOX_H,
        kind: flowchartKind(node),
        status: statusLabel(node),
      };
      boxes.push(box);
      byId.set(node.id, box);
    });
  });
  const edges: FlowchartEdge[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const ends = linkEnds(link);
    if (!byId.has(ends.source) || !byId.has(ends.target)) continue;
    const key = `${ends.source}->${ends.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: link.id,
      from: ends.source,
      to: ends.target,
      arrows: link.arrows,
      kind: link.kind,
      label: link.kind === "parent" ? "" : "link",
    });
  }
  for (const node of nodes) {
    for (const child of nodeChildren(nodes, node.id)) {
      const key = `${node.id}->${child.id}`;
      if (seen.has(key) || !byId.has(node.id) || !byId.has(child.id)) continue;
      seen.add(key);
      edges.push({
        id: `parent-${node.id}-${child.id}`,
        from: node.id,
        to: child.id,
        arrows: "one",
        kind: "parent",
        label: "",
      });
    }
  }
  const maxX = boxes.reduce((m, box) => Math.max(m, box.x + box.w), 0);
  const maxY = boxes.reduce((m, box) => Math.max(m, box.y + box.h), 0);
  return { boxes, edges, width: Math.max(800, maxX + 64), height: Math.max(600, maxY + 64) };
}

export function groupForestOutline(groups: GraphGroup[]) {
  const rows: { id: string; number: string; title: string; path: string; kind: string }[] = [];
  const walk = (parentId: string | null, path: number[]) => {
    const kids = parentId == null ? rootGroups(groups) : groupChildren(groups, parentId);
    kids.forEach((group, index) => {
      const next = [...path, index + 1];
      rows.push({
        id: group.id,
        number: outlineNumber(next),
        title: groupTitle(group.title),
        path: groupPath(groups, group.id).join(" / "),
        kind: isLeaf(groups, group.id) ? "Group" : "Folder",
      });
      walk(group.id, next);
    });
  };
  walk(null, []);
  return rows;
}
