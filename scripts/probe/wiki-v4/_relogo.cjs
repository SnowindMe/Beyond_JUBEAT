
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
const fs=require('fs'),path=require('path');
const dir='C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo';
(async()=>{
  for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.png'))){
    const p=path.join(dir,f);
    const m=await sharp(p).metadata();
    console.log(f,m.format,m.width,m.height,'depth='+m.depth,'space='+m.space,'alpha='+m.hasAlpha,'ch='+m.channels);
    const w=Math.min(m.width,700);
    const buf=await sharp(p).resize({width:w,fit:'inside',withoutEnlargement:true})
      .toColorspace('srgb').png({compressionLevel:9,adaptiveFiltering:true,force:true}).toBuffer();
    fs.writeFileSync(p,buf);
    console.log('  -> rewrote',buf.length,'bytes');
  }
})();
