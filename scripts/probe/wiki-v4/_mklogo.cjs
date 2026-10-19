
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
const fs=require('fs');
const dir='D:/dsh_data/.dsh/attachments/v1/objects/';
const out='C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo/';
fs.mkdirSync(out,{recursive:true});
const SRC={
 ave:'cf/cfdbdd600dd5b03dd710702c844050c1a3a262198b020200a1db69d114944e4d',
 bta:'5d/5d0ea5063d8604f16a910912eab6527594ff10dcf1407a3c132a1e6b3d74a4df',
 saucer:'a4/a41c4bac4469091a09986ada6374d7f27de8dbb93028926ca16c9e3f13358f6b',
 prop:'f9/f9bdbd102d84da91730ad4945b425354d54be286b568dc77ab2a3cf43ade1e2a'
};
(async()=>{
 for(const k in SRC){
   const img=sharp(dir+SRC[k]).flatten({background:'#ffffff'});
   const {data,info}=await img.raw().toBuffer({resolveWithObject:true});
   const w=info.width,h=info.height,ch=info.channels;
   const buf=Buffer.alloc(w*h*4);
   let minX=w,minY=h,maxX=-1,maxY=-1;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
     const i=(y*w+x)*ch;
     const lum=0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2];
     let a=Math.round(255-lum);
     if(a<20)a=0;
     const o=(y*w+x)*4;
     buf[o]=0;buf[o+1]=0;buf[o+2]=0;buf[o+3]=a;
     if(a>0){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
   }
   const bw=maxX-minX+1,bh=maxY-minY+1;
   await sharp(buf,{raw:{width:w,height:h,channels:4}})
     .extract({left:minX,top:minY,width:bw,height:bh})
     .resize({width:Math.min(1100,bw*2),withoutEnlargement:false})
     .png({compressionLevel:9}).toFile(out+k+'.png');
   console.log(k,'->',bw+'x'+bh);
 }
})();
