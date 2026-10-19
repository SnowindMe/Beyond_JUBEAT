
const fs=require('fs');
const p='C:/Users/19457/Desktop/Beyond_JUBEAT/src/theme.css';
let lines=fs.readFileSync(p,'utf8').split('\n');
const M={
 ave:'6,16,20', bta:'22,12,6', clan_blue:'6,12,22', clan_green:'5,16,11',
 clan_purple:'12,7,20', clan_red:'20,7,9', copious:'4,7,18', festo:'10,9,6',
 knit:'248,245,236', prop:'250,249,247', qubell:'248,245,238', saucer:'242,245,247',
 saucerfulfill:'8,8,8'
};
const HI={knit:'.30',prop:'.28',qubell:'.28',saucer:'.32',saucerfulfill:'.12'};
for(const k in M){
  const rgb=M[k], hi=HI[k]||'.10';
  const veil='linear-gradient(180deg,rgba('+rgb+','+hi+') 0%,rgba('+rgb+',.5) 24%,rgba('+rgb+',.86) 46%,rgba('+rgb+',.97) 60%,rgb('+rgb+') 76%)';
  lines=lines.map(function(L){
    if(L.indexOf('html[data-g="'+k+'"]')!==0) return L;
    const i=L.indexOf('--veil:');
    if(i<0){console.log('NOVEIL',k);return L;}
    const j=L.indexOf(';',i);
    return L.slice(0,i)+'--veil:'+veil+L.slice(j);
  });
}
fs.writeFileSync(p,lines.join('\n'));
const out=fs.readFileSync(p,'utf8').split('\n').filter(l=>l.indexOf('html[data-g="knit"]')===0)[0];
console.log(out.slice(0,120));
