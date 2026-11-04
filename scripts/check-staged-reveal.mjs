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
const staged = uri(
  readFileSync("src/graph/stagedReveal.ts", "utf8")
    .replace('"./visibility"', JSON.stringify(ends))
    .replace('"../types"', JSON.stringify(uri("export {}"))),
);
const { revealOrder, placeRevealedNode, revealedNeighbor } = await import(staged);

const nodes = [
  { id: "a", title: "Root", level: 0, parentId: null },
  { id: "b", title: "Child", level: 1, parentId: "a" },
  { id: "c", title: "Grand", level: 2, parentId: "b" },
  { id: "d", title: "Side", level: 1, parentId: null },
];
const links = [
  { id: "l1", source: "a", target: "b" },
  { id: "l2", source: "b", target: "c" },
  { id: "l3", source: "a", target: "d" },
];
const order = revealOrder(nodes, links);
if (order[0] !== "a") throw new Error(`expected root first, got ${order}`);
if (order.indexOf("a") > order.indexOf("b") || order.indexOf("b") > order.indexOf("c")) {
  throw new Error(`parent must precede child: ${order}`);
}
if (!order.includes("d") || order.length !== 4) throw new Error(`missing nodes: ${order}`);
const visible = new Set(["a"]);
const neighbor = revealedNeighbor("b", visible, nodes, links);
if (neighbor?.id !== "a") throw new Error("child should sit beside parent");
placeRevealedNode(nodes[1], neighbor, 1, 50);
if (nodes[1].x == null || Math.hypot(nodes[1].x - (neighbor.x ?? 0), nodes[1].y - (neighbor.y ?? 0)) < 30) {
  throw new Error("placed node should sit away from its neighbor");
}
console.log("Staged reveal order and placement passed.");
