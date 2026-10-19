const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html");
  await p.waitForTimeout(900);
  const levels=[0,0.08,0.15,0.22,0.30];
  for(const a of levels){
    await p.evaluate((v)=>{ let s=document.getElementById('_lv');
      if(!s){s=document.createElement('style');s.id='_lv';document.head.appendChild(s);}
      s.textContent = v===0 ? 'body::before{display:none!important}' : ('body::before{background:linear-gradient(180deg,rgba(0,0,0,'+v+') 0%,rgba(0,0,0,'+v+') 100%)!important}');
    }, a);
    for(const k of ["knit","saucer"]){
      await p.evaluate((t)=>document.documentElement.setAttribute("data-g",t), k);
      await p.waitForTimeout(320);
      await p.screenshot({path:"C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/L"+String(a).replace('.','_')+"_"+k+".png", clip:{x:0,y:0,width:1440,height:760}});
    }
  }
  await b.close();
})();