const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
const SRC={
 ave:'cf/cfdbdd600dd5b03dd710702c844050c1a3a262198b020200a1db69d114944e4d',
 bta:'5d/5d0ea5063d8604f16a910912eab6527594ff10dcf1407a3c132a1e6b3d74a4df',
 saucer:'a4/a41c4bac4469091a09986ada6374d7f27de8dbb93028926ca16c9e3f13358f6b',
 prop:'f9/f9bdbd102d84da91730ad4945b425354d54be286b568dc77ab2a3cf43ade1e2a'};
const d='D:/dsh_data/.dsh/attachments/v1/objects/';
(async()=>{for(const k in SRC){try{const m=await sharp(d+SRC[k]).metadata();console.log(k,m.width+'x'+m.height);}catch(e){console.log(k,'ERR',e.message);}}})();