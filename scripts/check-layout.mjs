import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearLayoutOverlaps, layoutRadius } from '../src/graph/layoutClearance.ts';

function counts(nodes, links, enlarge) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  let discs = 0, edges = 0;
  for (let i=0;i<nodes.length;i++) {
    const n=nodes[i], r=layoutRadius(n,enlarge);
    for(let j=i+1;j<nodes.length;j++) if(Math.hypot(n.x-nodes[j].x,n.y-nodes[j].y)<r+layoutRadius(nodes[j],enlarge)-0.5) discs++;
    for(const l of links) {
      const a=byId.get(typeof l.source==='string'?l.source:l.source.id), b=byId.get(typeof l.target==='string'?l.target:l.target.id);
      if(!a||!b||a===n||b===n) continue;
      const dx=b.x-a.x,dy=b.y-a.y, len=dx*dx+dy*dy;
      if(!len)continue;
      const t=Math.max(0,Math.min(1,((n.x-a.x)*dx+(n.y-a.y)*dy)/len));
      if(Math.hypot(n.x-a.x-t*dx,n.y-a.y-t*dy)<r-0.5) edges++;
    }
  }
  return {discs,edges};
}
const n=(id,x,y,extra={})=>({id,x,y,size:1,level:2,...extra});
const basic=[n('a',-40,0),n('b',40,0),n('c',0,0),n('d',0,0),n('pin',80,80,{fx:80,fy:80})];
const links=[{source:'a',target:'b'}];
for(const _ of clearLayoutOverlaps(basic,links,1)){}
assert.deepEqual(counts(basic,links,1),{discs:0,edges:0});
assert.equal(basic[4].x,80);assert.equal(basic[4].y,80);
assert.ok(basic.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
for(const _ of clearLayoutOverlaps([],[],4)){}
for(const _ of clearLayoutOverlaps([n('a',0,0)], [{source:'a',target:'missing'}],4)){}
assert.equal(layoutRadius(n('x',0,0),4),layoutRadius(n('x',0,0),1)*4);
console.log('Geometry regressions passed: coincident nodes, collinear edge, pinned node, missing endpoints, empty graph, enlargement.');
if(process.argv[2]) {
  const g=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const before=counts(g.nodes,g.links,g.settings.enlarge);
  const start=performance.now();let chunks=0,maxChunk=0;
  const work=clearLayoutOverlaps(g.nodes,g.links,g.settings.enlarge);
  for(;;){const t=performance.now();const result=work.next();maxChunk=Math.max(maxChunk,performance.now()-t);chunks++;if(result.done)break;}
  const elapsed=performance.now()-start;
  const after=counts(g.nodes,g.links,g.settings.enlarge);
  console.log(JSON.stringify({nodes:g.nodes.length,links:g.links.length,before,after,elapsedMs:Math.round(elapsed),chunks,maxChunkMs:+maxChunk.toFixed(2)}));
  assert.ok(after.discs<before.discs*0.2,'disc overlaps should fall by at least 80%');
  assert.ok(after.edges<before.edges*0.2,'node-edge overlaps should fall by at least 80%');
}
