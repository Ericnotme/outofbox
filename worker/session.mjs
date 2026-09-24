const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const idOK=x=>typeof x==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(x);
export async function sessionAPI(request,env){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie'};
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(!['GET','POST'].includes(request.method))return json({error:'不支持的请求'},405);
  if(request.method==='POST'&&(request.headers.get('Origin')!==new URL(request.url).origin||!request.headers.get('Content-Type')?.startsWith('application/json')))return json({error:'请刷新页面后重试。'},403);
  if(!env.DB)return json({error:'暂时无法读取进度，请稍后重试。'},503);
  let token=request.headers.get('Cookie')?.match(/(?:^|;\s*)knight_book=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');headers['Set-Cookie']=`knight_book=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`;}
  const owner=await digest(token);
  try{
    const row=await env.DB.prepare('SELECT data, revision FROM knight_sessions WHERE owner = ?').bind(owner).first();
    const state=row?JSON.parse(row.data):{sessions:[]},revision=row?.revision??-1;
    if(request.method==='GET')return json({...state,revision});
    const raw=await request.text();if(raw.length>4000)return json({error:'记录内容过长。'},413);
    let a;try{a=JSON.parse(raw);}catch{return json({error:'记录格式无效。'},400);}
    if(a.revision!==revision)return json({error:'另一页面已更新记录。请重新读取，再操作。'},409);
    const now=Date.now(),active=state.sessions.find(s=>!s.endedAt);
    if(a.type==='start'){
      if(active)return json({error:'请先结束当前一轮。'},409);
      if(!idOK(a.id)||!Number.isInteger(a.budget)||a.budget<1||a.budget>10||![10,20,30,45,60,90,120].includes(a.minutes)||![2,3,4].includes(a.lossLimit)||!['calm','tired','chasing'].includes(a.energy)||typeof a.focus!=='string'||a.focus.length>140)return json({error:'请检查这一轮的设置。'},400);
      state.sessions.unshift({id:a.id,startedAt:now,budget:a.budget,minutes:a.minutes,lossLimit:a.lossLimit,energy:a.energy,focus:a.focus,games:[],endedAt:null,reflection:'',helpful:null});state.sessions=state.sessions.slice(0,60);
    }else if(a.type==='clear'){state.sessions=[];}
    else{
      if(!active||a.id!==active.id)return json({error:'这一轮已经结束，请重新读取。'},409);
      if(a.type==='game'){
        if(!idOK(a.gameId)||!['w','d','l'].includes(a.result))return json({error:'请选择正确的对局结果。'},400);
        if(active.games.length>=100)return json({error:'本轮记录已满，请结束这一轮。'},400);
        if(!active.games.some(g=>g.id===a.gameId))active.games.push({id:a.gameId,result:a.result,at:now});
      }else if(a.type==='undo'){active.games.pop();}
      else if(a.type==='finish'){
        if(typeof a.reflection!=='string'||a.reflection.length>200||![true,false,null].includes(a.helpful))return json({error:'请把复盘提醒控制在 200 字内。'},400);
        active.endedAt=now;active.reflection=a.reflection.trim();active.helpful=a.helpful;
      }else return json({error:'未知操作。'},400);
    }
    const data=JSON.stringify(state),result=row?await env.DB.prepare('UPDATE knight_sessions SET data = ?, revision = revision + 1, updated_at = ? WHERE owner = ? AND revision = ?').bind(data,now,owner,revision).run():await env.DB.prepare('INSERT OR IGNORE INTO knight_sessions (owner, data, revision, updated_at) VALUES (?, ?, 0, ?)').bind(owner,data,now).run();
    if(!result.meta.changes)return json({error:'记录发生更新，请重新读取。'},409);
    return json({...state,revision:revision+1});
  }catch{return json({error:'暂时无法保存。请重试，尚未保存的输入会留在页面上。'},503);}
}
