import type { GraphGroup, GraphLink, GraphNode } from "../types";
import { buildDocumentation, groupForestOutline, layoutFlowchart, type DocSection, type FlowchartLayout } from "./mapExport";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printWindow(title: string, body: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("Could not open a print view");
  }
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${printCss()}</head><body>${body}</body></html>`);
  doc.close();
  const close = () => {
    window.setTimeout(() => frame.remove(), 400);
  };
  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    close();
  };
  window.setTimeout(run, 250);
}

function printCss() {
  return `<style>
    @page { size: landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; color: #111827; background: #fff; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin: 22px 0 8px; }
    h3 { font-size: 14px; margin: 0 0 6px; }
    p, li { font-size: 12px; line-height: 1.45; }
    .muted { color: #4b5563; }
    .meta { font-size: 11px; color: #6b7280; margin-bottom: 18px; }
    .toc a { color: inherit; text-decoration: none; }
    .toc li { margin: 2px 0; }
    .section { break-inside: avoid; page-break-inside: avoid; margin: 0 0 16px; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; }
    .kv { display: grid; grid-template-columns: 88px 1fr; gap: 4px 10px; font-size: 11px; margin: 8px 0; }
    .kv dt { color: #6b7280; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .kv dd { margin: 0; }
    .chart { width: 100%; overflow: hidden; }
    svg { max-width: 100%; height: auto; }
    .doc-toc { columns: 2; column-gap: 24px; }
    @media print {
      .section { break-inside: avoid; }
    }
  </style>`;
}

function boxPath(box: FlowchartLayout["boxes"][number]) {
  const { x, y, w, h, kind } = box;
  if (kind === "start" || kind === "end") {
    const r = h / 2;
    return `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  }
  return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
}

function edgePath(layout: FlowchartLayout, fromId: string, toId: string) {
  const from = layout.boxes.find((box) => box.id === fromId);
  const to = layout.boxes.find((box) => box.id === toId);
  if (!from || !to) return "";
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

function flowchartSvg(layout: FlowchartLayout) {
  const lines = layout.edges
    .map((edge) => {
      const d = edgePath(layout, edge.from, edge.to);
      if (!d) return "";
      const marker = edge.arrows === "none" ? "" : ` marker-end="url(#arrow)"`;
      const dash = edge.kind === "cross" ? ` stroke-dasharray="6 4"` : "";
      return `<path d="${d}" fill="none" stroke="#334155" stroke-width="1.6"${marker}${dash} />`;
    })
    .join("");
  const boxes = layout.boxes
    .map((box) => {
      const fill = box.kind === "start" ? "#dcfce7" : box.kind === "end" ? "#fee2e2" : "#eff6ff";
      const stroke = box.kind === "start" ? "#16a34a" : box.kind === "end" ? "#dc2626" : "#2563eb";
      const title = escapeHtml(box.title.length > 28 ? `${box.title.slice(0, 27)}…` : box.title);
      return `<g>
        <path d="${boxPath(box)}" fill="${fill}" stroke="${stroke}" stroke-width="1.8" />
        <text x="${box.x + box.w / 2}" y="${box.y + 22}" text-anchor="middle" font-size="12" font-weight="700" fill="#0f172a">${title}</text>
        <text x="${box.x + box.w / 2}" y="${box.y + 38}" text-anchor="middle" font-size="10" fill="#475569">${escapeHtml(box.status)}</text>
      </g>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155" />
      </marker>
    </defs>
    ${lines}
    ${boxes}
  </svg>`;
}

export function printFlowchartPdf(nodes: GraphNode[], links: GraphLink[]) {
  const layout = layoutFlowchart(nodes, links);
  const body = `
    <h1>Project process flowchart</h1>
    <p class="meta">${nodes.length} nodes · ${links.length} links · generated ${escapeHtml(new Date().toLocaleString())}</p>
    <p class="muted">Start nodes are rounded green, process nodes are rectangles, end nodes are rounded red. Dashed lines are cross links.</p>
    <div class="chart">${flowchartSvg(layout)}</div>
  `;
  printWindow("Project process flowchart", body);
}

function sectionHtml(section: DocSection) {
  const indent = Math.min(section.depth, 6) * 12;
  return `<article class="section" id="n-${escapeHtml(section.id)}" style="margin-left:${indent}px">
    <h3>${escapeHtml(section.number)} ${escapeHtml(section.title)}</h3>
    <dl class="kv">
      <dt>Status</dt><dd>${escapeHtml(section.status)}</dd>
      <dt>Assignee</dt><dd>${escapeHtml(section.assignee)}</dd>
      <dt>Group</dt><dd>${escapeHtml(section.groupPath)}</dd>
      <dt>Class</dt><dd>${escapeHtml(section.nodeClass)} · ${escapeHtml(section.kind)}</dd>
      <dt>Children</dt><dd>${section.children.length ? escapeHtml(section.children.join(", ")) : "—"}</dd>
      <dt>From</dt><dd>${section.inbound.length ? escapeHtml(section.inbound.join(", ")) : "—"}</dd>
      <dt>To</dt><dd>${section.outbound.length ? escapeHtml(section.outbound.join(", ")) : "—"}</dd>
    </dl>
    <p>${section.description ? escapeHtml(section.description) : "<span class='muted'>No description.</span>"}</p>
  </article>`;
}

export function printDocumentationPdf(nodes: GraphNode[], links: GraphLink[], groups: GraphGroup[]) {
  const sections = buildDocumentation(nodes, links, groups);
  const groupRows = groupForestOutline(groups);
  const toc = sections
    .map(
      (section) =>
        `<li style="padding-left:${section.depth * 12}px"><a href="#n-${escapeHtml(section.id)}">${escapeHtml(section.number)} ${escapeHtml(section.title)}</a></li>`,
    )
    .join("");
  const groupToc = groupRows
    .map((row) => `<li>${escapeHtml(row.number)} ${escapeHtml(row.title)} <span class="muted">(${escapeHtml(row.kind)})</span></li>`)
    .join("");
  const body = `
    <h1>Project process documentation</h1>
    <p class="meta">${nodes.length} nodes · ${groups.length} groups · ${links.length} links · generated ${escapeHtml(new Date().toLocaleString())}</p>
    <h2>Table of contents</h2>
    <p class="muted">Ordered by node hierarchy. Group folders and links are listed with each node.</p>
    <ol class="toc doc-toc">${toc || "<li>No nodes</li>"}</ol>
    <h2>Group hierarchy</h2>
    <ol class="toc">${groupToc || "<li>No groups</li>"}</ol>
    <h2>Nodes</h2>
    ${sections.map(sectionHtml).join("")}
  `;
  printWindow("Project process documentation", body);
}
