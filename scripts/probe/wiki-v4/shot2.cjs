const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
(async()=>{
  const base='file:///'+process.cwd().replace(/\\/g,'/')+'/index.html';
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1.5});
  await p.goto(base); await p.waitForTimeout(900);
  const gens=['ave','bta','clan_blue','clan_green','clan_purple','clan_red','copious','festo','knit','prop','qubell','saucer','saucerfulfill'];
  for(const g of gens){
    await p.evaluate(function(g){document.querySelectorAll('#genDock button')[['ave','bta','clan_blue','clan_green','clan_purple','clan_red','copious','festo','knit','prop','qubell','saucer','saucerfulfill'].indexOf(g)].click();},g);
    await p.waitForTimeout(700);
    await p.screenshot({path:'shots/'+g+'.png'});
  }
  const d=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}));
  const m=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:1.5});
  await m.goto(base); await m.waitForTimeout(700);
  await m.screenshot({path:'shots/mobile.png',fullPage:false});
  const dm=await m.evaluate(()=>({sw:document.documentElement.scrollWidth}));
  console.log(JSON.stringify({d,dm}));
  await b.close();
})();