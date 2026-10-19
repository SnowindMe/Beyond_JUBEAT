
const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  await p.evaluate(function(){document.documentElement.setAttribute('data-g','knit');});
  await p.waitForTimeout(200);
  const buf=await p.screenshot({clip:{x:60,y:100,width:900,height:420}});
  await sharp(buf).jpeg({quality:78}).toFile('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/_h_knit2.jpg');
  console.log('ok');
  await b.close();
})();