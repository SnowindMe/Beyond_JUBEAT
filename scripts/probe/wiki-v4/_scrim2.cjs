
const fs=require('fs');
const p='C:/Users/19457/Desktop/Beyond_JUBEAT/src/theme.css';
let t=fs.readFileSync(p,'utf8');
// scrim uses a per-theme token
t=t.replace('background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,0))}',
 'background:linear-gradient(180deg,var(--scrim,rgba(0,0,0,.30)),transparent)}');
const DARK={ave:1,bta:1,clan_blue:1,clan_green:1,clan_purple:1,clan_red:1,copious:1,festo:1,saucerfulfill:1};
// dark themes: rgba(0,0,0,.34); light: rgba(255,255,255,.55)
t=t.replace(/(html\[data-g="([a-z_]+)"\]\{--bgop:[0-9.]+;)/g,function(m,a,k){
  return a+(DARK[k]?'--scrim:rgba(0,0,0,.34);':'--scrim:rgba(255,255,255,.55);');
});
fs.writeFileSync(p,t);
console.log(t.split('\n').find(l=>l.indexOf('html[data-g="ave"]')===0).slice(0,150));
