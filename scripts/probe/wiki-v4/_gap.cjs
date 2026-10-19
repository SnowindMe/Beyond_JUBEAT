const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:2848,height:1600},deviceScaleFactor:2});
await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/bg-jubeat-clean.png");
await p.evaluate(()=>{document.body.style.margin="0";const i=document.querySelector("img");i.style.width="2848px";i.style.height="1600px";});
await p.waitForTimeout(500);
await p.screenshot({path:"_gap1.png", clip:{x:2350,y:1330,width:340,height:170}});
await p.screenshot({path:"_gap2.png", clip:{x:2600,y:1370,width:248,height:150}});
await b.close();})();