
const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage();
  const fail=[];
  p.on('requestfailed',r=>fail.push(r.url()+' :: '+r.failure().errorText));
  await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/_mt.html');
  await p.waitForTimeout(600);
  console.log('failed='+JSON.stringify(fail));
  await p.screenshot({path:'C:/Users/19457/Desktop/Beyond_JUBEAT/src/_mt.png'});
  await b.close();
})();
