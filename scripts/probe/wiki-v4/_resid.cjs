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
 const rows={};
 for(let y=1330;y<H;y++)for(let xx=2300;xx<W;xx++){
   const i=(y*W+xx)*4,l=L(i),s=S(i);
   if(s<=16&&l>=228&&l<=249){const key=Math.floor(y/20)*20;(rows[key]=rows[key]||[]).push(xx);}
 }
 const out=Object.entries(rows).map(([k,v])=>({y:+k,count:v.length,minX:Math.min(...v),maxX:Math.max(...v)}));
 return out;
});
console.log(JSON.stringify(out));
await b.close();})();