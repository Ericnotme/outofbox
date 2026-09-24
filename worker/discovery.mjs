const IDENT='KnightRoom/1.0 (+https://knight-room.weijiaxian.chatgpt.site)';
const memory=new Map(),inflight=new Map();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});
export async function limitedText(response,max=5000000){
  if(!response.ok)throw new Error(response.status===429?'数据源繁忙，请稍后重试。':response.status===404?'没有找到这个公开账号。':`数据源暂时不可用（${response.status}）。`);
  if(Number(response.headers.get('content-length'))>max)throw new Error('数据量太大，请下载 PGN 后导入。');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw new Error('数据量太大，请下载 PGN 后导入。');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const all=new Uint8Array(size);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.length;}return new TextDecoder().decode(all);
}
async function upstream(url,options={},timeout=22000){
  const response=await fetch(url,{...options,headers:{'User-Agent':IDENT,Accept:'application/json',...options.headers},signal:AbortSignal.timeout(timeout)});
  return limitedText(response);
}
async function cached(key,fn,ttl=900){
  const old=memory.get(key);if(old?.until>Date.now())return old.value;
  if(inflight.has(key))return inflight.get(key);
  const work=(async()=>{
    const cache=globalThis.caches?.default,request=new Request('https://knight-room.weijiaxian.chatgpt.site/_data/'+encodeURIComponent(key));
    const hit=cache&&await cache.match(request);if(hit)return hit.json();
    const value=await fn();if(memory.size>=64)memory.delete(memory.keys().next().value);memory.set(key,{until:Date.now()+ttl*1000,value});
    if(cache)await cache.put(request,new Response(JSON.stringify(value),{headers:{'Cache-Control':`public, max-age=${ttl}`,'Content-Type':'application/json'}}));return value;
  })();inflight.set(key,work);try{return await work;}finally{inflight.delete(key);}
}
async function games(provider,username){
  if(provider==='lichess'){
    const pgn=await upstream(`https://lichess.org/api/games/user/${username}?max=100&ongoing=false&finished=true&clocks=false&evals=false&opening=true&sort=dateDesc`,{headers:{Accept:'application/x-chess-pgn'}});
    return {pgn,note:'Lichess 最近最多 100 局已结束对局；排除变体后样本可能更少。'};
  }
  const prefix=`https://api.chess.com/pub/player/${username}/games/`;
  const data=JSON.parse(await upstream(prefix+'archives'));
  const archives=(data.archives||[]).filter(u=>u.startsWith(prefix)&&/^\d{4}\/\d{2}$/.test(u.slice(prefix.length))).slice(-3).reverse();
  const result=[];
  // Serial requests respect Chess.com's published API guidance.
  for(const url of archives){
    const month=JSON.parse(await upstream(url));
    result.push(...(month.games||[]).filter(g=>g.rules==='chess'&&g.pgn).sort((a,b)=>b.end_time-a.end_time));if(result.length>=100)break;
  }
  return {pgn:result.slice(0,100).map(g=>g.pgn).join('\n\n'),note:'Chess.com 最近 3 个有记录月份内、最多 100 局标准棋。公开接口可能延迟更新。'};
}
export function distanceKm(a,b,c,d){const r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,x)));}
export function normalizePlaces(elements,lat,lon,radius){
  const list=[];
  for(const e of elements){const t=e.tags||{},p=e.center||e;
    if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||!String(t.sport||'').split(';').includes('chess'))continue;
    if(t.access==='private'||t.access==='no')continue;
    const distance=distanceKm(lat,lon,p.lat,p.lon);if(distance>radius)continue;
    const club=t.club==='sport'||t.club==='chess'||t.leisure==='sports_centre';
    const table=t.leisure==='pitch'||t.leisure==='picnic_table';
    list.push({id:`${e.type}/${e.id}`,name:t['name:zh']||t.name||(club?'未命名棋类场所':table?'公共国际象棋桌':'国际象棋地点'),kind:club?'club':table?'table':'place',lat:p.lat,lon:p.lon,distance:Math.round(distance*100)/100,address:[t['addr:city'],t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' '),website:t.website||t['contact:website']||'',hours:t.opening_hours||'',access:t.access||'',fee:t.fee||''});
  }
  // Keep separate nearby tables but remove named node/area duplicates.
  const unique=[];for(const p of list.sort((a,b)=>a.distance-b.distance)){if(!unique.some(q=>q.name===p.name&&q.kind===p.kind&&distanceKm(q.lat,q.lon,p.lat,p.lon)<.04))unique.push(p);}
  return unique.slice(0,80);
}
export async function discoveryAPI(request){
  if(request.method!=='GET')return json({error:'仅支持读取。'},405);
  const url=new URL(request.url);
  try{
    if(url.pathname==='/api/prepare'){
      const provider=url.searchParams.get('provider'),username=(url.searchParams.get('username')||'').toLowerCase();
      if(!['lichess','chesscom'].includes(provider)||! /^[a-z0-9_-]{2,30}$/.test(username))return json({error:'请输入有效的平台账号（2–30 个字母、数字、下划线或连字符）。'},400);
      const result=await cached(`games:${provider}:${username}`,()=>games(provider,username));return json(result);
    }
    if(url.pathname==='/api/places'){
      const a=url.searchParams.get('lat'),b=url.searchParams.get('lon'),lat=Number(a),lon=Number(b),radius=Number(url.searchParams.get('radius'));
      if(!a||!b||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180||![5,15,30].includes(radius))return json({error:'请选择有效地点和搜索范围。'},400);
      const y=Math.round(lat*1000)/1000,x=Math.round(lon*1000)/1000;
      const result=await cached(`places:${y}:${x}:${radius}`,async()=>{
        const query=`[out:json][timeout:18];nwr(around:${radius*1000},${y},${x})["sport"="chess"];out center tags;`;
        const raw=JSON.parse(await upstream('https://maps.mail.ru/osm/tools/overpass/api/interpreter?'+new URLSearchParams({data:query}),{},35000));
        if(raw.remark)throw new Error('地图查询未完整返回，请缩小范围后重试。');
        return {places:normalizePlaces(raw.elements||[],y,x,radius),checkedAt:new Date().toISOString()};
      },3600);return json(result);
    }
    return json({error:'接口不存在。'},404);
  }catch(e){return json({error:e.name==='TimeoutError'||e.name==='AbortError'?'数据源响应超时，请重试或使用下方替代入口。':e.message||'暂时无法读取数据。'},502);}
}
