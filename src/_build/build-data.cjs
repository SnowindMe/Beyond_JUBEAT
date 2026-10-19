const fs=require('fs'),path=require('path');
const d=require('../../archive/legacy/jubeat-wiki-v3/data/songs.json');
const songs=d.songs;
const META=[
 ['jubeat','2008','jubeat'],['jubeat ripples','2009','ripples'],['jubeat ripples APPEND','2010','ripples A'],
 ['jubeat knit','2010','knit'],['jubeat knit APPEND','2011','knit A'],['jubeat copious','2011','copious'],
 ['jubeat copious APPEND','2012','copious A'],['jubeat saucer','2012','saucer'],['jubeat saucer fulfill','2014','saucer F'],
 ['jubeat prop','2015','prop'],['jubeat Qubell','2016','Qubell'],['jubeat clan','2017','clan'],
 ['jubeat festo','2018','festo'],['jubeat Ave.','2022','Ave.'],['jubeat音乐魔方','2023','音乐魔方']];
const pick=(s)=>({t:s.title,a:s.artist,lv:s.levels,cover:s.cover,d:s.addedAt||null,o:s.origin});
const TOP=songs.slice().sort((a,b)=>(b.levels.ext||0)-(a.levels.ext||0)).slice(0,12).map(pick);
const LATEST=songs.filter(s=>s.addedAt).sort((a,b)=>String(b.addedAt).localeCompare(String(a.addedAt))).slice(0,12).map(pick);
const GEN=[];
for(const [k,y,short] of META){const arr=songs.filter(s=>s.origin===k);if(!arr.length)continue;
  const rep=arr.slice().sort((a,b)=>(b.levels.ext||0)-(a.levels.ext||0))[0];
  GEN.push({k:short,y,n:arr.length,rep:rep?pick(rep):null});}
const b={};
for(const s of songs){const e=s.levels.ext;if(typeof e!=='number')continue;const k=e>=10.5?'10.5':String(Math.floor(e));b[k]=(b[k]||0)+1;}
const DIST=['6','7','8','9','10','10.5'].filter(k=>b[k]).map(k=>({k,v:b[k]}));
const dots=songs.filter(s=>typeof s.levels.ext==='number').map(s=>s.levels.ext).sort((a,b)=>a-b);
const out={stat:{songs:songs.length,charts:songs.reduce((a,s)=>a+(s.chartCount||0),0),gens:GEN.length},
  top:TOP,latest:LATEST,gen:GEN,dist:DIST,dots,
  gen10:songs.filter(s=>s.levels.ext>=10).length,
  gen105:songs.filter(s=>s.levels.ext>=10.5).length,
  alt:songs.filter(s=>s.hasAltChart).length};
const OUT=__dirname; // data.json 落在 _build，供 build.cjs/build2.cjs 读取
fs.writeFileSync(OUT+'/data.json',JSON.stringify(out));
const dir2=path.join(__dirname,'..','..','assets','images','jackets');fs.mkdirSync(dir2,{recursive:true}); // 曲绘归 assets/wiki-v4
const JROOT=path.join(__dirname,'../../archive/legacy/jubeat-wiki-v3/public');
const PADSRC=songs.slice().sort((a,b)=>(b.levels.ext||0)-(a.levels.ext||0)).slice(0,16).map(pick);
out.pad=PADSRC;
fs.writeFileSync(OUT+'/data.json',JSON.stringify(out));
let n=0;for(const c of new Set([...TOP,...LATEST,...PADSRC,...GEN.map(g=>g.rep).filter(Boolean)].map(x=>x.cover).filter(Boolean))){const src=path.join(JROOT,c.replace(/^\//,''));if(fs.existsSync(src)){fs.copyFileSync(src,path.join(dir2,path.basename(c)));n++;}}
console.log('jackets',n,'gen',GEN.length,'dots',dots.length);