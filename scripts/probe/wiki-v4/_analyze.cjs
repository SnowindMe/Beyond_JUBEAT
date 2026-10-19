const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/src-wm.png");
await p.waitForTimeout(400);
const out=await p.evaluate(()=>{
 const img=document.querySelector("img"),W=img.naturalWidth,H=img.naturalHeight;
 const c=document.createElement("canvas");c.width=W;c.height=H;
 const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(img,0,0);
 const d=x.getImageData(0,0,W,H).data;
 const lum=(i)=>0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
 const sat=(i)=>{const r=d[i],g=d[i+1],b2=d[i+2];return Math.max(r,g,b2)-Math.min(r,g,b2);};
 // watermark text = light gray, near-neutral
 let bx0=1e9,bx1=-1,by0=1e9,by1=-1,n=0;
 const hist={};
 for(let y=Math.floor(H*0.85);y<H;y++)for(let xx=Math.floor(W*0.75);xx<W;xx++){
   const i=(y*W+xx)*4,L=lum(i),S=sat(i);
   if(S<22&&L>195&&L<249){n++;
     hist[Math.round(L/5)*5]=(hist[Math.round(L/5)*5]||0)+1;
     if(xx<bx0)bx0=xx;if(xx>bx1)bx1=xx;if(y<by0)by0=y;if(y>by1)by1=y;}
 }
 // darker curve pixels count in same area
 let cn=0,chist={};
 for(let y=Math.floor(H*0.85);y<H;y++)for(let xx=Math.floor(W*0.75);xx<W;xx++){
   const i=(y*W+xx)*4,L=lum(i),S=sat(i);
   if(S<25&&L>120&&L<=195){cn++;chist[Math.round(L/5)*5]=(chist[Math.round(L/5)*5]||0)+1;}
 }
 return {W,H,n,bx0,bx1,by0,by1,hist,cn,chist};
});
console.log(JSON.stringify(out));
await b.close();})();