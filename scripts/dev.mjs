import http from 'node:http';
import fs from 'node:fs/promises';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import worker from '../dist/server/index.js';

const root=new URL('../',import.meta.url);
const client=path.resolve(new URL('./dist/client/',root).pathname);
const local=new URL('.knight-local/',root);
await fs.mkdir(local,{recursive:true});
const db=new DatabaseSync(new URL('knight.sqlite',local).pathname);
db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
for(const file of readdirSync(new URL('drizzle/',root)).filter(f=>f.endsWith('.sql')).sort()){
  if(db.prepare('SELECT name FROM local_migrations WHERE name = ?').get(file))continue;
  db.exec('BEGIN');
  try{db.exec(readFileSync(new URL('drizzle/'+file,root),'utf8'));db.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(file);db.exec('COMMIT');}
  catch(error){db.exec('ROLLBACK');throw error;}
}
function query(statement,values=[]){return {
  bind(...args){return query(statement,args);},
  async first(){return statement.get(...values)??null;},
  async all(){return {results:statement.all(...values),success:true};},
  async run(){const result=statement.run(...values);return {success:true,meta:{changes:Number(result.changes)}};}
};}
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.jpeg':'image/jpeg','.txt':'text/plain; charset=utf-8','.gz':'application/gzip'};
const env={DB:{prepare(sql){return query(db.prepare(sql));}},ASSETS:{async fetch(request){
  const file=path.resolve(client,'.'+decodeURIComponent(new URL(request.url).pathname));
  if(!file.startsWith(client+path.sep))return new Response('Not found',{status:404});
  try{return new Response(await fs.readFile(file),{headers:{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}});}
  catch{return new Response('Not found',{status:404});}
}}};
const server=http.createServer(async(req,res)=>{
  try{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks);
    const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{} )});
    const response=await worker.fetch(request,env);
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Local preview error');}
});
server.listen(0,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+server.address().port));
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0);}));
