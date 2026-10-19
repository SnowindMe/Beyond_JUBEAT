const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1600,height:900}});
await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/bg-jubeat-profile.svg");
await p.waitForTimeout(400);
await p.screenshot({path:"bg-jubeat-profile.png"});
await b.close();})();