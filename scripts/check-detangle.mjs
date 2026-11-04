import ts from "typescript";
import { readFileSync } from "node:fs";

const js = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
const uri = (source) => "data:text/javascript;base64," + Buffer.from(js(source)).toString("base64");
const ends = uri(`
  export function linkEnds(link) {
    const source = typeof link.source === "object" && link.source ? String(link.source.id) : String(link.source);
    const target = typeof link.target === "object" && link.target ? String(link.target.id) : String(link.target);
    return { source, target };
  }
`);
const detangle = uri(
  readFileSync("src/graph/detangle.ts", "utf8")
    .replace('"./visibility"', JSON.stringify(ends))
    .replace('"../types"', JSON.stringify(uri("export {}"))),
);
const { detangleLayout } = await import(detangle);

const nodes = [
  { id: "a", x: 0, y: 0, fx: 0, fy: 0 },
  { id: "b", x: 4, y: 0, fx: 4, fy: 0 },
  { id: "c", x: 2, y: 1 },
];
const links = [
  { id: "l1", source: "a", target: "b" },
  { id: "l2", source: "b", target: "c" },
];
detangleLayout(nodes, links, 80, 18);
const ab = Math.hypot(nodes[1].x - nodes[0].x, nodes[1].y - nodes[0].y);
const span = Math.hypot(nodes[2].x, nodes[2].y);
if (ab < 70) throw new Error(`linked nodes stayed crushed: ${ab}`);
if (span < 20) throw new Error("layout collapsed toward the origin");
if (nodes[0].fx != null || nodes[1].fx != null) throw new Error("detangle should unpin nodes");
const canvas = readFileSync("src/components/GraphCanvas.tsx", "utf8");
if (canvas.includes("forceRadial")) throw new Error("Reorg still installs radial gravity");
if (!canvas.includes("detangleLayout")) throw new Error("GraphCanvas should call detangleLayout");
const app = readFileSync("src/App.tsx", "utf8");
if (!app.includes("detangle: true")) throw new Error("Reorg should call applyViewForces with detangle");
console.log("Detangle stretches links and does not collapse to a ball.");
