const https=require('https');
function head(u){return new Promise(function(res){
  https.get(u,{headers:{'user-agent':'Mozilla/5.0'}},function(r){
    var d=''; r.setEncoding('utf8'); r.on('data',function(c){d+=c});
    r.on('end',function(){res({status:r.statusCode, len:d.length, body:d.slice(0,400)})});
  }).on('error',function(e){res({err:e.message})});
});}
head('https://wiki.byd-ub.top/songs/11000120/').then(function(a){
  console.log('详情页 status',a.status,'len',a.len);
  if(a.status===200){ console.log('含 sd-chart:', a.body.indexOf('sd-chart')>=0); }
  else console.log('body:', String(a.body).slice(0,300));
});
