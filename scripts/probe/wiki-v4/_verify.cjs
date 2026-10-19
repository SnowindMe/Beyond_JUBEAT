const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/bg-jubeat-clean.png");
await p.waitForTimeout(400);
const out=await p.evaluate(()=>{
 const img=document.querySelector("img"),W=img.naturalWidth,H=img.naturalHeight;
 const c=document.createElement("canvas");c.width=W;c.height=H;
 const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(img,0,0);
 const d=x.getImageData(0,0,W,H).data;
 const L=i=>0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
 const S=i=>{const r=d[i],g=d[i+1],b2=d[i+2];return Math.max(r,g,b2)-Math.min(r,g,b2);};
 let wm=0,curve=0;
 for(let y=1300;y<H;y++)for(let x=2300;x<W;x++){
   const i=(y*W+x)*4,l=L(i),s=S(i);
   if(s<=18&&l>=198&&l<=251)wm++;            // leftover light-gray text
   if(s<=24&&l>=130&&l<=196)curve++;          // surviving hairlines
 }
 return {W,H,residualWatermarkPixels:wm,survivingCurvePixels:curve};
});
console.log(JSON.stringify(out));
await b.close();})();