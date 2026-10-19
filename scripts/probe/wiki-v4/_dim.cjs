const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
const fs=require('fs');
const d='C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo/_orig';
(async()=>{
for(const f of fs.readdirSync(d)){
  const m=await sharp(d+'/'+f).metadata();
  console.log('ORIG',f,m.width+'x'+m.height);
}
const d2='C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo';
for(const f of fs.readdirSync(d2)){ if(!f.endsWith('.png'))continue;
  const m=await sharp(d2+'/'+f).metadata();
  console.log('CUR',f,m.width+'x'+m.height);
}
})();