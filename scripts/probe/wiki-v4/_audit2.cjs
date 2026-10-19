
const fs=require('fs');
const dir='C:/Users/19457/Desktop/Beyond_JUBEAT/src/';
const html=fs.readFileSync(dir+'index.html','utf8');
const css=fs.readFileSync(dir+'theme.css','utf8');
console.log('emdash_in_html', (html.match(/—/g)||[]).length, 'endash', (html.match(/–/g)||[]).length);
console.log('main_tag', /<main/.test(html), 'skip_link', /skip/i.test(html));
console.log('meta theme-color', /theme-color/.test(html));
// font sizes
const sizes={};
for(const m of css.matchAll(/font-size:\s*([\d.]+)px/g)){ const v=+m[1]; sizes[v]=(sizes[v]||0)+1; }
console.log('FONT_SIZES', JSON.stringify(Object.entries(sizes).sort((a,b)=>a[0]-b[0])));
const small=Object.entries(sizes).filter(([v])=>+v<12).reduce((s,[,c])=>s+c,0);
console.log('below12_decls', small, 'total', Object.values(sizes).reduce((a,b)=>a+b,0));
// transitions listed
console.log('transition_all', (css.match(/transition:\s*all/g)||[]).length);
// box-shadows count
console.log('box_shadow', (css.match(/box-shadow/g)||[]).length, 'text_shadow', (css.match(/text-shadow/g)||[]).length);
// backdrop-filter
console.log('backdrop_filter', (css.match(/backdrop-filter/g)||[]).length);
// a11y: h1 text
console.log('h1_inner', (html.match(/<h1[\s\S]*?<\/h1>/)||[''])[0].replace(/\s+/g,' ').slice(0,120));
console.log('img_total', (html.match(/<img/g)||[]).length, 'with_wh', (html.match(/<img[^>]*width=/g)||[]).length, 'lazy', (html.match(/loading="lazy"/g)||[]).length);
console.log('anchor_hash', (html.match(/href="#"/g)||[]).length);
console.log('logo_css_linked', /logo\.css/.test(html));
