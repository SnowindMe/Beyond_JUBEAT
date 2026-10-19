const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
 const o='C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/_sheet_logo';
 for(const q of [55,48,42]){
  await sharp(o+'.jpg').resize({width:1000}).jpeg({quality:q}).toFile(o+'_s.jpg');
  const s=require('fs').statSync(o+'_s.jpg').size;
  console.log('q'+q, s);
  if(s<100000) break;
 }
})();