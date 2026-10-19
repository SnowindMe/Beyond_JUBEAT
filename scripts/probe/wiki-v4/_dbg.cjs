
const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  await p.waitForTimeout(400);
  const info=await p.evaluate(()=>{
    const btn=document.getElementById('tswBtn');
    const cs=getComputedStyle(btn);
    const r=btn.getBoundingClientRect();
    const nav=document.querySelector('.top nav');
    return {rect:{w:r.width,h:r.height,x:r.x,y:r.y},display:cs.display,vis:cs.visibility,op:cs.opacity,navDisplay:getComputedStyle(nav).display,html:document.querySelector('.tsw').outerHTML.slice(0,200)};
  });
  console.log(JSON.stringify(info));
  await b.close();
})();
