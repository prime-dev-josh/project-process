import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {forceSimulation,forceManyBody,forceLink,forceCollide,forceRadial,forceCenter} from 'd3-force';
import {clearLayoutOverlaps,layoutRadius} from '../src/graph/layoutClearance.ts';
const js=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const uri=s=>'data:text/javascript;base64,'+Buffer.from(js(s)).toString('base64');
const lasso=uri(readFileSync('src/graph/lasso.ts','utf8'));
const hull=uri(readFileSync('src/graph/groupHull.ts','utf8').replace('"./lasso"',JSON.stringify(lasso)));
const {forceGroupExclusion}=await import(hull);
const src=readFileSync('src/components/GraphCanvas.tsx','utf8');
const helpers=src.slice(src.indexOf('function groupLinkCapsules('),src.indexOf('function assigneeEmail('));
const {groupFieldBodies}=await import(uri(`import {groupMemberRadius,groupFieldBlend,GROUP_LINK_CAPSULE,GROUP_MEMBRANE_PAD} from ${JSON.stringify(hull)}; const linkEnds=l=>({source:typeof l.source==='string'?l.source:l.source.id,target:typeof l.target==='string'?l.target:l.target.id}); ${helpers}; export {groupFieldBodies};`));
if (!process.argv[2]) throw new Error('Usage: node scripts/check-reorg.mjs GRAPH.json');
const original=JSON.parse(readFileSync(process.argv[2]));
function counts(nodes,links){let discs=0,edges=0; for(let i=0;i<nodes.length;i++){const n=nodes[i],r=layoutRadius(n,4);for(let j=i+1;j<nodes.length;j++)if(Math.hypot(n.x-nodes[j].x,n.y-nodes[j].y)<r+layoutRadius(nodes[j],4)-.5)discs++;for(const l of links){const a=l.source,b=l.target;if(a===n||b===n)continue;const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;if(!len)continue;const t=Math.max(0,Math.min(1,((n.x-a.x)*dx+(n.y-a.y)*dy)/len));if(Math.hypot(n.x-a.x-t*dx,n.y-a.y-t*dy)<r-.5)edges++;}}return{discs,edges};}
for(const level of [1]){const g=structuredClone(original),ns=g.nodes,ls=g.links;const byId=new Map(ns.map(n=>[n.id,n]));const charge=[-50,-100,-200][level],dist=[0,50,100][level],pad=[0,5,10][level];const cx=ns.reduce((s,n)=>s+n.x,0)/ns.length,cy=ns.reduce((s,n)=>s+n.y,0)/ns.length;
const sim=forceSimulation(ns).stop().alphaDecay(.018).velocityDecay(.32).force('center',forceCenter()).force('charge',forceManyBody().strength(charge)).force('link',forceLink(ls).id(n=>n.id).distance(l=>dist+layoutRadius(byId.get(l.source.id),4)+layoutRadius(byId.get(l.target.id),4)+24).strength(.28)).force('radial',forceRadial(n=>48+n.level*108,cx,cy).strength(.032)).force('collide',forceCollide(n=>layoutRadius(n,4)+Math.max(3,pad)+4).strength(.92).iterations(5)).force('groupField',forceGroupExclusion(live=>groupFieldBodies(live,ls,g.groups,4),n=>pad+(n.size??1)*8));const start=performance.now();sim.tick(320);const before=counts(ns,ls);for(const _ of clearLayoutOverlaps(ns,ls,4)){};console.log({level:level+1,beforeCleanup:before,afterCleanup:counts(ns,ls),elapsedMs:Math.round(performance.now()-start),alpha:sim.alpha()});}
