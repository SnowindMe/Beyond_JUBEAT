const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html");
  await p.waitForTimeout(700);
  for(const k of ["knit","ave","festo","qubell"]){
    await p.evaluate((t)=>document.documentElement.setAttribute("data-g",t), k);
    await p.waitForTimeout(400);
    const info = await p.evaluate(()=>{
      const g=(s)=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),right:+(r.x+r.width).toFixed(1)};};
      return {wordl:g('.word-l'), lg:g('.word-l .lg'), stats:g('.stats, .home-stats, .stat-grid, .st-grid'), firstCard:g('.st, .stat'), grid:g('.albums, .art-grid, .grid'), heroCol:g('.hero-l, .hero-left'), wrap:g('.wrap')};
    });
    console.log(k, JSON.stringify(info));
  }
  await b.close();
})();