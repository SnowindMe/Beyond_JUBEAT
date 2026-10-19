
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
 for(const k of ['saucer','prop']){
  const m=await sharp('C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo/'+k+'.png').metadata();
  await sharp({create:{width:m.width,height:m.height,channels:3,background:'#ffffff'}})
   .composite([{input:'C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo/'+k+'.png',top:0,left:0}])
   .resize({width:900}).png().toFile('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/lg_'+k+'.png');
  console.log(k,m.width,m.height);
 }
})();