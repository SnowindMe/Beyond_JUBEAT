
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
 const gens=['ave','bta','prop','saucer'];
 const tiles=[];
 for(const g of gens){
   const buf=await sharp('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/'+g+'.png')
     .extract({left:0,top:0,width:2160,height:1220}).resize({width:1000}).toBuffer();
   tiles.push(buf);
 }
 const h=Math.round(1220*1000/2160);
 const canvas=sharp({create:{width:2000,height:h*2+24,channels:3,background:'#0b0f14'}});
 await canvas.composite([
   {input:tiles[0],top:0,left:0},
   {input:tiles[1],top:0,left:1000},
   {input:tiles[2],top:h+24,left:0},
   {input:tiles[3],top:h+24,left:1000}
 ]).jpeg({quality:88}).toFile('C:/Users/19457/Desktop/Beyond_JUBEAT/src/preview_logo.jpg');
 console.log('ok',h);
})();