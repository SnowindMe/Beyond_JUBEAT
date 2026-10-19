
const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  await p.waitForTimeout(700);
  await p.screenshot({path:'C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/full_ave.png',fullPage:true});
  const m=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  await m.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  await m.waitForTimeout(600);
  await m.screenshot({path:'C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/m_ave.png',fullPage:true});
  await b.close();
  console.log('shot');
})();
