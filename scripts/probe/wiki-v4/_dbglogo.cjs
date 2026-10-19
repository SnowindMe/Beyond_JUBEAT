
const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  const fail=[];
  p.on('requestfailed',r=>fail.push(r.url()+' :: '+r.failure().errorText));
  await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  await p.waitForTimeout(800);
  const info=await p.evaluate(()=>{
    const el=document.querySelector('.word-l');
    const cs=getComputedStyle(el);
    const r=el.getBoundingClientRect();
    return {rect:{w:r.width,h:r.height},
      mask:cs.maskImage||cs.webkitMaskImage,
      maskShorthand:cs.mask, bg:cs.backgroundColor,
      display:cs.display, w:cs.width, ar:cs.aspectRatio,
      logo:getComputedStyle(document.documentElement).getPropertyValue('--logo')};
  });
  console.log(JSON.stringify(info,null,1));
  console.log('failed',JSON.stringify(fail));
  await b.close();
})();
