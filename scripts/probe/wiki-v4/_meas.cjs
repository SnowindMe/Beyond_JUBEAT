
const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  const GEN=['ave','bta','clan_blue','clan_green','clan_purple','clan_red','copious','festo','knit','prop','qubell','saucer','saucerfulfill'];
  for(const g of GEN){
    await p.evaluate(function(g){document.documentElement.setAttribute('data-g',g);},g);
    await p.waitForTimeout(80);
    const r=await p.evaluate(function(){
      var im=[].slice.call(document.querySelectorAll('.word-l .lg')).filter(function(i){return i.offsetParent;})[0];
      if(!im)return null;
      var b=im.getBoundingClientRect();
      var chip=document.querySelector('.chip').getBoundingClientRect();
      var st=document.querySelector('.stats').getBoundingClientRect();
      return {nat:im.naturalWidth+'x'+im.naturalHeight, box:Math.round(b.width)+'x'+Math.round(b.height),
        scale:+(b.width/im.naturalWidth).toFixed(3),
        gapTop:Math.round(b.top-chip.bottom), gapBottom:Math.round(st.top-b.bottom)};
    });
    console.log(g, JSON.stringify(r));
  }
  await b.close();
})();