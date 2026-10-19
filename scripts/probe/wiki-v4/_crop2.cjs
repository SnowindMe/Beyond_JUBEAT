
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
 for(const g of ['copious','knit','ave','prop']){
  await sharp('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/'+g+'.png')
   .extract({left:0,top:0,width:760,height:420}).resize(760).jpeg({quality:90})
   .toFile('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/crop_'+g+'.jpg');
 }
 console.log('ok');
})();