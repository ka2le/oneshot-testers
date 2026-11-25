const fs = require('fs'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(require('path').join(__dirname, '../games/the-ninth-tide.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const source = script.slice(0, script.indexOf("const STORAGE="));
const box = {console}; vm.createContext(box);
vm.runInContext(source + '\nthis.game={SCENES,ENDINGS,FRAGMENTS,ITEMS,freshState,enter,advance,options};', box);
const g = box.game, seen = new Set(), nodes = new Set(), endings = new Set(), fragments = new Set(), paths = {};
const queue = [{s:g.enter(g.freshState(),'well'), path:[]}]; let edges=0;
function key(s){return JSON.stringify([s.node,[...s.items].sort(),Object.keys(s.flags).sort().map(k=>[k,s.flags[k]])]);}
for(let cursor=0;cursor<queue.length;cursor++){
 const {s,path}=queue[cursor], k=key(s);if(seen.has(k))continue;seen.add(k);
 assert(seen.size<250000,'State space must remain bounded');
 for(const id of s.items)assert(g.ITEMS[id],`Unknown item ${id}`);
 assert(s.items.length<=3);assert.equal(new Set(s.items).size,s.items.length);
 for(const f of s.seen){assert(g.FRAGMENTS[f]);fragments.add(f);}
 if(s.node.startsWith('end:')){const id=s.node.slice(4);assert(g.ENDINGS[id]);endings.add(id);if(!paths[id])paths[id]=path;continue;}
 nodes.add(s.node);const sc=g.SCENES[s.node], opts=g.options(s);
 assert(opts.length>=1&&opts.length<=4,`${s.node}: invalid choice count`);
 const text=typeof sc.text==='function'?sc.text(s):sc.text;
 assert.equal(typeof text,'string');assert(!text.includes('undefined'));
 for(let i=0;i<opts.length;i++){
  const o=opts[i];assert.equal(typeof o.label,'string');assert.equal(typeof o.note,'string');
  assert(g.SCENES[o.to]||g.ENDINGS[o.to.replace('end:','')],`Bad target ${o.to}`);
  const before=JSON.stringify(s),next=g.advance(s,i);assert.equal(JSON.stringify(s),before,'Transitions mutate source');
  for(const item of [].concat(o.remove||[]))assert(s.items.includes(item),`${s.node} spends absent ${item}`);
  edges++;if(!seen.has(key(next)))queue.push({s:next,path:path.concat({node:s.node,choice:i+1,label:o.label})});
 }
}
assert.equal(nodes.size,Object.keys(g.SCENES).length,'Unreachable scenes: '+Object.keys(g.SCENES).filter(k=>!nodes.has(k)));
assert.equal(endings.size,10,'Every ending must be reachable');assert.equal(fragments.size,12,'Every fragment must be discoverable');
console.log(`PASS exhaustive traversal: ${seen.size} states, ${edges} choices, ${nodes.size} scenes, 10 endings, 12 fragments.`);
for(const [id,path] of Object.entries(paths))console.log(`${id}: ${path.length} choices`);
assert(paths.dawn.some(p=>p.node==='pattern'),'Best ending needs the stitch pattern');
assert(paths.dawn.some(p=>p.node==='unpick'),'Best ending must use the unpicking');
let s=g.freshState();s.node='hounds';s.items=['shield'];s=g.advance(s,0);assert.equal(s.node,'shieldbreak');assert(!s.items.includes('shield'));
s=g.freshState();s.node='hounds';s=g.advance(s,0);assert.equal(s.node,'end:hounds');
s=g.freshState();s.node='pool';s.items=['shield'];s=g.advance(s,0);assert.equal(s.node,'eels');assert(!s.items.includes('shield'));
s=g.freshState();s.node='pool';s=g.advance(s,0);assert.equal(s.node,'end:drowned');
s=g.freshState();s.node='queen';s.items=['needle'];s=g.advance(s,1);assert.equal(s.node,'queenfree');assert(!s.items.includes('needle'));
console.log('PASS shield interception, unprotected hazards, needle cost, and best-ending requirements.');
assert(!/<(?:script|link|img)\b[^>]*(?:src|href)=["']https?:/i.test(html),'File must work offline');
console.log('PASS no external asset dependencies.');
fs.writeFileSync(require('path').join(__dirname,'ninth-tide-routes.json'),JSON.stringify(paths,null,2));
