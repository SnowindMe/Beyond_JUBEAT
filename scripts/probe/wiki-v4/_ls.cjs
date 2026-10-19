const fs=require('fs');
const d='C:/Users/19457/Desktop/Beyond_JUBEAT/src/logo/_orig';
for(const f of fs.readdirSync(d)) console.log(f, fs.statSync(d+'/'+f).size);
