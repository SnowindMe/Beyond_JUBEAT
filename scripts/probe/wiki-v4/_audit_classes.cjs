
const fs=require('fs');
const dir='C:/Users/19457/Desktop/Beyond_JUBEAT/src/';
const css=fs.readFileSync(dir+'theme.css','utf8');
const html=fs.readFileSync(dir+'index.html','utf8');
const cssN=css.replace(/\/\*[\s\S]*?\*\//g,'');
const classes=new Set();
for(const m of cssN.matchAll(/\.([a-zA-Z][\w-]*)/g)) classes.add(m[1]);
const used=new Set();
for(const m of html.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).forEach(c=>c&&used.add(c));
const dead=[...classes].filter(c=>!used.has(c)).sort();
console.log('CSS_CLASSES', classes.size, 'USED', used.size);
console.log('DEAD_IN_CSS:', dead.join(', '));
console.log('HTML_NOT_IN_CSS:', [...used].filter(c=>!classes.has(c)).sort().join(', '));
// duplicate selectors count
const sel={};
for(const m of cssN.matchAll(/^([^{}@\n][^{}]*)\{/gm)){ const k=m[1].trim().replace(/\s+/g,' '); sel[k]=(sel[k]||0)+1; }
const dup=Object.entries(sel).filter(([,v])=>v>1).sort((a,b)=>b[1]-a[1]);
console.log('DUPLICATE_SELECTORS', dup.length);
console.log(dup.slice(0,12).map(([k,v])=>v+'x '+k).join(' | '));
// html[data-g] rule counts
console.log('data-g RULES', (cssN.match(/html\[data-g/g)||[]).length);
// per-file length
console.log('CSS_BYTES', css.length, 'HTML_BYTES', html.length);
