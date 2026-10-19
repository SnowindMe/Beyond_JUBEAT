
const fs=require('fs');
const p='C:/Users/19457/Desktop/Beyond_JUBEAT/src/theme.css';
let css=fs.readFileSync(p,'utf8');

// per-generation: base rgb + veil strength
const M={
 ave:['6,16,20','.10'],
 bta:['22,12,6','.10'],
 clan_blue:['6,12,22','.10'],
 clan_green:['5,16,11','.10'],
 clan_purple:['12,7,20','.10'],
 clan_red:['20,7,9','.10'],
 copious:['4,7,18','.10'],
 festo:['10,9,6','.12'],
 knit:['248,245,236','.28'],
 prop:['250,249,247','.26'],
 qubell:['248,245,238','.26'],
 saucer:['242,245,247','.30'],
 saucerfulfill:['8,8,8','.12']
};
for(const k in M){
  const [rgb,hi]=M[k];
  const veil='linear-gradient(180deg,rgba('+rgb+','+hi+') 0%,rgba('+rgb+',.52) 22%,rgba('+rgb+',.88) 44%,rgba('+rgb+',.98) 58%,rgb('+rgb+') 74%)';
  const re=new RegExp('(html\\[data-g="'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"\\{[^}]*?--veil:)[^;]+;');
  if(!re.test(css)) console.log('MISS',k);
  css=css.replace(re,(m,a)=>a+veil+';');
}
fs.writeFileSync(p,css);
console.log('patched');
