import {build} from 'esbuild';
import fs from 'node:fs/promises';
await fs.rm('dist/client',{recursive:true,force:true});
await fs.mkdir('dist/client',{recursive:true});
for(const item of await fs.readdir('dist',{withFileTypes:true})){
  if(item.isFile()||item.name==='vendor')await fs.cp('dist/'+item.name,'dist/client/'+item.name,{recursive:true});
}
await fs.mkdir('dist/.openai',{recursive:true});
await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
await build({entryPoints:['worker/index.mjs'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',loader:{'.html':'text'}});
console.log('Built chess app and private notebook API.');
