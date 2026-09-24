import {readTake} from '../dist/jam.mjs';
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function jamsAPI(request,env){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie'},json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(!['GET','POST'].includes(request.method))return json({error:'不支持的请求'},405);
  if(request.method==='POST'&&(request.headers.get('Origin')!==new URL(request.url).origin||!request.headers.get('Content-Type')?.startsWith('application/json')))return json({error:'请刷新页面后重试。'},403);
  if(!env.DB)return json({error:'唱片架暂时无法连接，请稍后重试。'},503);
  let take=null;
  if(request.method==='POST'){
    const raw=await request.text();if(raw.length>2400)return json({error:'乐谱内容过长。'},413);
    try{take=readTake(JSON.parse(raw)).take;if(Date.parse(take.day)>Date.now()+86400000)throw new Error('未来日期');}catch{return json({error:'乐谱不完整或走法无效。'},400);}
  }
  let token=request.headers.get('Cookie')?.match(/(?:^|;\s*)knight_book=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');headers['Set-Cookie']=`knight_book=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`;}
  const owner=await digest(token);
  try{
    for(let attempt=0;attempt<4;attempt++){
      const row=await env.DB.prepare('SELECT data, revision FROM knight_jams WHERE owner = ?').bind(owner).first(),state=row?JSON.parse(row.data):{takes:[]};
      if(!take)return json(state);
      const existing=state.takes.find(t=>t.id===take.id);
      if(existing){if(JSON.stringify(readTake(existing).take)!==JSON.stringify(take))return json({error:'这段乐谱的编号已存在，请保留原稿。'},409);return json(state);}
      state.takes=[{...take,createdAt:Date.now()},...state.takes].slice(0,30);const data=JSON.stringify(state),now=Date.now();
      const result=row?await env.DB.prepare('UPDATE knight_jams SET data = ?, revision = revision + 1, updated_at = ? WHERE owner = ? AND revision = ?').bind(data,now,owner,row.revision).run():await env.DB.prepare('INSERT OR IGNORE INTO knight_jams (owner, data, revision, updated_at) VALUES (?, ?, 0, ?)').bind(owner,data,now).run();
      if(result.meta.changes)return json(state);
    }
    return json({error:'唱片架刚被另一页面更新，请再试一次。'},409);
  }catch(e){console.error('Jam storage unavailable',e);return json({error:'这段即兴尚未保存，请稍后重试。'},503);}
}
