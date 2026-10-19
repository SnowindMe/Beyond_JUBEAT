
const sharp=require('C:/Users/19457/Desktop/Beyond_JUBEAT/archive/legacy/jubeat-wiki-v3/node_modules/sharp');
const dir='D:/dsh_data/.dsh/attachments/v1/objects/';
const fs=require('fs');
const out='C:/Users/19457/Desktop/Beyond_JUBEAT/scripts/probe/wiki-v4/_src/';
fs.mkdirSync(out,{recursive:true});
const files={
 l1:'5d/5d0ea5063d8604f16a910912eab6527594ff10dcf1407a3c132a1e6b3d74a4df',
 l2:'cf/cfdbdd600dd5b03dd710702c844050c1a3a262198b020200a1db69d114944e4d',
 l3:'a4/a41c4bac4469091a09986ada6374d7f27de8dbb93028926ca16c9e3f13358f6b',
 l4:'f9/f9bdbd102d84da91730ad4945b425354d54be286b568dc77ab2a3cf43ade1e2a'
};
(async()=>{
 for(const k in files){
   await sharp(dir+files[k]).resize({width:520,withoutEnlargement:true}).png().toFile(out+k+'.png');
 }
 console.log('ok');
})();
