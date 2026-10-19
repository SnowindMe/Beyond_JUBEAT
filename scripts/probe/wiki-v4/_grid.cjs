
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
const fs=require('fs');
const dir='C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots';
const gens=['ave','bta','clan_blue','clan_green','clan_purple','clan_red','copious','festo','knit','prop','qubell','saucer','saucerfulfill'];
(async()=>{
  const cw=720,ch=500,cols=3,rows=Math.ceil(gens.length/cols);
  const comps=[];
  for(let i=0;i<gens.length;i++){
    const buf=await sharp(dir+'/'+gens[i]+'.png').extract({left:0,top:0,width:1440,height:1000}).resize(cw,ch,{fit:'cover'}).toBuffer();
    comps.push({input:buf,left:(i%cols)*cw,top:Math.floor(i/cols)*ch});
  }
  await sharp({create:{width:cols*cw,height:rows*ch,channels:3,background:'#222'}}).composite(comps).jpeg({quality:80}).toFile(dir+'/_all.jpg');
  for(const g of ['ave','knit','saucer','saucerfulfill']){
    await sharp(dir+'/'+g+'.png').resize(1000,694).jpeg({quality:88}).toFile(dir+'/'+g+'.jpg');
  }
  console.log('ok');
})();
