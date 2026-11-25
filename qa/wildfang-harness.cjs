// Runs the real game script in a fresh lexical scope with DOM/canvas stubs. No duplicate combat model.
// Function parameters avoid costly VM global proxies; seeded results match the VM harness.
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../games/wildfang.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function createHarness({width=1280,height=720,touch=false,storage={}}={}){
 const nodes=new Map(),events={},noop=()=>{};
 const ctx=new Proxy({createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>k in o?o[k]:noop,set:(o,k,v)=>(o[k]=v,true)});
 function node(id){if(nodes.has(id))return nodes.get(id);const classes=new Set();const n={id,style:{setProperty:noop},dataset:{},listeners:{},classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),toggle:(v,b)=>b?classes.add(v):classes.delete(v),contains:v=>classes.has(v)},setAttribute:noop,insertAdjacentHTML:noop,querySelector:s=>node(id+' '+s),addEventListener:(k,f)=>n.listeners[k]=f,getContext:()=>ctx,setPointerCapture:noop};nodes.set(id,n);return n;}
 const box={document:{getElementById:node,querySelectorAll:()=>[],documentElement:node('root'),addEventListener:noop},innerWidth:width,innerHeight:height,devicePixelRatio:1,matchMedia:q=>({matches:touch&&q.includes('coarse')}),localStorage:{getItem:k=>storage[k],setItem:(k,v)=>storage[k]=v},performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame:noop,setTimeout:noop,console,Math,Date};box.window=box;box.addEventListener=(k,f)=>events[k]=f;

 const injection=`window.test={get g(){return game},get state(){return state},get records(){return records},startGame,update,updateEffects,render,needed,gainLevel,chooseUpgrade,doDash,doPulse,hurt,pause,resume,endGame,goHome,replayWorld,spawnBoss,spawnEnemy,makeEnemy,moveEnemy,updateEnemies,cutTail,closeLoop,closestBody,pointInPolygon,polygonArea,syncBody,shedLength,grow,armor,moveSpeed,maxLength,killEnemy,ENEMY,biomeAt,areaAt,flowAt,pressureAt,ensureChunks,eat,rank,UPGRADES,RUN,AREAS,keys,setSeed(s){seed=s;rng=mulberry(s)},resetEffects(){particle.length=rings.length=texts.length=bolts.length=0}};`;
 new Function(...Object.keys(box),script.replace('seed=1827;resize();last=',injection+'seed=1827;resize();last='))(...Object.values(box));
 return {t:box.test,node,events,storage,box};
}
module.exports={createHarness};
