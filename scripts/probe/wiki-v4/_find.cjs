const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto("file:///C:/Users/19457/Desktop/%E5%BE%AE%E4%BF%A1%E5%9B%BE%E7%89%87_20261018223704_160_11.png");
await p.waitForTimeout(700);
const out=await p.evaluate(()=>{
  const img=document.querySelector("img");
  const W=img.naturalWidth,H=img.naturalHeight;
  const c=document.createElement("canvas");c.width=W;c.height=H;
  const x=c.getContext("2d");x.drawImage(img,0,0);
  const d=x.getImageData(0,0,W,H).data;
  // scan bottom-right quadrant for grayish text pixels (low saturation, mid luminance)
  let minX=1e9,maxX=-1,minY=1e9,maxY=-1,n=0;
  for(let y=Math.floor(H*0.85);y<H;y++)for(let xx=Math.floor(W*0.75);xx<W;xx++){
    const i=(y*W+xx)*4,r=d[i],g=d[i+1],bl=d[i+2];
    const mx=Math.max(r,g,bl),mn=Math.min(r,g,bl);
    if(mx-mn<26 && mx<246 && mx>150){n++; if(xx<minX)minX=xx; if(xx>maxX)maxX=xx; if(y<minY)minY=y; if(y>maxY)maxY=y;}
  }
  return {W,H,n,minX,maxX,minY,maxY};
});
console.log(JSON.stringify(out));
await b.close();})();