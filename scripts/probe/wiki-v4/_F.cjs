const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{
  const b=await chromium.launch();
  for(const vw of [1920,1440,1024,820]){
    const p=await b.newPage({viewport:{width:vw,height:900},deviceScaleFactor:1});
    await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html");
    await p.waitForTimeout(800);
    await p.evaluate(()=>document.documentElement.setAttribute("data-g","knit"));
    await p.waitForTimeout(400);
    const m=await p.evaluate(()=>{
      const cs=getComputedStyle(document.documentElement);
      const bef=getComputedStyle(document.body,'::before');
      const st=document.querySelector('.st');
      return {veil:cs.getPropertyValue('--veil').trim().slice(0,40), befZ:bef.zIndex, befBg:bef.backgroundImage.slice(0,30),
              cardBg:getComputedStyle(st).backgroundColor, cardZ:getComputedStyle(st).zIndex};
    });
    console.log(String(vw).padEnd(6), JSON.stringify(m));
    if([1440,820].includes(vw)) await p.screenshot({path:"C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/F_"+vw+".png"});
    await p.close();
  }
  await b.close();
})();