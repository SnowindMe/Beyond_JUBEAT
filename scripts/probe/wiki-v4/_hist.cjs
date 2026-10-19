const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{
const b=await chromium.launch();
const p=await b.newPage();
await p.goto("file:///C:/Users/19457/Desktop/HSfcmMNbQAANGao.jpg");
await p.waitForTimeout(500);
const res=await p.evaluate(()=>{
  const img=document.querySelector("img");
  const c=document.createElement("canvas"); c.width=img.naturalWidth; c.height=img.naturalHeight;
  const x=c.getContext("2d"); x.drawImage(img,0,0);
  const d=x.getImageData(0,0,c.width,c.height).data;
  const hist={};
  for(let i=0;i<d.length;i+=4){
    // skip near-white
    if(d[i]>245&&d[i+1]>245&&d[i+2]>245) continue;
    const k=((d[i]>>4)<<8)|((d[i+1]>>4)<<4)|(d[i+2]>>4);
    hist[k]=(hist[k]||0)+1;
  }
  return Object.entries(hist).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([k,v])=>{
    const n=+k; return ["#"+[(n>>8)&15,(n>>4)&15,n&15].map(q=>((q<<4)+8).toString(16).padStart(2,"0")).join(""),v];
  });
});
console.log(JSON.stringify(res));
await b.close();})();