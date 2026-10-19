const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html");
  await p.waitForTimeout(900);
  const base = "body::after{z-index:-1!important}body::before{display:block!important;content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background-repeat:no-repeat;background-size:100% 100%}";
  const tests = {
    P1: base + "body::before{background-image:linear-gradient(180deg,rgba(255,255,255,.62) 0%,rgba(255,255,255,.46) 34%,rgba(255,255,255,0) 60%)}",
    P2: base + "body::before{background-image:linear-gradient(180deg,rgba(255,255,255,.78) 0%,rgba(255,255,255,.62) 32%,rgba(255,255,255,0) 58%)}",
    P3: base + "body::before{background-image:linear-gradient(180deg,rgba(255,255,255,.55) 0%,rgba(255,255,255,.55) 30%,rgba(255,255,255,0) 52%)}"
  };
  for(const [n,c] of Object.entries(tests)){
    await p.evaluate((s)=>{let e=document.getElementById('_tv');if(!e){e=document.createElement('style');e.id='_tv';document.head.appendChild(e);}e.textContent=s;}, c);
    for(const k of ["knit","prop","qubell","saucer"]){
      await p.evaluate((t)=>document.documentElement.setAttribute("data-g",t), k);
      await p.waitForTimeout(320);
      await p.screenshot({path:"C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/X_"+n+"_"+k+".png", clip:{x:0,y:0,width:1440,height:620}});
    }
  }
  await b.close();
})();