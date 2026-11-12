import type { GraphGroup, GraphLink, GraphNode } from "../types";
import { groupColorInk } from "../graph/groups";
import {
  buildDocumentationBook,
  layoutFlowchartPages,
  wrapFlowchartTitle,
  type DocBookChapter,
  type DocBookPart,
  type FlowchartGroupPage,
  type FlowchartLayout,
} from "./mapExport";

const ORANGE = "#f05d2a";
const INK = "#1c1740";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printWindow(
  title: string,
  body: string,
  orientation: "portrait" | "landscape" = "landscape",
  variant: "chart" | "book" = "chart",
) {
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
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${printCss(orientation, variant)}</head><body>${body}</body></html>`);
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

function printCss(orientation: "portrait" | "landscape", variant: "chart" | "book") {
  if (variant === "book") {
    return `<style>
      @page {
        size: letter portrait;
        margin: 14mm 16mm 16mm;
        @bottom-center {
          content: counter(page);
          font-family: Georgia, "Palatino Linotype", Palatino, serif;
          font-size: 9pt;
          letter-spacing: .18em;
          color: #5a6088;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Palatino Linotype", Palatino, "Times New Roman", serif;
        color: ${INK};
        background: #fff;
      }
      a { color: inherit; text-decoration: none; }
      .contents { break-after: page; page-break-after: always; padding: 4px 4px 12px; }
      .contents-title {
        margin: 4px 0 10px;
        text-align: center;
        font-size: 20pt;
        font-weight: 700;
        letter-spacing: .32em;
        text-transform: uppercase;
      }
      .contents-meta {
        margin: 0 0 16px;
        text-align: center;
        font-size: 9pt;
        letter-spacing: .08em;
        text-transform: uppercase;
        color: #5a6088;
      }
      .toc-part, .sheet, .sheet-rail, .part-head {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .toc-part { margin: 12px 0 6px; padding: 6px 8px 4px; border-left: 4px solid var(--group, #24328a); background: var(--group-wash, #f6f7fb); }
      .toc-part-label {
        margin: 0 0 2px;
        font-size: 8pt;
        font-weight: 700;
        letter-spacing: .24em;
        text-transform: uppercase;
        color: var(--group-ink, #24328a);
      }
      .toc-row, .toc-part-title {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin: 2px 0;
        font-size: 10.5pt;
      }
      .toc-part-title { font-size: 10pt; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
      .toc-num { flex: 0 0 1.8em; font-variant-numeric: tabular-nums; color: var(--group-ink, ${INK}); }
      .toc-name { flex: 0 1 auto; max-width: 74%; }
      .toc-lead { flex: 1 1 auto; min-width: 12px; border-bottom: 1px dotted var(--group, #8b91b3); transform: translateY(-4px); }
      .toc-folio { flex: 0 0 2.2em; text-align: right; font-variant-numeric: tabular-nums; }
      .toc-folio::after { content: target-counter(attr(href), page); }
      .toc-row { margin-left: 8px; }
      .sheet {
        display: flex;
        align-items: stretch;
        height: 247mm;
        max-height: 247mm;
        overflow: hidden;
        break-inside: avoid;
        page-break-inside: avoid;
        break-after: page;
        page-break-after: always;
      }
      .sheet.last { break-after: auto; page-break-after: auto; }
      .sheet-rail {
        flex: 0 0 30px;
        width: 30px;
        align-self: stretch;
      }
      .sheet-rail svg { display: block; width: 30px; height: 100%; }
      .sheet-body { flex: 1; min-width: 0; padding: 0 0 0 12px; overflow: hidden; }
      .part-head { margin: 0 0 8px; }
      .part-label {
        margin: 0 0 2px;
        font-size: 8pt;
        font-weight: 700;
        letter-spacing: .24em;
        text-transform: uppercase;
        color: var(--group-ink, #24328a);
      }
      .part-title {
        margin: 0;
        font-size: 14pt;
        font-weight: 700;
        letter-spacing: .03em;
        color: ${INK};
      }
      .part-path { margin: 2px 0 0; font-size: 9pt; color: #5a6088; }
      .chapter { margin: 0 0 12px; padding: 0 0 8px; }
      .chapter-title {
        margin: 0 0 5px;
        font-size: 13.5pt;
        font-weight: 700;
        line-height: 1.25;
      }
      .chapter-title .chap-no { color: var(--group-ink, #5a6088); margin-right: 8px; font-size: 12pt; letter-spacing: .08em; }
      .body { font-size: 10.5pt; line-height: 1.45; text-align: justify; hyphens: auto; }
      .body p { margin: 0 0 6px; }
      .muted { color: #5a6088; font-style: italic; }
      .meta-line {
        display: flex;
        flex-wrap: wrap;
        gap: 2px 16px;
        margin: 5px 0 0;
        padding-top: 5px;
        border-top: 1px solid var(--group-wash, #e6e8f2);
        font-size: 8.5pt;
        line-height: 1.35;
      }
      .meta-line div { white-space: nowrap; }
      .meta-line dt {
        display: inline;
        margin: 0 5px 0 0;
        font-variant: small-caps;
        letter-spacing: .05em;
        color: var(--group-ink, #5a6088);
      }
      .meta-line dd { display: inline; margin: 0; color: ${INK}; }
    </style>`;
  }
  return `<style>
    @page { size: ${orientation}; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; color: ${INK}; background: #fff; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin: 22px 0 8px; }
    p, li { font-size: 12px; line-height: 1.45; }
    .muted { color: #4b5563; }
    .meta { font-size: 11px; color: #6b7280; margin-bottom: 18px; }
    .chart { width: 100%; overflow: visible; }
    .flowchart-page svg { width: 100%; height: auto; }
    .flow-kicker { margin: 0 0 8px; font-size: 11px; letter-spacing: .02em; color: #5a6088; }
    .flowchart-page { break-after: page; page-break-after: always; }
    .flowchart-page.last { break-after: auto; page-break-after: auto; }
    .empty { padding: 24px 0; color: #6b7280; }
    @media print {
      .flowchart-page { break-after: page; page-break-after: always; }
      .flowchart-page.last { break-after: auto; page-break-after: auto; }
    }
  </style>`;
}

function edgePath(layout: FlowchartLayout, fromId: string, toId: string) {
  const from = layout.boxes.find((box) => box.id === fromId);
  const to = layout.boxes.find((box) => box.id === toId);
  if (!from || !to) return "";
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + to.w / 2;
  const y2 = to.y;
  const mid = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
}

function groupTheme(color: string) {
  const wash = mixHex(color, "#ffffff", 0.88);
  const ink = groupColorInk(color) === "#fff7ed" ? color : mixHex(color, "#1c1740", 0.28);
  return `style="--group:${color};--group-wash:${wash};--group-ink:${ink};--rail-ink:${groupColorInk(color)}"`;
}

const SHEET_BUDGET_MM = 210;
const RAIL_VIEW_H = 247;

function chapterHeightMm(chapter: DocBookChapter) {
  const body = chapter.description.trim() || " ";
  const bodyLines = Math.max(1, Math.ceil(body.length / 72));
  const titleLines = Math.max(1, Math.ceil(chapter.title.length / 52));
  return 12 + titleLines * 8 + bodyLines * 7 + 14;
}

function docRailSvg(title: string, color: string) {
  const label = escapeHtml((title.trim() || "Group").toUpperCase());
  return `<svg viewBox="0 0 30 ${RAIL_VIEW_H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="30" height="${RAIL_VIEW_H}" rx="8" fill="${color}"/>
    <text transform="translate(15 ${RAIL_VIEW_H / 2}) rotate(-90)" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, serif" font-size="11" font-weight="700" letter-spacing="1.6" fill="${groupColorInk(color)}">${label}</text>
  </svg>`;
}

function paginateChapters(chapters: DocBookChapter[], firstPageHeadMm: number) {
  const pages: DocBookChapter[][] = [];
  let bucket: DocBookChapter[] = [];
  let used = firstPageHeadMm;
  for (const chapter of chapters) {
    const need = Math.min(chapterHeightMm(chapter), SHEET_BUDGET_MM);
    if (bucket.length && used + need > SHEET_BUDGET_MM) {
      pages.push(bucket);
      bucket = [];
      used = 0;
    }
    bucket.push(chapter);
    used += need;
  }
  if (bucket.length) pages.push(bucket);
  return pages.length ? pages : [[]];
}

function mixHex(hex: string, other: string, amount: number) {
  const parse = (value: string) => {
    const raw = value.replace("#", "");
    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
  };
  const a = parse(hex);
  const b = parse(other);
  const channel = (index: number) => Math.round(a[index] + (b[index] - a[index]) * amount);
  return `#${[channel(0), channel(1), channel(2)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function boxColors(kind: FlowchartLayout["boxes"][number]["kind"], color: string) {
  const stroke = groupColorInk(color) === "#fff7ed" ? color : mixHex(color, "#1c1740", 0.35);
  if (kind === "start") return { fill: ORANGE, stroke: mixHex(ORANGE, "#1c1740", 0.2), text: "#ffffff", sub: "rgba(255,255,255,0.88)" };
  if (kind === "end") {
    const ink = groupColorInk(color);
    return { fill: color, stroke, text: ink, sub: ink === "#fff7ed" ? "rgba(255,255,255,0.82)" : "rgba(28,23,64,0.7)" };
  }
  return { fill: "#ffffff", stroke, text: INK, sub: "#5a6088" };
}

function railSvg(label: string, height: number, color: string) {
  const text = label.trim() || "Group";
  const size = Math.max(8, Math.min(14, (height - 28) / Math.max(text.length, 1) / 0.62));
  return `<g>
    <rect x="0" y="0" width="36" height="${height}" rx="8" fill="${color}" />
    <text transform="translate(18 ${height / 2}) rotate(-90)" text-anchor="middle" font-size="${size.toFixed(1)}" font-weight="700" letter-spacing="1.2" fill="${groupColorInk(color)}">${escapeHtml(text)}</text>
  </g>`;
}

function markerId(raw: string) {
  return `arrow-${raw.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function flowchartSvg(layout: FlowchartLayout, pageId: string) {
  const accent = layout.color || "#24328a";
  const arrow = markerId(pageId);
  const lines = layout.edges
    .map((edge) => {
      const d = edgePath(layout, edge.from, edge.to);
      if (!d) return "";
      const marker = edge.arrows === "none" ? "" : ` marker-end="url(#${arrow})"`;
      const dash = edge.kind === "cross" ? ` stroke-dasharray="6 4"` : "";
      return `<path d="${d}" fill="none" stroke="${accent}" stroke-width="1.6"${marker}${dash} />`;
    })
    .join("");
  const boxes = layout.boxes
    .map((box) => {
      const tone = boxColors(box.kind, accent);
      const lines = wrapFlowchartTitle(box.title, box.w - 22);
      const tspans = lines
        .map((line, index) => `<tspan x="${box.x + box.w / 2}" dy="${index === 0 ? 0 : 15}">${escapeHtml(line)}</tspan>`)
        .join("");
      return `<g>
        <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="10" fill="${tone.fill}" stroke="${tone.stroke}" stroke-width="1.8" />
        <text x="${box.x + box.w / 2}" y="${box.y + 20}" text-anchor="middle" font-size="12" font-weight="700" fill="${tone.text}">${tspans}</text>
        <text x="${box.x + box.w / 2}" y="${box.y + box.h - 10}" text-anchor="middle" font-size="10" fill="${tone.sub}">${escapeHtml(box.status)}</text>
      </g>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${layout.width} ${layout.height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="${arrow}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${accent}" />
      </marker>
    </defs>
    ${railSvg(layout.label, layout.height, accent)}
    ${lines}
    ${boxes}
  </svg>`;
}

export function printFlowchartPdf(pages: FlowchartGroupPage[]) {
  const generated = escapeHtml(new Date().toLocaleString());
  const sheets = pages.flatMap((page) => {
    const layouts = page.nodes.length ? layoutFlowchartPages(page.nodes, page.links, page.title, page.color) : [];
    if (!layouts.length) {
      return [{ page, layout: null as FlowchartLayout | null, index: 0, count: 1 }];
    }
    return layouts.map((layout, index) => ({ page, layout, index, count: layouts.length }));
  });
  const body = sheets
    .map((sheet, sheetIndex) => {
      const last = sheetIndex === sheets.length - 1 ? " last" : "";
      const continued = sheet.count > 1 ? ` · sheet ${sheet.index + 1} of ${sheet.count}` : "";
      const chart = sheet.layout
        ? `<div class="chart">${flowchartSvg(sheet.layout, `${sheet.page.groupId}-${sheet.index}`)}</div>`
        : `<p class="empty">No nodes in ${sheet.page.title} group.</p>`;
      return `<section class="flowchart-page${last}">
        <p class="flow-kicker">${escapeHtml(sheet.page.path)}${continued} · ${sheet.page.nodes.length} nodes · generated ${generated}</p>
        ${chart}
      </section>`;
    })
    .join("");
  printWindow("Project process flowcharts", body || "<h1>No groups selected</h1>", "portrait");
}

function tocRow(href: string, name: string, number?: string) {
  return `<div class="toc-row">
    ${number ? `<span class="toc-num">${escapeHtml(number)}</span>` : ""}
    <a class="toc-name" href="${href}">${escapeHtml(name)}</a>
    <span class="toc-lead" aria-hidden="true"></span>
    <a class="toc-folio" href="${href}"></a>
  </div>`;
}

function contentsHtml(parts: DocBookPart[]) {
  const blocks = parts
    .map((part) => {
      const href = `#part-${escapeHtml(part.id)}`;
      const rows = part.chapters
        .map((chapter) => tocRow(`#n-${escapeHtml(chapter.id)}`, chapter.title, `${chapter.chapter}.`))
        .join("");
      return `<div class="toc-part" ${groupTheme(part.color)}>
        <p class="toc-part-label">Section ${part.number}</p>
        <div class="toc-part-title">
          <a class="toc-name" href="${href}">${escapeHtml(part.title)}</a>
          <span class="toc-lead" aria-hidden="true"></span>
          <a class="toc-folio" href="${href}"></a>
        </div>
        ${rows}
      </div>`;
    })
    .join("");
  return `<nav class="contents">
    <h1 class="contents-title">Contents</h1>
    <p class="contents-meta">Project process documentation</p>
    ${blocks || `<p class="muted">No nodes.</p>`}
  </nav>`;
}

function paragraphsHtml(text: string) {
  const chunks = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (!chunks.length) return `<p class="muted">No description.</p>`;
  return chunks
    .map((chunk) => `<p>${escapeHtml(chunk).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function chapterHtml(chapter: DocBookChapter) {
  return `<article class="chapter" id="n-${escapeHtml(chapter.id)}">
    <h2 class="chapter-title"><span class="chap-no">${chapter.chapter}</span>${escapeHtml(chapter.title)}</h2>
    <div class="body">${paragraphsHtml(chapter.description)}</div>
    <dl class="meta-line">
      <div><dt>Assignee</dt><dd>${escapeHtml(chapter.assignee)}</dd></div>
      <div><dt>Class</dt><dd>${escapeHtml(chapter.nodeClass)}</dd></div>
      <div><dt>Kind</dt><dd>${escapeHtml(chapter.kind)}</dd></div>
    </dl>
  </article>`;
}

function partHtml(part: DocBookPart, isLastPart: boolean) {
  const pages = paginateChapters(part.chapters, 18);
  return pages
    .map((chapters, index) => {
      const last = isLastPart && index === pages.length - 1;
      const head =
        index === 0
          ? `<div class="part-head" id="part-${escapeHtml(part.id)}">
        <p class="part-label">Section ${part.number}</p>
        <h1 class="part-title">${escapeHtml(part.title)}</h1>
        <p class="part-path">${escapeHtml(part.path)}</p>
      </div>`
          : "";
      return `<section class="sheet${last ? " last" : ""}" ${groupTheme(part.color)}>
      <aside class="sheet-rail">${docRailSvg(part.title, part.color)}</aside>
      <div class="sheet-body">
        ${head}
        ${chapters.map((chapter) => chapterHtml(chapter)).join("")}
      </div>
    </section>`;
    })
    .join("");
}

export function printDocumentationPdf(nodes: GraphNode[], links: GraphLink[], groups: GraphGroup[]) {
  const book = buildDocumentationBook(nodes, links, groups);
  const parts = book.parts.map((part, index) => partHtml(part, index === book.parts.length - 1)).join("");
  printWindow("Project process documentation", `${contentsHtml(book.parts)}${parts}`, "portrait", "book");
}
