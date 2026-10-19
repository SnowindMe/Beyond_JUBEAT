
const fs=require('fs');
const p='C:/Users/19457/Desktop/Beyond_JUBEAT/src/theme.css';
let t=fs.readFileSync(p,'utf8');
// 1) drop --veil entirely (unused now)
t=t.replace(/--veil:linear-gradient\(180deg,(?:[^()]|\([^()]*\))*\);/g,'');
// 2) set bg opacity per generation
const OP={ave:.62,bta:.60,clan_blue:.60,clan_green:.60,clan_purple:.62,clan_red:.60,
 copious:.66,festo:.56,knit:.72,prop:.70,qubell:.70,saucer:.74,saucerfulfill:.62};
t=t.replace(/(html\[data-g="([a-z_]+)"\]\{--bgop:)[0-9.]+;/g,function(m,a,k){
  return OP[k]!==undefined? a+OP[k]+';' : m;
});
fs.writeFileSync(p,t);
const veil=(t.match(/--veil/g)||[]).length;
const ops=(t.match(/--bgop:[0-9.]+;/g)||[]).length;
console.log('veil left',veil,'bgop decls',ops);
const line=t.split('\n').filter(l=>l.indexOf('html[data-g="knit"]')===0)[0];
console.log(line.slice(0,110));
