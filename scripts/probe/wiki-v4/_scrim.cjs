
const fs=require('fs');
const p='C:/Users/19457/Desktop/Beyond_JUBEAT/src/theme.css';
let t=fs.readFileSync(p,'utf8');
t=t.replace('body::before{display:none}',
 'body::before{content:"";position:fixed;left:0;right:0;top:0;height:132px;pointer-events:none;z-index:0;\n'+
 '  background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,0))}');
t=t.replace('.top{display:flex','.top{position:relative;z-index:2;display:flex');
fs.writeFileSync(p,t);
console.log(t.split('\n').slice(32,40).join('\n'));
