
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
  for(const g of ['ave','festo','prop','copious']){
    await sharp('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/'+g+'.png').resize(1000,694).jpeg({quality:88}).toFile('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/'+g+'.jpg');
  }
  console.log('ok');
})();