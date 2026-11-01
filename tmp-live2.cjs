const https=require('https');
function head(u){return new Promise(function(res){
  https.get(u,{headers:{'user-agent':'Mozilla/5.0','cookie':''}},function(r){
    var d=''; r.setEncoding('utf8'); r.on('data',function(c){d+=c});
    r.on('end',function(){res({status:r.statusCode, len:d.length})});
  }).on('error',function(e){res({err:e.message})});
});}
var urls=['https://wiki.byd-ub.top/','https://wiki.byd-ub.top/jubility/','https://wiki.byd-ub.top/songs/','https://wiki.byd-ub.top/songs/11000040/'];
(async function(){
  for(var i=0;i<urls.length;i++){
    var a=await head(urls[i]);
    console.log(urls[i].replace('https://wiki.byd-ub.top',''), '=>', a.status, a.len+'B');
  }
})();
