const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:2848,height:1600},deviceScaleFactor:3});
await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/bg-jubeat-clean.png");
await p.evaluate(()=>{document.body.style.margin="0";const i=document.querySelector("img");i.style.width="2848px";i.style.height="1600px";});
await p.waitForTimeout(500);
await p.screenshot({path:"_z3.png", clip:{x:2380,y:1350,width:340,height:150}});
await b.close();})();