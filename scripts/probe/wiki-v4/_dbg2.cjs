
const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1440,height:1000}});
 await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
 for(const g of ['saucer','saucerfulfill','prop']){
   await p.evaluate(k=>{document.documentElement.setAttribute('data-g',k);document.documentElement.setAttribute('data-font',({saucer:'B',saucerfulfill:'B',prop:'D'})[k]);},g);
   await p.waitForTimeout(150);
   const i=await p.evaluate(()=>{
     const l=document.querySelector('.word-l'), t=document.querySelector('.word-t');
     const cs=getComputedStyle(l), r=l.getBoundingClientRect();
     return {lw:r.width,lh:r.height,ld:cs.display,td:getComputedStyle(t).display,
       mask:(cs.maskImage||'').slice(0,40),bg:cs.backgroundColor,ar:cs.aspectRatio};
   });
   console.log(g, JSON.stringify(i));
 }
 await b.close();
})();