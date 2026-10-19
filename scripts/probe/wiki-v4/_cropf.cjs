
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
 for(const g of ['copious','knit']){
  await sharp('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/'+g+'.png')
   .extract({left:0,top:0,width:1440,height:1100}).resize(1000).jpeg({quality:88})
   .toFile('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/f_'+g+'.jpg');
 }
 console.log('ok');
})();