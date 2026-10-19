
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
 await sharp('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/saucer.png')
  .extract({left:100,top:180,width:1300,height:700}).resize({width:900}).jpeg({quality:85})
  .toFile('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/z_saucer.jpg');
})();