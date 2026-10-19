const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
const fs=require('fs');
const d='C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo/_orig';
(async()=>{
for(const f of fs.readdirSync(d)){
  const {data,info}=await sharp(d+'/'+f).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const w=info.width,h=info.height,ch=info.channels;
  const out=[];
  for(const th of [8,25,60,120]){
    let minX=w,minY=h,maxX=-1,maxY=-1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=data[(y*w+x)*ch+3]; if(a>th){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}
    out.push(th+':'+(maxX-minX+1)+'x'+(maxY-minY+1)+' L'+minX+' T'+minY);
  }
  console.log(f.padEnd(28), w+'x'+h, out.join(' | '));
}
})();