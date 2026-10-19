const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{const b=await chromium.launch();
const p=await b.newPage({viewport:{width:2848,height:1600},deviceScaleFactor:1});
await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/bg-jubeat-clean.png");
await p.evaluate(()=>{document.body.style.margin="0";document.querySelector("img").style.width="2848px";document.querySelector("img").style.height="1600px";});
await p.waitForTimeout(500);
await p.screenshot({path:"_wm_after.png", clip:{x:2100,y:1300,width:748,height:300}});
await b.close();})();