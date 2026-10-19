const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html");
  await p.waitForTimeout(900);
  for(const k of ["knit","prop","qubell","saucer"]){
    await p.evaluate((t)=>document.documentElement.setAttribute("data-g",t), k);
    await p.waitForTimeout(400);
    await p.screenshot({path:"C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/N_"+k+".png"});
  }
  await b.close();
})();