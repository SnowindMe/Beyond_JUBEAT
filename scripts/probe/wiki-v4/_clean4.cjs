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
 // text mask
 const mask=new Uint8Array(W*H);let mn=0;
 for(let y=BY0;y<H;y++)for(let x=BX0;x<W;x++){
   const i=(y*W+x)*4,l=L(i),sa=S(i);
   if(sa<=16&&l>=222){mask[y*W+x]=1;mn++;}
 }
 const md=new Uint8Array(W*H);
 for(let y=BY0-3;y<H;y++)for(let x=BX0-3;x<W;x++){
   if(!mask[y*W+x])continue;
   for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const yy=y+dy,xx=x+dx;if(yy>=0&&yy<H&&xx>=0&&xx<W)md[yy*W+xx]=1;}
 }

 // curve pixels outside the mask
 const pts=[];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const k=y*W+x;if(md[k])continue;
   const i=k*4,l=L(i),sa=S(i);
   if(sa<=26&&l>=126&&l<=212)pts.push([x,y,Math.round(l)]);
 }

 // RANSAC repeatedly to peel off individual arcs
 function fitR(P,thr,iters){
   let best=null;const rnd=()=>P[Math.floor(Math.random()*P.length)];
   for(let it=0;it<iters;it++){
     const a=rnd(),b2=rnd(),c=rnd();
     if(Math.abs(a[0]-b2[0])<8||Math.abs(b2[0]-c[0])<8)continue;
     const A=[[1,a[0],a[0]*a[0],a[1]],[1,b2[0],b2[0]*b2[0],b2[1]],[1,c[0],c[0]*c[0],c[1]]];
     let ok=true;
     for(let col=0;col<3;col++){
       let piv=col;for(let r=col+1;r<3;r++)if(Math.abs(A[r][col])>Math.abs(A[piv][col]))piv=r;
       if(Math.abs(A[piv][col])<1e-9){ok=false;break;}
       const t=A[col];A[col]=A[piv];A[piv]=t;
       for(let r=0;r<3;r++){if(r===col)continue;const f=A[r][col]/A[col][col];for(let q=col;q<4;q++)A[r][q]-=f*A[col][q];}
     }
     if(!ok)continue;
     const aa=A[0][3]/A[0][0],bb=A[1][3]/A[1][1],cc=A[2][3]/A[2][2];
     if(Math.abs(cc)>0.004)continue; // sanity: gentle arcs only
     let inl=[];for(const q of P){const yy=aa+bb*q[0]+cc*q[0]*q[0];if(Math.abs(yy-q[1])<thr)inl.push(q);}
     if(!best||inl.length>best.inl.length)best={aa,bb,cc,inl};
   }
   return best;
 }
 let pool=pts.slice();
 const arcs=[];
 while(pool.length>600&&arcs.length<8){
   const f=fitR(pool,1.8,700);
   if(!f||f.inl.length<400)break;
   const xs=f.inl.map(q=>q[0]);
   const x0=Math.min(...xs),x1=Math.max(...xs);
   const lum=f.inl.reduce((s,q)=>s+q[2],0)/f.inl.length;
   arcs.push({aa:f.aa,bb:f.bb,cc:f.cc,x0,x1,lum,n:f.inl.length});
   const set=new Set(f.inl.map(q=>q[0]+","+q[1]));
   pool=pool.filter(q=>!set.has(q[0]+","+q[1]));
 }

 // whiten mask
 for(let k=0;k<W*H;k++)if(md[k]){const i=k*4;d[i]=254;d[i+1]=254;d[i+2]=254;d[i+3]=255;}
 cx.putImageData(id,0,0);

 // mask canvas
 const mcv=document.createElement("canvas");mcv.width=W;mcv.height=H;
 const mc=mcv.getContext("2d");const mi=mc.createImageData(W,H);
 for(let k=0;k<W*H;k++)if(md[k])mi.data[k*4+3]=255;
 mc.putImageData(mi,0,0);

 // redraw arcs that pass through the masked box
 const lcv=document.createElement("canvas");lcv.width=W;lcv.height=H;
 const lc=lcv.getContext("2d");let drawn=0;
 for(const a of arcs){
   // does it cross the box?
   let crosses=false;
   for(let x=Math.max(a.x0-200,BX0-200);x<=W;x+=4){
     const y=a.aa+a.bb*x+a.cc*x*x;
     if(y>BY0-200&&y<H){crosses=true;break;}
   }
   if(!crosses)continue;
   lc.strokeStyle="rgba("+Math.round(a.lum)+","+Math.round(a.lum)+","+Math.round(a.lum)+",0.95)";
   lc.lineWidth=1.8;lc.lineCap="round";
   lc.beginPath();
   const xs=Math.max(0,a.x0-260), xe=Math.min(W,a.x1+260);
   for(let x=xs;x<=xe;x+=2){const y=a.aa+a.bb*x+a.cc*x*x;if(x===xs)lc.moveTo(x,y);else lc.lineTo(x,y);}
   lc.stroke();drawn++;
 }
 lc.globalCompositeOperation="destination-in";
 lc.drawImage(mcv,0,0);
 cx.drawImage(lcv,0,0);

 return {W,H,maskPx:mn,arcs:arcs.map(a=>({x0:Math.round(a.x0),x1:Math.round(a.x1),n:a.n,lum:Math.round(a.lum)})),drawn,url:cv.toDataURL("image/png")};
});
require("fs").writeFileSync("C:/Users/19457/Desktop/Beyond_JUBEAT/src/bg-jubeat-clean.png",Buffer.from(res.url.split(",")[1],"base64"));
delete res.url;console.log(JSON.stringify(res));
await b.close();})();