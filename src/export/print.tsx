import {
  Defs,
  Document,
  G,
  Image,
  Link,
  Marker,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  Tspan,
  View,
  pdf,
} from "@react-pdf/renderer";
import type { SVGPresentationAttributes } from "@react-pdf/types";
import type { GraphGroup, GraphLink, GraphNode } from "../types";
import { groupColorInk } from "../graph/groups";
import {
  buildDocumentationBook,
  layoutFlowchartPages,
  wrapFlowchartTitle,
  type DocBookPart,
  type DocProcess,
  type DocStep,
  type FlowchartGroupPage,
  type FlowchartLayout,
} from "./mapExport";
import { folioFor, recordPage, type PageIndex } from "./pdfFolio";

const NAVY = "#24338a";
const ORANGE = "#f15d2a";
const INK = "#231b4b";
const MUTED = "#5462ad";
const DARK = "#231b4b";
const PAGE_W = 612;
const PAGE_H = 792;

const styles = StyleSheet.create({
  cover: { backgroundColor: DARK, fontFamily: "Helvetica", color: "#ffffff" },
  masthead: { backgroundColor: "#ffffff", paddingHorizontal: 40, paddingTop: 28, paddingBottom: 22 },
  logo: { width: 196, height: 56, objectFit: "contain" },
  footerLogoWrap: { width: 86, height: 20, justifyContent: "center" },
  footerLogo: { width: 86, height: 20, objectFit: "contain" },
  wordmark: { fontFamily: "Helvetica-Bold", fontSize: 18, letterSpacing: 3, color: "#ffffff" },
  accent: { height: 6, backgroundColor: ORANGE },
  coverBody: { flex: 1, paddingHorizontal: 40, paddingTop: 48, paddingBottom: 36, justifyContent: "space-between" },
  eyebrow: { fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 2.4, color: ORANGE },
  coverTitle: { fontFamily: "Helvetica-Bold", fontSize: 34, marginTop: 10, color: "#ffffff" },
  coverRule: { width: 52, height: 3, backgroundColor: ORANGE, marginTop: 14 },
  coverBlurb: { marginTop: 16, fontSize: 11, lineHeight: 1.4, color: "#cecedc", maxWidth: 420 },
  coverStats: { fontSize: 11, color: "#ffffff" },
  coverDate: { marginTop: 4, fontSize: 9, color: "#cecedc" },
  textPage: {
    fontFamily: "Helvetica",
    color: INK,
    paddingTop: 28,
    paddingBottom: 56,
    paddingHorizontal: 36,
  },
  sectionPage: {
    fontFamily: "Helvetica",
    color: INK,
    paddingTop: 28,
    paddingBottom: 56,
    paddingLeft: 44,
    paddingRight: 32,
  },
  railFixed: {
    position: "absolute",
    left: 14,
    top: 22,
    width: 18,
    height: 742,
    borderRadius: 5,
  },
  railLabel: {
    position: "absolute",
    width: 240,
    left: -111,
    top: 366,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 1.4,
    textAlign: "center",
    transform: "rotate(-90deg)",
  },
  footerFixed: {
    position: "absolute",
    bottom: 16,
    left: 40,
    right: 32,
    height: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 8, color: MUTED },
  footerBrand: { fontSize: 8, color: NAVY, fontFamily: "Helvetica-Bold", letterSpacing: 0.6 },
  tocTitle: { fontFamily: "Helvetica-Bold", fontSize: 16, letterSpacing: 3, textAlign: "center" },
  tocMeta: { marginTop: 3, marginBottom: 12, fontSize: 8, letterSpacing: 1.1, textAlign: "center", color: MUTED },
  tocPart: { marginBottom: 7, paddingTop: 3, paddingBottom: 2, paddingLeft: 6, paddingRight: 2, borderLeftWidth: 3 },
  tocLabel: { fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 1.2, marginBottom: 1 },
  tocLine: { flexDirection: "row", alignItems: "flex-end", marginTop: 1 },
  tocLineChild: { marginLeft: 12 },
  tocNum: { width: 36, fontSize: 9 },
  tocName: { fontSize: 9.5, color: INK, textDecoration: "none", maxWidth: "74%" },
  tocNameStrong: { fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 0.4, color: INK, textDecoration: "none", maxWidth: "78%" },
  tocLead: { flex: 1, marginHorizontal: 4, marginBottom: 2, borderBottomWidth: 0.6 },
  tocFolio: { width: 52, fontSize: 9, textAlign: "right", color: INK, textDecoration: "none" },
  partKicker: { fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 1.3, marginBottom: 1 },
  partTitle: { fontFamily: "Helvetica-Bold", fontSize: 15, marginBottom: 1 },
  partPath: { fontSize: 8, color: MUTED, marginBottom: 8 },
  chapter: { marginBottom: 8 },
  chapterTitle: { fontFamily: "Helvetica-Bold", fontSize: 11.5, lineHeight: 1.25, marginBottom: 2 },
  process: { marginTop: 8, marginBottom: 4 },
  step: { marginBottom: 6 },
  stepTitle: { fontFamily: "Helvetica-Bold", fontSize: 10.5, lineHeight: 1.25, marginBottom: 1 },
  branch: { marginTop: 3, marginBottom: 4, marginLeft: 12, paddingLeft: 8, borderLeftWidth: 1.5, borderLeftColor: "#c5c9e4" },
  branchKicker: { fontFamily: "Helvetica-Bold", fontSize: 7.5, letterSpacing: 1.1, color: MUTED, marginBottom: 1 },
  otherTitle: { fontFamily: "Helvetica-Bold", fontSize: 11.5, marginTop: 10, marginBottom: 4 },
  body: { fontSize: 10, lineHeight: 1.32, marginBottom: 1 },
  muted: { fontSize: 10, color: MUTED, fontFamily: "Helvetica-Oblique" },
  kicker: { fontSize: 8, color: MUTED, marginBottom: 6 },
  empty: { fontSize: 11, color: MUTED, marginTop: 8 },
});

function logoSrc(variant: "white" | "black" | "color") {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/prime-ae-logo-${variant}.png`;
}

function PageFooter({ label, logo }: { label: string; logo?: string }) {
  return (
    <View style={styles.footerFixed} fixed>
      {logo ? (
        <View style={styles.footerLogoWrap}>
          <Image src={logo} style={styles.footerLogo} />
        </View>
      ) : (
        <Text style={styles.footerBrand}>PRIME AE</Text>
      )}
      <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber}  /  ${totalPages}`} />
      <Text style={styles.footerText}>{label}</Text>
    </View>
  );
}

function GroupRail({ title, color }: { title: string; color: string }) {
  return (
    <View style={[styles.railFixed, { backgroundColor: color }]} fixed>
      <Text style={[styles.railLabel, { color: groupColorInk(color) }]}>{(title.trim() || "Group").toUpperCase()}</Text>
    </View>
  );
}

function Cover({
  title,
  blurb,
  stats,
  logo,
}: {
  title: string;
  blurb: string;
  stats: string;
  logo: string;
}) {
  const prepared = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  return (
    <Page size="LETTER" style={styles.cover}>
      <View style={styles.masthead}>
        {logo ? <Image src={logo} style={styles.logo} /> : <Text style={styles.wordmark}>PRIME AE</Text>}
      </View>
      <View style={styles.accent} />
      <View style={styles.coverBody}>
        <View>
          <Text style={styles.eyebrow}>PROJECT PROCESS</Text>
          <Text style={styles.coverTitle}>{title}</Text>
          <View style={styles.coverRule} />
          <Text style={styles.coverBlurb}>{blurb}</Text>
        </View>
        <View>
          <Text style={styles.coverStats}>{stats}</Text>
          <Text style={styles.coverDate}>{prepared}</Text>
        </View>
      </View>
    </Page>
  );
}

function TocLine({
  href,
  name,
  folio,
  strong,
  number,
  color,
}: {
  href: string;
  name: string;
  folio: string;
  strong?: boolean;
  number?: string;
  color: string;
}) {
  return (
    <View style={[styles.tocLine, number ? styles.tocLineChild : {}]}>
      {number ? <Text style={[styles.tocNum, { color }]}>{number}</Text> : null}
      <Link src={href} style={strong ? styles.tocNameStrong : styles.tocName}>
        {name}
      </Link>
      <View style={[styles.tocLead, { borderBottomColor: color }]} />
      <Link src={href} style={styles.tocFolio}>
        {folio || " "}
      </Link>
    </View>
  );
}

function paragraphs(text: string) {
  const chunks = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (!chunks.length) return <Text style={styles.muted}>No description.</Text>;
  return chunks.map((chunk) => (
    <Text key={chunk} style={styles.body}>
      {chunk}
    </Text>
  ));
}

function StepBlock({
  step,
  partId,
  ink,
  index,
}: {
  step: DocStep;
  partId: string;
  ink: string;
  index: PageIndex;
}) {
  const mark = (pageNumber: number) => recordPage(index, `part:${partId}`, pageNumber);
  return (
    <View id={`n-${step.id}`} style={styles.step}>
      <Text style={styles.stepTitle}>
        <Text style={{ color: ink }} render={({ pageNumber }) => { mark(pageNumber); return `${step.number}  `; }} />
        {step.title}
      </Text>
      {step.description ? paragraphs(step.description) : null}
      {step.branches.map((branch) => (
        <BranchBlock key={`${step.id}:${branch.id}`} branch={branch} partId={partId} ink={ink} index={index} />
      ))}
    </View>
  );
}

function BranchBlock({
  branch,
  partId,
  ink,
  index,
}: {
  branch: DocProcess;
  partId: string;
  ink: string;
  index: PageIndex;
}) {
  return (
    <View style={styles.branch}>
      <Text style={[styles.branchKicker, { color: ink }]}>BRANCH {branch.number}</Text>
      {branch.steps.map((step) => (
        <StepBlock key={step.id} step={step} partId={partId} ink={ink} index={index} />
      ))}
    </View>
  );
}

function ProcessBlock({
  part,
  process,
  index,
}: {
  part: DocBookPart;
  process: DocProcess;
  index: PageIndex;
}) {
  const ink = groupInk(part.color);
  const mark = (pageNumber: number) => {
    recordPage(index, `proc:${process.id}`, pageNumber);
    recordPage(index, `part:${part.id}`, pageNumber);
  };
  return (
    <View id={`proc-${process.id}`} style={styles.process}>
      <Text style={styles.chapterTitle}>
        <Text style={{ color: ink }} render={({ pageNumber }) => { mark(pageNumber); return `${process.number}  `; }} />
        {process.title}
      </Text>
      {process.steps.map((step) => (
        <StepBlock key={step.id} step={step} partId={part.id} ink={ink} index={index} />
      ))}
    </View>
  );
}

export function documentationDocument(
  parts: DocBookPart[],
  index: PageIndex,
  folios: PageIndex | null,
  logo: string,
  footerLogo = "",
) {
  const processes = parts.reduce((sum, part) => sum + part.processes.length, 0);
  return (
    <Document title="Project process documentation" author="PRIME AE" subject="Documentation" language="en" creator="Project process">
      <Cover
        title="Documentation"
        blurb="Each group is a section. Inside it, each Start node begins a process that follows links through to End nodes. Branches sit under the step they leave, and leftover nodes are collected under Other."
        stats={`${parts.length} ${parts.length === 1 ? "section" : "sections"}  ·  ${processes} ${processes === 1 ? "process" : "processes"}`}
        logo={logo}
      />
      <Page size="LETTER" style={styles.textPage} wrap>
        <PageFooter label="Documentation" logo={footerLogo} />
        <Text style={styles.tocTitle}>CONTENTS</Text>
        <Text style={styles.tocMeta}>PROJECT PROCESS DOCUMENTATION</Text>
        {parts.length ? (
          parts.map((part) => {
            const ink = groupInk(part.color);
            return (
              <View key={part.id} style={[styles.tocPart, { borderLeftColor: part.color, backgroundColor: mixHex(part.color, "#ffffff", 0.92) }]}>
                <Text style={[styles.tocLabel, { color: ink }]}>SECTION {part.number}</Text>
                <TocLine
                  href={`#part-${part.id}`}
                  name={part.title}
                  folio={folioFor(folios, `part:${part.id}`)}
                  strong
                  color={ink}
                />
                {part.processes.map((process) => (
                  <TocLine
                    key={process.id}
                    href={`#proc-${process.id}`}
                    name={process.title}
                    folio={folioFor(folios, `proc:${process.id}`)}
                    number={process.number}
                    color={ink}
                  />
                ))}
                {part.other.length ? (
                  <TocLine
                    href={`#other-${part.id}`}
                    name="Other"
                    folio={folioFor(folios, `other:${part.id}`)}
                    number={part.otherNumber}
                    color={ink}
                  />
                ) : null}
              </View>
            );
          })
        ) : (
          <Text style={styles.muted}>No nodes.</Text>
        )}
      </Page>
      {parts.map((part) => (
        <Page key={part.id} size="LETTER" style={styles.sectionPage} wrap bookmark={part.title}>
          <GroupRail title={part.title} color={part.color} />
          <PageFooter label="Documentation" logo={footerLogo} />
          <View id={`part-${part.id}`}>
            <Text style={[styles.partKicker, { color: part.color }]}>SECTION {part.number}</Text>
            <Text style={styles.partTitle}>{part.title}</Text>
            {part.path ? <Text style={styles.partPath}>{part.path}</Text> : null}
          </View>
          {part.processes.map((process) => (
            <ProcessBlock key={process.id} part={part} process={process} index={index} />
          ))}
          {part.other.length ? (
            <View id={`other-${part.id}`}>
              <Text style={styles.otherTitle}>
                <Text
                  style={{ color: groupInk(part.color) }}
                  render={({ pageNumber }) => {
                    recordPage(index, `other:${part.id}`, pageNumber);
                    recordPage(index, `part:${part.id}`, pageNumber);
                    return `${part.otherNumber}  `;
                  }}
                />
                Other
              </Text>
              {part.other.map((step) => (
                <StepBlock key={step.id} step={step} partId={part.id} ink={groupInk(part.color)} index={index} />
              ))}
            </View>
          ) : null}
        </Page>
      ))}
    </Document>
  );
}

function groupInk(color: string) {
  return groupColorInk(color) === "#fff7ed" ? color : mixHex(color, INK, 0.28);
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

function boxColors(kind: FlowchartLayout["boxes"][number]["kind"], color: string) {
  const stroke = groupColorInk(color) === "#fff7ed" ? color : mixHex(color, INK, 0.35);
  if (kind === "start") return { fill: ORANGE, stroke: mixHex(ORANGE, INK, 0.2), text: INK, sub: "rgba(35,27,75,0.8)" };
  if (kind === "end") {
    const ink = groupColorInk(color);
    return { fill: color, stroke, text: ink, sub: ink === "#fff7ed" ? "rgba(255,255,255,0.82)" : "rgba(35,27,75,0.72)" };
  }
  return { fill: "#ffffff", stroke, text: INK, sub: MUTED };
}

const svgFont = (size: number, bold = false): SVGPresentationAttributes =>
  ({ fontSize: size, fontFamily: bold ? "Helvetica-Bold" : "Helvetica" }) as SVGPresentationAttributes;

function FlowchartFigure({ layout, marker }: { layout: FlowchartLayout; marker: string }) {
  const accent = layout.color || NAVY;
  const maxW = PAGE_W - 64;
  const maxH = PAGE_H - 92;
  const scale = Math.min(maxW / layout.width, maxH / layout.height);
  const width = layout.width * scale;
  const height = layout.height * scale;
  const label = (layout.label.trim() || "Group").toUpperCase();
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
      <Defs>
        <Marker id={marker} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto">
          <Path d="M 0 0 L 10 5 L 0 10 z" fill={accent} />
        </Marker>
      </Defs>
      <Rect x={0} y={0} width={36} height={layout.height} rx={8} fill={accent} />
      <Text
        x={18}
        y={layout.height / 2}
        fill={groupColorInk(accent)}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(-90 18 ${layout.height / 2})`}
        style={svgFont(11, true)}
      >
        {label}
      </Text>
      {layout.edges.map((edge) => {
        const d = edgePath(layout, edge.from, edge.to);
        if (!d) return null;
        return (
          <Path
            key={edge.id}
            d={d}
            fill="none"
            stroke={accent}
            strokeWidth={1.6}
            strokeDasharray={edge.kind === "cross" ? "6 4" : undefined}
            markerEnd={edge.arrows === "none" ? undefined : `url(#${marker})`}
          />
        );
      })}
      {layout.boxes.map((box) => {
        const tone = boxColors(box.kind, accent);
        const lines = wrapFlowchartTitle(box.title, box.w - 22);
        const cx = box.x + box.w / 2;
        const lineH = 14;
        const firstY = box.y + (box.h - lines.length * lineH) / 2 + 11;
        return (
          <G key={box.id}>
            <Rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} fill={tone.fill} stroke={tone.stroke} strokeWidth={1.8} />
            <Text x={cx} y={firstY} textAnchor="middle" fill={tone.text} style={svgFont(12, true)}>
              {lines.map((line, lineIndex) => (
                <Tspan key={`${box.id}-${lineIndex}`} x={cx} y={firstY + lineIndex * lineH}>
                  {line}
                </Tspan>
              ))}
            </Text>
          </G>
        );
      })}
    </Svg>
  );
}

function flowchartSheets(pages: FlowchartGroupPage[]) {
  return pages.flatMap((page) => {
    const layouts = page.nodes.length ? layoutFlowchartPages(page.nodes, page.links, page.title, page.color) : [];
    if (!layouts.length) return [{ page, layout: null as FlowchartLayout | null, index: 0, count: 1 }];
    return layouts.map((layout, index) => ({ page, layout, index, count: layouts.length }));
  });
}

export function flowchartDocument(pages: FlowchartGroupPage[], logo: string, footerLogo = "") {
  const sheets = flowchartSheets(pages);
  const nodes = pages.reduce((sum, page) => sum + page.nodes.length, 0);
  return (
    <Document title="Project process flowcharts" author="PRIME AE" subject="Flowcharts" language="en" creator="Project process">
      <Cover
        title="Flowcharts"
        blurb="Top-down charts for the selected groups. A group continues on the next page instead of shrinking the titles."
        stats={`${pages.length} ${pages.length === 1 ? "group" : "groups"}  ·  ${nodes} ${nodes === 1 ? "node" : "nodes"}`}
        logo={logo}
      />
      {sheets.length ? (
        sheets.map((sheet) => {
          const continued = sheet.count > 1 ? `  ·  sheet ${sheet.index + 1} of ${sheet.count}` : "";
          const marker = `arrow-${sheet.page.groupId}-${sheet.index}`.replace(/[^a-zA-Z0-9_-]/g, "_");
          return (
            <Page key={`${sheet.page.groupId}-${sheet.index}`} size="LETTER" style={styles.textPage} bookmark={sheet.index === 0 ? sheet.page.title : undefined}>
              <PageFooter label="Flowcharts" logo={footerLogo} />
              <Text style={styles.kicker}>
                {sheet.page.path}
                {continued}
                {`  ·  ${sheet.page.nodes.length} ${sheet.page.nodes.length === 1 ? "node" : "nodes"}`}
              </Text>
              {sheet.layout && sheet.layout.boxes.length ? (
                <FlowchartFigure layout={sheet.layout} marker={marker} />
              ) : (
                <Text style={styles.empty}>No nodes in {sheet.page.title}.</Text>
              )}
            </Page>
          );
        })
      ) : (
        <Page size="LETTER" style={styles.textPage}>
          <PageFooter label="Flowcharts" logo={footerLogo} />
          <Text style={styles.empty}>No groups selected.</Text>
        </Page>
      )}
    </Document>
  );
}

export type PdfDelivery = "opened" | "downloaded";

type PdfTree = NonNullable<Parameters<typeof pdf>[0]>;

async function deliverPdf(element: PdfTree, filename: string): Promise<PdfDelivery> {
  const blob = await pdf(element).toBlob();
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank");
  if (!tab) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return tab ? "opened" : "downloaded";
}

export async function printDocumentationPdf(nodes: GraphNode[], links: GraphLink[], groups: GraphGroup[]) {
  const book = buildDocumentationBook(nodes, links, groups);
  const logo = logoSrc("color");
  const footerLogo = logoSrc("black");
  const index: PageIndex = new Map();
  await pdf(documentationDocument(book.parts, index, null, logo, footerLogo) as PdfTree).toBlob();
  const folios: PageIndex = new Map([...index].map(([id, range]) => [id, { ...range }]));
  return deliverPdf(documentationDocument(book.parts, new Map(), folios, logo, footerLogo) as PdfTree, "project-process-documentation.pdf");
}

export async function printFlowchartPdf(pages: FlowchartGroupPage[]) {
  return deliverPdf(flowchartDocument(pages, logoSrc("color"), logoSrc("black")) as PdfTree, "project-process-flowcharts.pdf");
}
