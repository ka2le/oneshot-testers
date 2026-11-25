// Bots send steering and ability inputs to the actual single-file engine.
const {createHarness}=require('./wildfang-harness.cjs'),fs=require('fs'),path=require('path');
const arg=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.split('=')[1];
const fps=Number(arg('fps')||60),dt=1/fps,quick=process.argv.includes('--quick'),full=process.argv.includes('--full');
const profiles={
 forager:{priority:['magnet','speed','armor','feast','regen','turn','shell','salvage','light','dash','tail','pulse','molt','anchor','patience','grip','thorn','harvest'],reaction:.15,combat:false},
 hunter:{priority:['armor','speed','turn','feast','pulse','thorn','harvest','regen','tail','shell','dash','magnet','light','anchor','patience','salvage','grip','molt'],reaction:.1,combat:true},
 explorer:{priority:['speed','armor','magnet','turn','regen','shell','feast','light','tail','salvage','dash','pulse','anchor','molt','thorn','grip','patience','harvest'],reaction:.3,combat:true,roam:true},
 idle:{priority:['armor','speed','feast','regen','shell','turn','tail','salvage','magnet','pulse','thorn','light','anchor','molt','dash','grip','harvest','patience'],reaction:1,idle:true}
};
function simulate(mode,seed,mobile=false){
 const {t}=createHarness(mobile?{width:390,height:844,touch:true}:{}),p=profiles[mode];t.startGame(seed);let nextBrain=0,nextSample=0,ticks=0,orbit=null;const samples=[],areas=[0,0,0];
 while(t.state!=='ended'&&ticks++<fps*901){
  if(t.state==='upgrade'){const choices=t.g.pendingChoices.map((u,i)=>({i,w:p.priority.indexOf(u.id)+(t.rank(u.id)>1?5:0)})).sort((a,b)=>a.w-b.w);t.chooseUpgrade(choices[0].i);orbit=null;}
  const g=t.g;
  if(g.time>=nextBrain&&!p.idle){nextBrain=g.time+p.reaction;
   const near=g.enemies.filter(e=>!e.dead&&Math.hypot(e.x-g.x,e.y-g.y)<360).sort((a,b)=>Math.hypot(a.x-g.x,a.y-g.y)-Math.hypot(b.x-g.x,b.y-g.y));
   if(near.some(e=>e.trapped>0||(e.chew>.4&&e.strength>t.armor())))t.doPulse();
   if(orbit&&(orbit.enemy.dead||g.time>orbit.until||g.length<35))orbit=null;
   if(!orbit&&p.combat&&g.length>48){const e=near.find(e=>Math.hypot(e.x-g.x,e.y-g.y)<210&&e.strength<=t.armor()+(g.pulseCd<=0?3+t.rank('pulse'):0));if(e){const maxR=(g.length-6)*8/(Math.PI*2),radius=Math.min(maxR*.9,Math.max(63,e.r+43));if(radius>e.r+28){const angle=Math.atan2(g.y-e.y,g.x-e.x),heading=Math.atan2(Math.sin(g.angle-angle),Math.cos(g.angle-angle));orbit={enemy:e,x:e.x,y:e.y,r:radius,sign:heading>=0?1:-1,until:g.time+radius*2*Math.PI/t.moveSpeed()+3};}}}
   if(orbit){const dx=g.x-orbit.x,dy=g.y-orbit.y,d=Math.hypot(dx,dy)||1,rad=Math.atan2(dy,dx);g.target=rad+orbit.sign*(Math.PI/2+Math.atan((d-orbit.r)/orbit.r*2.2));if(orbit.enemy.strength>t.armor()&&Math.hypot(orbit.enemy.x-g.x,orbit.enemy.y-g.y)<100)t.doPulse();}
   else{let target=null,best=Infinity;for(const f of g.foods){const dx=f.x-g.x,dy=f.y-g.y;let cost=Math.hypot(dx,dy);if(f.type==='scrap')cost*=g.length<60?.7:2;if(f.type==='heal'&&g.length<60)cost*=.55;const ahead=dx*Math.cos(g.angle)+dy*Math.sin(g.angle);if(ahead<0)cost*=p.roam?2:1.3;for(const e of near)if(Math.hypot(e.x-f.x,e.y-f.y)<e.r+55)cost+=160;if(cost<best){best=cost;target=f;}}if(target)g.target=Math.atan2(target.y-g.y,target.x-g.x);}
   const threat=near.find(e=>Math.hypot(e.x-g.x,e.y-g.y)<e.r+48);
   if(threat){if(!orbit||Math.hypot(threat.x-g.x,threat.y-g.y)<threat.r+23){const away=Math.atan2(g.y-threat.y,g.x-threat.x);g.target=orbit?away+orbit.sign*.5:away;}t.doDash();}
   if(!orbit&&g.length<35){const opts=[0,.6,-.6,1.2,-1.2].map(a=>({a:g.target+a,area:t.areaAt(g.x+Math.cos(g.target+a)*350,g.y+Math.sin(g.target+a)*350)}));const safe=opts.find(x=>x.area===0);if(safe)g.target=safe.a;}
  }
  areas[g.area]+=dt;t.update(dt);t.updateEffects(dt);
  if(g.time>=nextSample){samples.push({time:+g.time.toFixed(1),level:g.level,xp:Math.round(g.xpEarned),length:+g.length.toFixed(1),armor:+t.armor().toFixed(1),speed:Math.round(t.moveSpeed()),score:g.score,enemies:g.enemies.length,area:g.area,phase:t.flowAt(g.time).name,pressure:+t.pressureAt(g.time,g.area,!!g.boss,g.recovery>0).toFixed(2),captures:g.stats.captures,cuts:g.stats.cuts,lost:Math.round(g.stats.lost),grown:Math.round(g.stats.grown)});nextSample+=15;}
 }
 const g=t.g;return {profile:mode,seed,mobile,fps,time:+g.time.toFixed(2),complete:g.won,level:g.level,score:g.score,kills:g.kills,wardens:g.bossDefeated,length:Math.round(g.length),xp:Math.round(g.xpEarned),firstLevel:g.levelTimes[0]??null,levelTimes:Array.from(g.levelTimes,t=>+t.toFixed(1)),stats:Object.fromEntries(Object.entries(g.stats).map(([k,v])=>[k,Math.round(v)])),areas:areas.map(Math.round),upgrades:{...g.upgrades},samples};
}
const seeds=arg('seed')?[Number(arg('seed'))]:quick?[104729]:full?[104729,3400,7331,90210,61803]:[104729,3400,7331];
const modes=arg('profile')?[arg('profile')]:quick?['forager','hunter']:Object.keys(profiles),runs=[];
if(!modes.every(m=>profiles[m])||!seeds.every(Number.isFinite)||!Number.isFinite(fps)||fps<15||fps>120)throw Error('Invalid profile, seed or FPS.');
const start=Date.now();for(const mode of modes)for(const seed of seeds){const r=simulate(mode,seed);runs.push(r);console.log(JSON.stringify({...r,samples:undefined}));}
if(full)for(const mode of ['forager','hunter']){const r=simulate(mode,seeds[0],true);runs.push(r);console.log(JSON.stringify({...r,samples:undefined}));}
const result={generatedAt:new Date().toISOString(),rules:3,engine:'wildfang.html',fps,elapsedSeconds:(Date.now()-start)/1000,config:JSON.parse(JSON.stringify(createHarness().t.RUN)),runs};
const output=path.basename(arg('out')||'flow-results.json');fs.writeFileSync(path.join(__dirname,output),JSON.stringify(result,null,2));if(output==='flow-results.json')require('./flow-report.cjs').writeReport(result);
console.log(`Saved ${runs.length} runs to qa/${output} in ${result.elapsedSeconds.toFixed(1)}s.`);
