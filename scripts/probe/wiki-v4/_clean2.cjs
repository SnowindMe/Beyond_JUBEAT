const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{
const b=await chromium.launch();const p=await b.newPage();
await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/src-wm.png");
await p.waitForTimeout(500);
const res=await p.evaluate(()=>{
 const img=document.querySelector("img"),W=img.naturalWidth,H=img.naturalHeight;
 const cv=document.createElement("canvas");cv.width=W;cv.height=H;
 const cx=cv.getContext("2d",{willReadFrequently:true});cx.drawImage(img,0,0);
 const id=cx.getImageData(0,0,W,H);const d=id.data;
 const L=i=>0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
 const S=i=>{const r=d[i],g=d[i+1],b2=d[i+2];return Math.max(r,g,b2)-Math.min(r,g,b2);};

 // white bg
 const s=[];for(let y=1300;y<H;y+=2)for(let x=2300;x<W;x+=2){const i=(y*W+x)*4;if(L(i)>252&&S(i)<5)s.push(d[i]);}
 s.sort((a,b)=>a-b);const bg=s[Math.floor(s.length/2)]||254;

 // text mask
 const mask=new Uint8Array(W*H);let mn=0;
 for(let y=1300;y<H;y++)for(let x=2300;x<W;x++){
   const i=(y*W+x)*4,l=L(i),sa=S(i);
   if(sa<=18&&l>=198&&l<=251){mask[y*W+x]=1;mn++;}
 }
 const md=new Uint8Array(W*H);
 for(let y=1300;y<H;y++)for(let x=2300;x<W;x++){
   if(!mask[y*W+x])continue;
   for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const yy=y+dy,xx=x+dx;if(yy>=0&&yy<H&&xx>=0&&xx<W)md[yy*W+xx]=1;}
 }

 // curve points across WHOLE image
 const pts=[];
 for(let y=0;y<H;y+=1)for(let x=0;x<W;x+=1){
   const k=y*W+x;if(md[k])continue;
   const i=k*4,l=L(i),sa=S(i);
   if(sa<=24&&l>=130&&l<=196)pts.push([x,y,l]);
 }
 function fit(P,thr){
   if(P.length<50)return null;let best=null;
   const rnd=()=>P[Math.floor(Math.random()*P.length)];
   for(let it=0;it<800;it++){
     const a=rnd(),b2=rnd(),c=rnd();
     const m=[[1,a[0],a[0]*a[0],a[1]],[1,b2[0],b2[0]*b2[0],b2[1]],[1,c[0],c[0]*c[0],c[1]]];
     let ok=true;
     for(let col=0;col<3;col++){
       let piv=col;for(let r=col+1;r<3;r++)if(Math.abs(m[r][col])>Math.abs(m[piv][col]))piv=r;
       if(Math.abs(m[piv][col])<1e-9){ok=false;break;}
       const t=m[col];m[col]=m[piv];m[piv]=t;
       for(let r=0;r<3;r++){if(r===col)continue;const f=m[r][col]/m[col][col];for(let q=col;q<4;q++)m[r][q]-=f*m[col][q];}
     }
     if(!ok)continue;
     const A=m[0][3]/m[0][0],B=m[1][3]/m[1][1],C=m[2][3]/m[2][2];
     let inl=[];for(const q of P){const yy=A+B*q[0]+C*q[0]*q[0];if(Math.abs(yy-q[1])<thr)inl.push(q);}
     if(!best||inl.length>best.inl.length)best={A,B,C,inl};
   }
   return best;
 }
 const c1=fit(pts,2.2);
 const set1=new Set(c1?c1.inl.map(q=>q[0]+","+q[1]):[]);
 const rest=pts.filter(q=>!set1.has(q[0]+","+q[1]));
 const c2=fit(rest,2.2);
 const lum=c1&&c1.inl.length?c1.inl.reduce((s,q)=>s+q[2],0)/c1.inl.length:170;

 // whiten mask
 for(let y=1300;y<H;y++)for(let x=2300;x<W;x++){
   const k=y*W+x;if(!md[k])continue;const i=k*4;d[i]=bg;d[i+1]=bg;d[i+2]=bg;d[i+3]=255;
 }
 cx.putImageData(id,0,0);

 // mask canvas
 const mcv=document.createElement("canvas");mcv.width=W;mcv.height=H;
 const mc=mcv.getContext("2d");const mi=mc.createImageData(W,H);
 for(let k=0;k<W*H;k++)if(md[k])mi.data[k*4+3]=255;
 mc.putImageData(mi,0,0);

 const lcv=document.createElement("canvas");lcv.width=W;lcv.height=H;
 const lc=lcv.getContext("2d");
 lc.strokeStyle="rgba("+Math.round(lum)+","+Math.round(lum)+","+Math.round(lum)+",0.92)";
 lc.lineWidth=1.9;lc.lineCap="round";lc.lineJoin="round";
 for(const c of [c1,c2]){
   if(!c||c.inl.length<200)continue;
   lc.beginPath();
   for(let x=0;x<=W;x+=2){const y=c.A+c.B*x+c.C*x*x;if(x===0)lc.moveTo(x,y);else lc.lineTo(x,y);}
   lc.stroke();
 }
 lc.globalCompositeOperation="destination-in";
 lc.drawImage(mcv,0,0);
 cx.drawImage(lcv,0,0);
 return {W,H,bg,mn,pts:pts.length,lum,
   c1:c1&&{A:c1.A,B:c1.B,C:c1.C,n:c1.inl.length},
   c2:c2&&{A:c2.A,B:c2.B,C:c2.C,n:c2.inl.length},
   url:cv.toDataURL("image/png")};
});
require("fs").writeFileSync("C:/Users/19457/Desktop/Beyond_JUBEAT/src/bg-jubeat-clean.png",Buffer.from(res.url.split(",")[1],"base64"));
delete res.url;
console.log(JSON.stringify(res));
await b.close();})();