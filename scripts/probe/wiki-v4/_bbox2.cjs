const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
const fs=require('fs');
const d='C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo/_orig';
(async()=>{
for(const f of fs.readdirSync(d)){
  const {data,info}=await sharp(d+'/'+f).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const w=info.width,h=info.height,ch=info.channels;
  let minX=w,minY=h,maxX=-1,maxY=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=data[(y*w+x)*ch+3]; if(a>8){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}
  if(maxX<0){console.log(f,'EMPTY');continue;}
  console.log(f, w+'x'+h, 'bbox', (maxX-minX+1)+'x'+(maxY-minY+1), 'pad L'+minX+' T'+minY+' R'+(w-1-maxX)+' B'+(h-1-maxY));
}
})();