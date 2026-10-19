
const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
  const GEN=['ave','bta','clan_blue','copious','festo','knit','prop','qubell','saucer','saucerfulfill'];
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  const tiles=[];
  for(const g of GEN){
    await p.evaluate(function(g){document.documentElement.setAttribute('data-g',g);},g);
    await p.waitForTimeout(140);
    const buf=await p.screenshot({clip:{x:60,y:110,width:620,height:280}});
    tiles.push({g,buf});
  }
  await b.close();
  const W=620,H=280,COLS=2,ROWS=Math.ceil(tiles.length/COLS);
  const comps=[];
  tiles.forEach(function(t,i){
    comps.push({input:t.buf,left:(i%COLS)*W,top:Math.floor(i/COLS)*H});
  });
  await sharp({create:{width:W*COLS,height:H*ROWS,channels:3,background:'#101010'}}).composite(comps).jpeg({quality:70}).toFile('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/_sheet_logo.jpg');
  console.log('ok',tiles.map(t=>t.g).join(','));
})();