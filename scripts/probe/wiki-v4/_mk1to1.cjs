const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
const fs=require('fs');
const d='C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo/_orig';
const OUT='C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo/';
const SKIP=new Set(['clan_reextract_20251019.png']);
(async()=>{
const plan={};
for(const f of fs.readdirSync(d)){
  if(SKIP.has(f))continue;
  const k=f.replace('.png','');
  const {data,info}=await sharp(d+'/'+f).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const w=info.width,h=info.height,ch=info.channels,TH=20;
  let minX=w,minY=h,maxX=-1,maxY=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=data[(y*w+x)*ch+3]; if(a>TH){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}
  const bw=maxX-minX+1,bh=maxY-minY+1;
  const ar=bw/bh;
  let W=Math.round(Math.min(500,210*ar)); let H=Math.round(W/ar);
  if(H>210){H=210;W=Math.round(210*ar);}
  plan[k]=[W,H];
  await sharp(d+'/'+f).ensureAlpha().extract({left:minX,top:minY,width:bw,height:bh})
    .resize(W,H,{fit:'fill',kernel:'lanczos3'}).png({compressionLevel:9}).toFile(OUT+k+'.png');
  console.log(k.padEnd(15),'crop '+bw+'x'+bh+' (pad L'+minX+' T'+minY+')','-> '+W+'x'+H);
}
fs.writeFileSync('C:/Users/19457/Desktop/Beyond_JUBEAT/src/_plan.json',JSON.stringify(plan,null,1));
})();