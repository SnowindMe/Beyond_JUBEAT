const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:700}});
await p.setContent("<body style='margin:0;background:#fff'><div style='width:1400px;height:700px;overflow:hidden;position:relative'><img src='file:///C:/Users/19457/Desktop/微信图片_20261018223704_160_11.png' style='position:absolute;left:-1300px;top:-700px;width:2848px'></div></body>");
await p.waitForTimeout(600);
await p.screenshot({path:"_wm_zoom.png"});
await b.close();})();