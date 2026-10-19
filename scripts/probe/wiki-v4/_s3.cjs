const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
(async()=>{
 await sharp('C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo_sheet_2x.png').resize({width:1000}).jpeg({quality:46}).toFile('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/_s3.jpg');
 console.log(require('fs').statSync('C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/screenshots/wiki-v4/shots/_s3.jpg').size);
})();