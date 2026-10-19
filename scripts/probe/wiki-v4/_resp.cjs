
const {chromium}=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright');
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
  const b=await chromium.launch();
  for(const vw of [1280,390]){
    const p=await b.newPage({viewport:{width:vw,height:900},deviceScaleFactor:1});
    await p.goto('file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/index.html');
    for(const g of ['knit','saucer','clan_purple']){
      await p.evaluate(function(g){document.documentElement.setAttribute('data-g',g);},g);
      await p.waitForTimeout(140);
      const r=await p.evaluate(function(){
        var im=[].slice.call(document.querySelectorAll('.word-l .lg')).filter(function(i){return i.offsetParent;})[0];
        var bb=im.getBoundingClientRect();
        return {nat:im.naturalWidth+'x'+im.naturalHeight,box:Math.round(bb.width)+'x'+Math.round(bb.height),
          overflowDoc: document.documentElement.scrollWidth > window.innerWidth};
      });
      console.log('vw'+vw, g, JSON.stringify(r));
    }
    await p.close();
  }
  await b.close();
})();