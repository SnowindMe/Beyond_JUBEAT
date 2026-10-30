
const https = require('https');
const a = require('./src/data/ub-audio.json');
function probe(id, label, headers, viaProxy) {
  return new Promise((res) => {
    const t0=Date.now();
    const path = a[id].split('/').map(encodeURIComponent).join('/');
    const url='https://ub.thregren.world/'+path;
    const lib = viaProxy ? require('https') : require('http');
    const req = https.request(url,{method:'GET',headers:Object.assign({'User-Agent':'Mozilla/5.0'},headers||{}),timeout:40000},(r)=>{
      const ttfb=Date.now()-t0; let got=0;
      r.on('data',c=>{got+=c.length; if(got>300000) r.destroy();});
      r.on('end',()=>res({label,ttfb,status:r.statusCode,got,total:Date.now()-t0,cr:r.headers['content-range'],len:r.headers['content-length'],cc:r.headers['cache-control']}));
      r.on('close',()=>res({label,ttfb,status:r.statusCode,got,total:Date.now()-t0,cr:r.headers['content-range'],len:r.headers['content-length'],cc:r.headers['cache-control']}));
    });
    req.on('error',e=>res({label,err:String(e.message)}));
    req.on('timeout',()=>{req.destroy();res({label,err:'timeout'})});
    req.end();
  });
}
(async()=>{
  const ids=['11000073','11000074','11000075'];
  console.log('--- 上游裸延迟（走本机代理，仅作参考）---');
  for (const id of ids) {
    if (!a[id]) { console.log(id,'不在映射表'); continue; }
    console.log(JSON.stringify(await probe(id,'Range 128K',{Range:'bytes=0-131071'})));
  }
})();
