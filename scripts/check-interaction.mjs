import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Exercise the actual JSX pointer handler with an idle renderer and mutable
// engine nodes; no DOM, server, photo fetch, React render or SQL is involved.
const source = readFileSync(new URL('../src/components/GraphCanvas.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('GraphCanvas.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function expression(name) {
  let result;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === name) result = node.initializer.expression.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(result, `${name} exists`);
  return result;
}
function compile(expr, bindings) {
  const js = ts.transpileModule(`const handler = ${expr};`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return Function(...Object.keys(bindings), `${js}; return handler;`)(...Object.values(bindings));
}
const interaction = {current:null}, cursorGraph = {current:null}, skipBg = {current:false};
let redraws=0, center, groupDelta;
const node = {id:'node',x:0,y:0};
const graphRef = {current:{resumeAnimation:()=>redraws++,centerAt:(x,y)=>center={x,y}}};
const noReact = () => {throw Error('Gesture tried to update React hover state');};
const move = compile(expression('onPointerMove'), {
  interaction,cursorGraph,skipBg,graphRef,rotationRef:{current:0},
  graphAtClient:(x,y)=>({x,y}),zoomK:()=>1,
  moveSelected:(x,y)=>groupDelta={x,y},liveEngineNodes:()=>[node],
  rotatePoint:(x,y)=>({x,y}),setOverBadge:noReact,onHover:noReact,
  deselectBadgeAt:noReact,nodeAt:noReact,
});
interaction.current={type:'marquee',points:[{x:0,y:0}],sx0:0,sy0:0,mode:'replace'};
for(let i=1;i<=20;i++) move({clientX:i,clientY:0});
assert.deepEqual(interaction.current.points[0],{x:0,y:0});
assert.ok(interaction.current.points.length>=4,'slow pointer events retain a stroke');
assert.equal(redraws,20,'every lasso move resumes rendering');
interaction.current={type:'drag',ids:['node'],lastX:0,lastY:0,sx:0,sy:0,moved:false};
move({clientX:10,clientY:20});
assert.equal(node.x,10);assert.equal(node.y,20);assert.equal(node.fx,10);assert.equal(node.fy,20);
interaction.current={type:'group',lastX:3,lastY:4};move({clientX:13,clientY:24});
assert.deepEqual(groupDelta,{x:10,y:20});
interaction.current={type:'pan',sx:0,sy:0,cx:40,cy:50};move({clientX:10,clientY:20});
assert.deepEqual(center,{x:30,y:30});assert.equal(redraws,23);
const pause=expression('autoPauseRedraw');
for(const gesture of ['marquee','drag','group','pan']) assert.equal(compile(pause,{gesture,highlightFlow:null,refining:false}),false);
assert.equal(compile(pause,{gesture:null,highlightFlow:null,refining:false}),true);
assert.equal(compile(pause,{gesture:null,highlightFlow:null,refining:true}),false);
console.log('Interaction regressions passed: slow lasso, live drag/group/pan, zero React hover updates during gestures, gesture redraw and calm idle.');
