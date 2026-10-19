
const fs=require('fs'),path=require('path');
const dir='C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo';
const map={ave:['1.353','min(436px,88%)'],bta:['1.356','min(430px,88%)'],saucer:['3.037','min(452px,88%)'],prop:['2.473','min(372px,84%)']};
let out='/* 由 _logocss.cjs 生成：字标遮罩必须以 data URI 内联；\n   Chromium 下 file:// 页面加载 file:// 的 mask-image 会被 CORS 拦截（net::ERR_FAILED）。*/\n';
for(const [k,[ar,w]] of Object.entries(map)){
  const b64=fs.readFileSync(path.join(dir,k+'.png')).toString('base64');
  out+='html[data-g="'+k+'"],html[data-g="'+(k==='saucer'?'saucerfulfill':k)+'"]{--logo:url("data:image/png;base64,'+b64+'");--logoar:'+ar+';--logow:'+w+'}\n';
}
fs.writeFileSync('C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo.css',out);
console.log('logo.css',out.length,'bytes');
