
const fs=require('fs');
const p='C:/Users/19457/Desktop/Beyond_JUBEAT/src/theme.css';
let L=fs.readFileSync(p,'utf8').split('\n');
const OP={ave:.34,bta:.34,clan_blue:.34,clan_green:.34,clan_purple:.34,clan_red:.34,
 copious:.36,festo:.30,knit:.52,prop:.50,qubell:.50,saucer:.54,saucerfulfill:.34};
let n=0;
L=L.map(function(line){
  const m=line.match(/^html\[data-g="([a-z_]+)"\]\{/);
  if(!m) return line;
  const k=m[1]; if(!(k in OP)) return line;
  n++;
  return line.replace('{','{--bgop:'+OP[k]+';');
});
fs.writeFileSync(p,L.join('\n'));
console.log('gen rules patched',n);
