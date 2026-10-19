
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
const fs=require('fs');
const dir='C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo/';
(async()=>{
  for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.png'))){
    const s=await sharp(dir+f).metadata();
    // find alpha bbox
    const {data,info}=await sharp(dir+f).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let top=info.height,bot=-1,left=info.width,right=-1;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
      const a=data[(y*info.width+x)*4+3];
      if(a>10){if(y<top)top=y;if(y>bot)bot=y;if(x<left)left=x;if(x>right)right=x;}
    }
    console.log(f, s.width+'x'+s.height, 'bbox', left+','+top+' '+(right-left+1)+'x'+(bot-top+1),
      'padTop',top,'padBot',info.height-1-bot,'padL',left,'padR',info.width-1-right);
  }
})();