const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
  await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html");
  await p.waitForTimeout(800);
  await p.evaluate(()=>document.documentElement.setAttribute("data-g","knit"));
  await p.waitForTimeout(500);
  await p.screenshot({path:"C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/K_full.png", clip:{x:0,y:0,width:1440,height:900}});
  const info = await p.evaluate(()=>{
    const wl=document.querySelector('.word-l');
    const img=document.querySelector('.word-l .lg');
    const r1=wl.getBoundingClientRect(), r2=img?img.getBoundingClientRect():null;
    return {wl:{x:r1.x,y:r1.y,w:r1.width,h:r1.height}, img:r2?{x:r2.x,y:r2.y,w:r2.width,h:r2.height}:null,
      imgSrc: img? img.getAttribute('src'):null, natural: img? [img.naturalWidth,img.naturalHeight]:null};
  });
  console.log(JSON.stringify(info));
  await b.close();
})();