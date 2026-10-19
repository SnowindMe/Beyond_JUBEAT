
const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  for(const g of ['knit','copious','ave']){
    await p.evaluate(function(g){document.documentElement.setAttribute('data-g',g);},g);
    await p.waitForTimeout(150);
    const buf=await p.screenshot();
    await sharp(buf).resize({width:1000}).jpeg({quality:72}).toFile('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/_v_'+g+'.jpg');
  }
  await b.close();
})();