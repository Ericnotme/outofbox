import {validateTask,positionKey,scheduleReview} from '../dist/coach.mjs';
const LIMIT=500;
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const empty=()=>({items:[],events:[]});
export async function notebookAPI(request,env){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(!['GET','POST'].includes(request.method))return json({error:'不支持的请求'},405);
  if(request.method==='POST'&&(request.headers.get('Origin')!==new URL(request.url).origin||!request.headers.get('Content-Type')?.startsWith('application/json')))return json({error:'请求来源无效，请刷新页面重试'},403);
  if(!env.DB)return json({error:'错题本暂时不可用，棋局仍可正常复盘。'},503);
  let token=request.headers.get('Cookie')?.match(/(?:^|;\s*)knight_book=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');headers['Set-Cookie']=`knight_book=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`;}
  const owner=await digest(token);
  try{
    if(request.method==='GET'){
      const row=await env.DB.prepare('SELECT data FROM knight_notebooks WHERE owner = ?').bind(owner).first();
      return json({items:row?JSON.parse(row.data).items:[],limit:LIMIT});
    }
    if(Number(request.headers.get('Content-Length'))>2000000)return json({error:'文件过大'},413);
    const raw=await request.text();if(raw.length>2000000)return json({error:'文件过大'},413);
    let action;try{action=JSON.parse(raw);}catch{return json({error:'无法读取数据'},400);}
    let incoming=[];
    if(['add','import'].includes(action.type)){
      if(!Array.isArray(action.items)||action.items.length>LIMIT)return json({error:'一次最多导入 500 道错题'},400);
      try{incoming=await Promise.all(action.items.map(async input=>{
        const task=validateTask(input),id=await digest(positionKey(task));
        let progress={streak:0,attempts:0,successes:0,dueAt:Date.now(),createdAt:Date.now()};
        if(action.type==='import'){
          for(const key of ['streak','attempts','successes'])progress[key]=Math.min(100000,Math.max(0,Math.floor(Number(input[key])||0)));
          progress.successes=Math.min(progress.successes,progress.attempts);progress.streak=Math.min(progress.streak,progress.successes);
          progress.dueAt=Math.min(Date.now()+30*86400000,Math.max(0,Number(input.dueAt)||Date.now()));
        }
        return {...task,id,...progress};
      }));}catch{return json({error:'文件中有不合法的局面或走法，请重新导出。'},400);}
    }else if(action.type==='grade'){
      if(!/^[a-f0-9]{64}$/.test(action.id)||!/^[a-zA-Z0-9-]{8,80}$/.test(action.event)||typeof action.success!=='boolean'||typeof action.assisted!=='boolean')return json({error:'练习记录无效'},400);
    }else if(action.type!=='clear')return json({error:'未知操作'},400);
    for(let retry=0;retry<4;retry++){
      const row=await env.DB.prepare('SELECT data, revision FROM knight_notebooks WHERE owner = ?').bind(owner).first();
      const state=row?JSON.parse(row.data):empty();let added=0;
      if(action.type==='clear'){state.items=[];state.events=[];}
      else if(action.type==='grade'){
        if(!state.events.includes(action.event)){
          const idx=state.items.findIndex(i=>i.id===action.id);if(idx<0)return json({error:'错题已移除，请重新打开错题本'},404);
          if(state.items[idx].dueAt<=Date.now())state.items[idx]=scheduleReview(state.items[idx],action.success,action.assisted);
          state.events.push(action.event);state.events=state.events.slice(-100);
        }
      }else{
        for(const item of incoming){const idx=state.items.findIndex(i=>i.id===item.id);if(idx<0){state.items.push(item);added++;}else{
          // A repeated analysis never resets already-earned review progress.
          const old=state.items[idx];if(item.depth>old.depth)state.items[idx]={...item,streak:old.streak,attempts:old.attempts,successes:old.successes,dueAt:old.dueAt,createdAt:old.createdAt,lastReviewed:old.lastReviewed};
        }}
        if(state.items.length>LIMIT)return json({error:'错题本最多保存 500 个局面。请先导出备份，再清空或减少导入数量。'},409);
      }
      const data=JSON.stringify(state);if(data.length>1500000)return json({error:'错题本容量已满，请先导出备份'},413);
      const result=row?await env.DB.prepare('UPDATE knight_notebooks SET data = ?, revision = revision + 1, updated_at = ? WHERE owner = ? AND revision = ?').bind(data,Date.now(),owner,row.revision).run():await env.DB.prepare('INSERT OR IGNORE INTO knight_notebooks (owner, data, revision, updated_at) VALUES (?, ?, 0, ?)').bind(owner,data,Date.now()).run();
      if(result.meta.changes)return json({items:state.items,added,limit:LIMIT});
    }
    return json({error:'另一页面正在保存，请再试一次'},409);
  }catch(error){console.error('notebook request failed',error?.message);return json({error:'错题本暂时无法保存，请稍后重试；不要关闭尚未保存的练习。'},503);}
}
