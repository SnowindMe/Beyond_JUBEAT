
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{for(const k of ['ave','bta','prop','saucer']){
 await sharp('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/'+k+'.png')
  .extract({left:0,top:0,width:2160,height:1100}).resize({width:900}).jpeg({quality:82})
  .toFile('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/c_'+k+'.jpg');
}})();