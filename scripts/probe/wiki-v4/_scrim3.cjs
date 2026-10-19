
const fs=require('fs');
const p='C:/Users/19457/Desktop/Beyond_JUBEAT/src/theme.css';
let t=fs.readFileSync(p,'utf8');
t=t.replace(`body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background-image:var(--bgimg,none);
  background-size:cover;background-position:center top;background-repeat:no-repeat;
  opacity:var(--bgop,.86);transition:opacity .5s ease,background-image .5s ease}`,
`body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background-image:linear-gradient(180deg,var(--scrim,rgba(0,0,0,.30)) 0%,transparent 100%),var(--bgimg,none);
  background-size:100% 148px,cover;
  background-position:center top,center top;
  background-repeat:no-repeat,no-repeat;
  opacity:var(--bgop,.86);transition:opacity .5s ease,background-image .5s ease}`);
t=t.replace(`body::before{content:"";position:fixed;left:0;right:0;top:0;height:132px;pointer-events:none;z-index:0;
  background:linear-gradient(180deg,var(--scrim,rgba(0,0,0,.30)),transparent)}`,'body::before{display:none}');
fs.writeFileSync(p,t);
console.log('ok');
