const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
  await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html");
  await p.waitForTimeout(900);
  for(const k of ["saucer","clan_blue"]){
    await p.evaluate((t)=>document.documentElement.setAttribute("data-g",t), k);
    await p.waitForTimeout(350);
    const el=await p.$(".word-l");
    await el.screenshot({path:"C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/c_"+k+".png"});
  }
  await b.close();
})();