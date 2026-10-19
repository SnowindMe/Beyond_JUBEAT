
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
 for(const g of ['copious','knit','ave','prop','qubell','festo']){
  await sharp('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/'+g+'.png')
   .extract({left:60,top:150,width:820,height:520}).resize(820).jpeg({quality:90})
   .toFile('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/w_'+g+'.jpg');
 }
 console.log('ok');
})();