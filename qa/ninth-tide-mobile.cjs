const{chromium}=require('playwright');
const path=require('path'),assert=require('assert');
(async()=>{const b=await chromium.launch({headless:true,channel:process.env.QA_BROWSER_CHANNEL||'chrome'});try{
const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await c.newPage();await p.bringToFront();p.on('pageerror',e=>console.log('ERROR',e.message));
await p.goto((process.env.QA_BASE_URL||'http://127.0.0.1:5175/oneshot-testers/games')+'/the-ninth-tide.html');await p.locator('#begin').tap();await p.locator('#gesture').scrollIntoViewIfNeeded();
await p.evaluate(()=>{window.inputEvents=[];for(const type of ['pointerdown','pointerup','pointercancel','click'])document.addEventListener(type,e=>inputEvents.push({type,x:e.clientX,y:e.clientY,target:e.target.tagName+'.'+e.target.className,scroll:scrollY}));});
const r=await p.locator('#gesture').boundingBox(),cdp=await c.newCDPSession(p);console.log('rect',r);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+100,y:r.y+20}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+100,y:r.y-50}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await p.waitForFunction(()=>!locked,{},{timeout:10000,polling:100});console.log('state',await p.evaluate(()=>({node:run.node,screen,locked,events:inputEvents})));
assert.equal(await p.evaluate(()=>run.node),'letter');await p.waitForFunction(()=>getComputedStyle(document.querySelector('.scene-card')).opacity==='1',{},{polling:100});console.log('button',await p.locator('[data-choice="0"]').boundingBox());await p.locator('[data-choice="0"]').tap();console.log('after tap',await p.evaluate(()=>({node:run.node,locked,events:inputEvents})));await p.screenshot({path:path.join(__dirname,'ninth-tide-mobile-debug.png'),fullPage:true,animations:'disabled'});await p.waitForFunction(()=>run.node==='rim',{},{timeout:10000,polling:100});
await p.screenshot({path:path.join(__dirname,'ninth-tide-mobile-choices.png'),fullPage:true,animations:'disabled'});
for(const size of [{width:320,height:740},{width:768,height:1024}]){await p.setViewportSize(size);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));console.log('PASS viewport',size.width);}
console.log('PASS real touch swipe and mobile layouts');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
