
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
const fs=require('fs');
const SRC='D:/dsh_data/.dsh/attachments/v1/objects';
(async()=>{
  // 找到 saucer 源图（990x187 png）
  const files=fs.readdirSync(SRC);
  const cands=[];
  for(const f of files){
    const p=SRC+'/'+f;
    try{const m=await sharp(p).metadata(); if(m.width>500&&m.height>120&&m.height<260) cands.push([f,m.width,m.height,m.format]);}catch(e){}
  }
  console.log(JSON.stringify(cands));
})();