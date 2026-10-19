
const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1.5});
  await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  await p.waitForTimeout(600);
  await p.screenshot({path:'C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/nav_closed.png',clip:{x:900,y:0,width:540,height:110}});
  await p.evaluate(()=>document.getElementById('tswBtn').click());
  await p.waitForTimeout(400);
  await p.screenshot({path:'C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/nav_open.png',clip:{x:900,y:0,width:540,height:340}});
  await p.evaluate(()=>document.querySelectorAll('.tsw-g button')[8].click());
  await p.waitForTimeout(500);
  const g=await p.evaluate(()=>document.documentElement.getAttribute('data-g'));
  await p.screenshot({path:'C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/nav_knit.png'});
  await p.close();
  console.log('gen after click',g);
  const m=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  await m.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  await m.waitForTimeout(500);
  await m.evaluate(()=>document.getElementById('tswBtn').click());
  await m.waitForTimeout(350);
  await m.screenshot({path:'C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/nav_m.png',clip:{x:0,y:0,width:390,height:400}});
  await b.close();
})();
