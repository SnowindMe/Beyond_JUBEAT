const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
 for(const g of ['ave','knit']){
  await sharp('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/pg_'+g+'_2x.png')
    .resize({width:820}).jpeg({quality:52})
    .toFile('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/_chk_'+g+'.jpg');
 }
 console.log('ok');
})();