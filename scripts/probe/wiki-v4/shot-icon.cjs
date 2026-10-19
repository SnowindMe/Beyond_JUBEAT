const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:720,height:600},deviceScaleFactor:2});
 await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/_iconprev.html');
 await p.screenshot({path:'_icon.png'});
 // 512 PNG exports
 for(const n of ['icon-cube','icon-cube-diamond','icon-app']){
   const q=await b.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});
   await q.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/_svg.html?f='+n);
   await q.screenshot({path:n+'.png',omitBackground:true});
   await q.close();
 }
 await b.close();
})();