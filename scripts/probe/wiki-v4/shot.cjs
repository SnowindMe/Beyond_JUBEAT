const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
(async()=>{
  const base='file:///'+process.cwd().replace(/\\/g,'/')+'/index.html';
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
  await p.goto(base); await p.waitForTimeout(700);
  await p.screenshot({path:'shot-hd.png',fullPage:true});
  const d=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}));

  await p.evaluate(()=>document.getElementById('themeToggle').click());
  await p.waitForTimeout(600);
  await p.screenshot({path:'shot-day.png',fullPage:true});

  const m=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  await m.goto(base); await m.waitForTimeout(500);
  await m.screenshot({path:'shot-mobile.png',fullPage:true});
  const dm=await m.evaluate(()=>({sw:document.documentElement.scrollWidth}));

  const dmDay=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:'light'});
  await dmDay.goto(base); await dmDay.waitForTimeout(400);
  await dmDay.evaluate(()=>document.getElementById('themeToggle').click());
  await dmDay.waitForTimeout(400);
  await dmDay.screenshot({path:'shot-mobile-day.png',fullPage:true});
  const dmd=await dmDay.evaluate(()=>({sw:document.documentElement.scrollWidth}));

  console.log(JSON.stringify({d,dm,dmd}));
  await b.close();
})();