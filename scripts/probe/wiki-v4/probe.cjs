const { chromium } = require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844}});
  await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  const bad=await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('*').forEach(el=>{
      const r=el.getBoundingClientRect();
      if(r.right>391.5) out.push(el.tagName+'.'+el.className+' -> '+Math.round(r.right)+' w:'+Math.round(r.width));
    });
    return out.slice(0,20);
  });
  console.log(JSON.stringify(bad,null,1));
  await b.close();
})();