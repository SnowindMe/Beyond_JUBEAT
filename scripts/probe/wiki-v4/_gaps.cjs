
const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
  for(const g of ['knit','copious','ave','saucer','clan_red']){
    await p.evaluate(function(g){document.documentElement.setAttribute('data-g',g);},g);
    await p.waitForTimeout(100);
    const r=await p.evaluate(function(){
      function rc(sel){var e=document.querySelector(sel); if(!e||!e.offsetParent)return null; var b=e.getBoundingClientRect(); return {t:Math.round(b.top),b:Math.round(b.bottom),h:Math.round(b.height)};}
      var wl=document.querySelector('.word-l'); var wb=wl.getBoundingClientRect();
      var im=[].slice.call(wl.querySelectorAll('.lg')).filter(function(i){return i.offsetParent;})[0];
      var ib=im.getBoundingClientRect();
      var cs=getComputedStyle(wl), cs2=getComputedStyle(wl.parentElement);
      return {chip:rc('.chip'),word:rc('.word'),wordl:{t:Math.round(wb.top),b:Math.round(wb.bottom),h:Math.round(wb.height)},img:{t:Math.round(ib.top),b:Math.round(ib.bottom),h:Math.round(ib.height)},stat:rc('.stats'),
        wlMargin:cs.marginTop+'/'+cs.marginBottom, wordMargin:cs2.marginTop+'/'+cs2.marginBottom, wordPad:cs2.paddingTop+'/'+cs2.paddingBottom};
    });
    console.log(g, JSON.stringify(r));
  }
  await b.close();
})();