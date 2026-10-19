
const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
const OUT='C:/Users/19457/Desktop/Beyond_JUBEAT/src/';
(async()=>{
  const GEN=['ave','bta','clan_blue','copious','festo','knit','prop','qubell','saucer','saucerfulfill'];
  const b=await chromium.launch();
  // 1) 2x logo sheet
  const p2=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
  await p2.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  const tiles=[];
  for(const g of GEN){
    await p2.evaluate(function(g){document.documentElement.setAttribute('data-g',g);},g);
    await p2.waitForTimeout(180);
    tiles.push(await p2.screenshot({clip:{x:60,y:110,width:620,height:280}}));
  }
  await p2.close();
  const W=1240,H=560,COLS=2;
  await sharp({create:{width:W*COLS,height:H*Math.ceil(tiles.length/COLS),channels:3,background:'#0d0d0f'}})
    .composite(tiles.map(function(t,i){return {input:t,left:(i%COLS)*W,top:Math.floor(i/COLS)*H};}))
    .png({compressionLevel:9}).toFile(OUT+'logo_sheet_2x.png');
  await sharp(OUT+'logo_sheet_2x.png').resize({width:1200}).jpeg({quality:66}).toFile(OUT+'logo_sheet_2x.jpg');

  // 2) full page preview 2x for ave + knit
  const p=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
  await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  for(const g of ['ave','knit']){
    await p.evaluate(function(g){document.documentElement.setAttribute('data-g',g);},g);
    await p.waitForTimeout(220);
    await p.screenshot({path:OUT+'shots/pg_'+g+'_2x.png',fullPage:true});
  }
  await p.close();
  await b.close();
  console.log('done');
})();