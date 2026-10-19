const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:2848,height:1600}});
await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/bg-jubeat-clean.png");
await p.evaluate(()=>{document.body.style.margin="0";const i=document.querySelector("img");i.style.width="2848px";i.style.height="1600px";});
await p.waitForTimeout(500);
await p.screenshot({path:"_wm_after2.png", clip:{x:2250,y:1320,width:598,height:280}});
await b.close();})();