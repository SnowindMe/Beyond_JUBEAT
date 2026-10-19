const {chromium}=require("C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/playwright");
(async()=>{
const b=await chromium.launch();
const p=await b.newPage();
await p.goto("file:///C:/Users/19457/Desktop/Beyond_JUBEAT/src/src-wm.png");
await p.waitForTimeout(500);
const res=await p.evaluate(()=>{
  const img=document.querySelector("img");
  const W=img.naturalWidth,H=img.naturalHeight;
  const cv=document.createElement("canvas");cv.width=W;cv.height=H;
  const cx=cv.getContext("2d",{willReadFrequently:true});
  cx.drawImage(img,0,0);
  const id=cx.getImageData(0,0,W,H);
  const d=id.data;
  const L=(i)=>0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
  const S=(i)=>{const r=d[i],g=d[i+1],b2=d[i+2];return Math.max(r,g,b2)-Math.min(r,g,b2);};

  const X0=2340,Y0=1310;
  // ---- 1. background white estimate
  const samples=[];
  for(let y=Y0;y<H;y+=3)for(let x=X0;x<W;x+=3){const i=(y*W+x)*4;if(L(i)>250&&S(i)<6)samples.push(d[i]);}
  samples.sort((a,b)=>a-b);
  const bg=samples[Math.floor(samples.length/2)];
  // ---- 2. mask
  const mask=new Uint8Array(W*H);
  let mn=0;
  for(let y=Y0;y<H;y++)for(let x=X0;x<W;x++){
    const i=(y*W+x)*4, l=L(i), s=S(i);
    if(s<=18 && l>=198 && l<=251){mask[y*W+x]=1;mn++;}
  }
  // dilate 2
  const md=new Uint8Array(W*H);
  for(let y=Y0;y<H;y++)for(let x=X0;x<W;x++){
    if(!mask[y*W+x])continue;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const yy=y+dy,xx=x+dx;
      if(yy>=0&&yy<H&&xx>=0&&xx<W)md[yy*W+xx]=1;
    }
  }
  // ---- 3. curve points (darker hairlines) in a wider band, excluding mask
  const pts=[];
  for(let y=Y0;y<H;y++)for(let x=X0;x<W;x++){
    const k=y*W+x;if(md[k])continue;
    const i=k*4,l=L(i),s=S(i);
    if(s<=22&&l>=135&&l<=197) pts.push([x,y,l]);
  }
  function fitQuad(P){
    if(P.length<40) return null;
    let best=null;
    const rnd=()=>P[Math.floor(Math.random()*P.length)];
    for(let it=0;it<600;it++){
      const a=rnd(),b2=rnd(),c=rnd();
      const den=(b2[0]-a[0])*(c[0]*c[0]-a[0]*a[0])-(c[0]-a[0])*(b2[0]*b2[0]-a[0]*a[0]);
      if(Math.abs(den)<1e-6)continue;
      // solve y = A + Bx + Cx^2
      const m=[[1,a[0],a[0]*a[0],a[1]],[1,b2[0],b2[0]*b2[0],b2[1]],[1,c[0],c[0]*c[0],c[1]]];
      let ok=true;
      for(let col=0;col<3;col++){
        let piv=col;for(let r=col+1;r<3;r++)if(Math.abs(m[r][col])>Math.abs(m[piv][col]))piv=r;
        if(Math.abs(m[piv][col])<1e-9){ok=false;break;}
        [m[col],m[piv]]=[m[piv],m[col]];
        for(let r=0;r<3;r++){if(r===col)continue;const f=m[r][col]/m[col][col];for(let q=col;q<4;q++)m[r][q]-=f*m[col][q];}
      }
      if(!ok)continue;
      const A=m[0][3]/m[0][0],B=m[1][3]/m[1][1],C=m[2][3]/m[2][2];
      let inl=[];
      for(const q of P){const yy=A+B*q[0]+C*q[0]*q[0];if(Math.abs(yy-q[1])<2.5)inl.push(q);}
      if(!best||inl.length>best.inl.length) best={A,B,C,inl};
    }
    return best;
  }
  const c1=fitQuad(pts);
  let rest=c1?pts.filter(q=>!c1.inl.includes(q)):pts;
  const c2=fitQuad(rest);
  const curveLum = (c1&&c1.inl.length)?c1.inl.reduce((s,q)=>s+q[2],0)/c1.inl.length:170;

  // ---- 4. paint mask white
  for(let y=Y0;y<H;y++)for(let x=X0;x<W;x++){
    const k=y*W+x;if(!md[k])continue;
    const i=k*4;d[i]=bg;d[i+1]=bg;d[i+2]=bg;d[i+3]=255;
  }
  cx.putImageData(id,0,0);

  // ---- 5. redraw curves clipped to mask
  const maskCv=document.createElement("canvas");maskCv.width=W;maskCv.height=H;
  const mc=maskCv.getContext("2d");
  const mi=mc.createImageData(W,H);
  for(let k=0;k<W*H;k++){if(md[k]){mi.data[k*4+3]=255;}}
  mc.putImageData(mi,0,0);

  const lineCv=document.createElement("canvas");lineCv.width=W;lineCv.height=H;
  const lc=lineCv.getContext("2d");
  lc.strokeStyle="rgba(150,150,150,0.85)";
  lc.lineWidth=2.6;lc.lineCap="round";
  for(const c of [c1,c2]){
    if(!c||c.inl.length<60) continue;
    lc.beginPath();
    for(let x=X0-6;x<=W;x+=2){const y=c.A+c.B*x+c.C*x*x;if(x===X0-6)lc.moveTo(x,y);else lc.lineTo(x,y);}
    lc.stroke();
  }
  lc.globalCompositeOperation="destination-in";
  lc.drawImage(maskCv,0,0);
  cx.drawImage(lineCv,0,0);

  return {W,H,bg,mn,c1:c1?{A:c1.A,B:c1.B,C:c1.C,n:c1.inl.length}:null,c2:c2?{A:c2.A,B:c2.B,C:c2.C,n:c2.inl.length}:null,curveLum,pts:pts.length,dataUrl:cv.toDataURL("image/png")};
});
const fs=require("fs");
const base64=res.dataUrl.split(",")[1];
fs.writeFileSync("C:/Users/19457/Desktop/Beyond_JUBEAT/src/bg-jubeat-clean.png",Buffer.from(base64,"base64"));
console.log(JSON.stringify({W:res.W,H:res.H,bg:res.bg,mn:res.mn,pts:res.pts,curveLum:res.curveLum,c1:res.c1&&{n:res.c1.n},c2:res.c2&&{n:res.c2.n}}));
await b.close();})();