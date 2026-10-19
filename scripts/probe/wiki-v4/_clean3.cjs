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

 const BX0=2300,BY0=1330;
 // white estimate
 const smp=[];for(let y=1200;y<H;y+=2)for(let x=2200;x<W;x+=2){const i=(y*W+x)*4;if(L(i)>252&&S(i)<5)smp.push(d[i]);}
 smp.sort((a,b)=>a-b);const bg=smp[Math.floor(smp.length/2)]||254;

 // ---- text mask: only the LIGHT glyph body (>=228), not hairline fringes
 const mask=new Uint8Array(W*H);let mn=0;
 for(let y=BY0;y<H;y++)for(let x=BX0;x<W;x++){
   const i=(y*W+x)*4,l=L(i),sa=S(i);
   if(sa<=16&&l>=228){mask[y*W+x]=1;mn++;}
 }
 const md=new Uint8Array(W*H);
 for(let y=BY0-2;y<H;y++)for(let x=BX0-2;x<W;x++){
   if(!mask[y*W+x])continue;
   for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const yy=y+dy,xx=x+dx;if(yy>0&&yy<H&&xx>0&&xx<W)md[yy*W+xx]=1;}
 }

 // ---- curve pixels (dark hairlines) over the WHOLE image, as a binary map
 const crv=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const k=y*W+x;if(md[k])continue;
   const i=k*4,l=L(i),sa=S(i);
   if(sa<=26&&l>=128&&l<=205)crv[k]=1;
 }

 // ---- connected components of curve pixels
 const comp=new Int32Array(W*H).fill(-1);
 const comps=[];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const k=y*W+x;
   if(!crv[k]||comp[k]>=0)continue;
   const idx=comps.length;const stack=[k];comp[k]=idx;const pts=[];
   while(stack.length){
     const kk=stack.pop();const px=kk%W,py=(kk-px)/W;pts.push([px,py]);
     for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
       const yy=py+dy,xx=px+dx;
       if(yy<0||yy>=H||xx<0||xx>=W)continue;
       const k2=yy*W+xx;
       if(crv[k2]&&comp[k2]<0){comp[k2]=idx;stack.push(k2);}
     }
   }
   comps.push(pts);
 }
 // ---- whiten the glyph
 for(let k=0;k<W*H;k++)if(md[k]){const i=k*4;d[i]=bg;d[i+1]=bg;d[i+2]=bg;d[i+3]=255;}
 cx.putImageData(id,0,0);

 // ---- repair: extrapolate large curve components into the masked box
 const repaired=[];
 for(const pts of comps){
   if(pts.length<300)continue;
   // check if it enters the masked box region
   const inBox=pts.some(q=>q[0]>BX0-40&&q[1]>BY0-40);
   if(!inBox)continue;
   // split into pieces by distance to mask: find endpoints (pixels with few curve neighbours)
   // simple: order points by x for extrapolation at each end
   pts.sort((a,b)=>a[0]-b[0]);
   for(const end of [0,1]){
     const seg = end===0 ? pts.slice(0,80) : pts.slice(-80);
     // local quadratic fit through the tail
     const n=seg.length;
     let sx=0,sy=0,sxx=0,sy2=0,sxy=0;
     // least squares y = a + b x + c x^2
     const A=[[0,0,0],[0,0,0],[0,0,0]],B=[0,0,0];
     for(const q of seg){
       const xs=[1,q[0],q[0]*q[0]];
       for(let r=0;r<3;r++){for(let c2=0;c2<3;c2++)A[r][c2]+=xs[r]*xs[c2];B[r]+=xs[r]*q[1];}
     }
     let ok=true;
     for(let col=0;col<3;col++){
       let piv=col;for(let r=col+1;r<3;r++)if(Math.abs(A[r][col])>Math.abs(A[piv][col]))piv=r;
       if(Math.abs(A[piv][col])<1e-9){ok=false;break;}
       const t=A[col];A[col]=A[piv];A[piv]=t;const tb=B[col];B[col]=B[piv];B[piv]=tb;
       for(let r=0;r<3;r++){if(r===col)continue;const f=A[r][col]/A[col][col];for(let c2=col;c2<3;c2++)A[r][c2]-=f*A[col][c2];B[r]-=f*B[col];}
     }
     if(!ok)continue;
     const a=B[0]/A[0][0],bb=B[1]/A[1][1],cc=B[2]/A[2][2];
     // mean luminance of tail
     let lum=0,cnt2=0,wsum=0;
     for(const q of seg){const i=(q[1]*W+q[0])*4;const l=L(i);lum+=l;cnt2++;}
     lum/=Math.max(cnt2,1);
     // walk outward from the tail end until leaving the mask box
     const dirx = end===0 ? -1 : 1;
     const startX = end===0 ? seg[0][0] : seg[n-1][0];
     const path=[];
     for(let step=0;step<420;step++){
       const x=startX+dirx*step;
       if(x<0||x>=W)break;
       const y=a+bb*x+cc*x*x;
       path.push([x,y]);
       // stop once we've left the masked area
       const kk=Math.round(y)*W+Math.round(x);
       if(kk>=0&&kk<W*H&&!md[kk]){ if(step>4) break; }
     }
     if(path.length>3) repaired.push({path,lum});
   }
 }
 // paint repaired paths, clipped to mask
 const mcv=document.createElement("canvas");mcv.width=W;mcv.height=H;
 const mc=mcv.getContext("2d");const mi=mc.createImageData(W,H);
 for(let k=0;k<W*H;k++)if(md[k])mi.data[k*4+3]=255;
 mc.putImageData(mi,0,0);

 const lcv=document.createElement("canvas");lcv.width=W;lcv.height=H;
 const lc=lcv.getContext("2d");
 for(const r of repaired){
   if(r.lum>235) continue;
   lc.strokeStyle="rgba("+Math.round(r.lum)+","+Math.round(r.lum)+","+Math.round(r.lum)+",0.9)";
   lc.lineWidth=1.9;lc.lineCap="round";lc.lineJoin="round";
   lc.beginPath();
   r.path.forEach((q,i)=>i?lc.lineTo(q[0],q[1]):lc.moveTo(q[0],q[1]));
   lc.stroke();
 }
 lc.globalCompositeOperation="destination-in";
 lc.drawImage(mcv,0,0);
 cx.drawImage(lcv,0,0);

 return {W,H,bg,maskPx:mn,comps:comps.length,big:comps.filter(c=>c.length>300).length,repaired:repaired.length,url:cv.toDataURL("image/png")};
});
require("fs").writeFileSync("C:/Users/19457/Desktop/Beyond_JUBEAT/src/bg-jubeat-clean.png",Buffer.from(res.url.split(",")[1],"base64"));
delete res.url;console.log(JSON.stringify(res));
await b.close();})();