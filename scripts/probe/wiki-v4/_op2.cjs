
const fs=require('fs');
const p='C:/Users/19457/Desktop/Beyond_JUBEAT/src/theme.css';
let t=fs.readFileSync(p,'utf8');
t=t.replace(/:\{--bgop:[0-9.]+;/g,':{--bgop:0.86;');
t=t.replace(/opacity:var\(--bgop,\.34\)/, 'opacity:var(--bgop,.86)');
fs.writeFileSync(p,t);
console.log('ok');
