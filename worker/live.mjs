import {INTENTS,initialLiveState,clockValues,replayGame,INCREMENT_MS} from '../dist/live-shared.mjs';
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const hash=async token=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));
const roomId=()=>hex(crypto.getRandomValues(new Uint8Array(12)));
const validId=id=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id);
const nameOf=value=>String(value||'路过的棋友').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,16)||'路过的棋友';
const other=side=>side==='w'?'b':'w';
const win=side=>side==='w'?'1-0':'0-1';
const sideOf=(room,owner)=>room.white_owner===owner?'w':room.black_owner===owner?'b':null;

async function expireRoom(db,room,now){
  if(room?.status==='active'){
    const state=JSON.parse(room.state),turn=state.fen.split(' ')[1],clocks=clockValues(state,room.turn_at,now);
    if(clocks[turn]<=0){
      const game=replayGame(state.moves),opponentPieces=game.board().flat().filter(p=>p?.color===other(turn));
      const cannotMate=game.isInsufficientMaterial()||opponentPieces.every(p=>p.type==='k');
      state.whiteMs=clocks.w;state.blackMs=clocks.b;state.result=cannotMate?'1/2-1/2':win(other(turn));state.reason=cannotMate?'超时 · 对方无将死子力':'超时';
      await db.prepare("UPDATE knight_live_rooms SET status='finished', state=?, revision=revision+1, updated_at=? WHERE id=? AND revision=? AND status='active'").bind(JSON.stringify(state),now,room.id,room.revision).run();
      return db.prepare('SELECT * FROM knight_live_rooms WHERE id=?').bind(room.id).first();
    }
  }
  return room;
}
async function publicRoom(db,room,owner,now){
  if(!room)return null;
  const side=sideOf(room,owner);if(!side)return null;
  const state=JSON.parse(room.state),players=(await db.prepare('SELECT side, seen_at FROM knight_live_players WHERE room_id=?').bind(room.id).all()).results;
  return {id:room.id,visibility:room.visibility,status:room.status,revision:room.revision,side,
    names:{w:room.white_name,b:room.black_name},fen:state.fen,result:state.result,reason:state.reason,
    clocks:clockValues(state,room.turn_at,now,room.status==='active'),serverNow:now,turnAt:room.turn_at,
    draw:state.draw,moves:state.moves.map((m,i)=>({uci:m.uci,san:m.san,thinkMs:m.thinkMs,
      ...(room.status==='finished'?{intent:m.intent,guess:m.guess}:i%2===(side==='w'?0:1)?{intent:m.intent,guess:m.guess}:{} )})),
    presence:{w:players.some(p=>p.side==='w'&&p.seen_at>now-20000),b:players.some(p=>p.side==='b'&&p.seen_at>now-20000)}};
}

async function joinRoom(db,owner,action,now){
  const id=roomId(),name=nameOf(action.name),privateRoom=action.type==='create',invite=action.type==='join';
  if(invite&&!validId(action.room))return {error:'邀请链接不完整。',status:400};
  // Each batch is a transaction. The owner primary key and unique room/side seat
  // make matching atomic even when several arrivals or browser tabs race.
  const liveCandidate="r.status='waiting' AND r.visibility='public' AND r.white_owner<>? AND EXISTS (SELECT 1 FROM knight_live_players p WHERE p.room_id=r.id AND p.side='w' AND p.seen_at>?)";
  const statements=[
    db.prepare("UPDATE knight_live_rooms SET status='cancelled',revision=revision+1,updated_at=? WHERE status='waiting' AND NOT EXISTS (SELECT 1 FROM knight_live_players p WHERE p.room_id=knight_live_rooms.id AND p.seen_at>?)").bind(now,now-45000),
    db.prepare("DELETE FROM knight_live_players WHERE owner=? AND room_id IN (SELECT id FROM knight_live_rooms WHERE status IN ('finished','cancelled'))").bind(owner)
  ];
  if(!invite)statements.push(db.prepare(`INSERT INTO knight_live_rooms (id,visibility,status,white_owner,white_name,state,created_at,updated_at,turn_at)
    SELECT ?,?,'waiting',?,?,?, ?,?,? WHERE NOT EXISTS (SELECT 1 FROM knight_live_players WHERE owner=?)
    AND (?=1 OR NOT EXISTS (SELECT 1 FROM knight_live_rooms r WHERE ${liveCandidate}))`).bind(id,privateRoom?'private':'public',owner,name,JSON.stringify(initialLiveState()),now,now,now,owner,privateRoom?1:0,owner,now-20000));
  if(invite){
    statements.push(db.prepare("INSERT OR IGNORE INTO knight_live_players (owner,room_id,side,name,seen_at) SELECT ?,r.id,'b',?,? FROM knight_live_rooms r WHERE r.id=? AND r.status='waiting' AND r.white_owner<>? AND EXISTS(SELECT 1 FROM knight_live_players p WHERE p.room_id=r.id AND p.side='w' AND p.seen_at>?) AND NOT EXISTS(SELECT 1 FROM knight_live_players WHERE owner=?)").bind(owner,name,now,action.room,owner,now-45000,owner));
  }else{
    statements.push(db.prepare(`INSERT OR IGNORE INTO knight_live_players (owner,room_id,side,name,seen_at)
      SELECT ?,r.id,CASE WHEN r.id=? THEN 'w' ELSE 'b' END,?,? FROM knight_live_rooms r
      WHERE NOT EXISTS (SELECT 1 FROM knight_live_players WHERE owner=?) AND (r.id=? OR (?=0 AND ${liveCandidate}))
      ORDER BY CASE WHEN r.id=? THEN 0 ELSE 1 END,r.created_at LIMIT 1`).bind(owner,id,name,now,owner,id,privateRoom?1:0,owner,now-20000,id));
  }
  statements.push(db.prepare("UPDATE knight_live_rooms SET status='active', black_owner=(SELECT owner FROM knight_live_players WHERE room_id=knight_live_rooms.id AND side='b'), black_name=(SELECT name FROM knight_live_players WHERE room_id=knight_live_rooms.id AND side='b'),turn_at=?,updated_at=?,revision=revision+1 WHERE status='waiting' AND id=(SELECT room_id FROM knight_live_players WHERE owner=?) AND EXISTS(SELECT 1 FROM knight_live_players WHERE room_id=knight_live_rooms.id AND side='b')").bind(now,now,owner));
  await db.batch(statements);
  const room=await db.prepare('SELECT r.* FROM knight_live_rooms r JOIN knight_live_players p ON p.room_id=r.id WHERE p.owner=?').bind(owner).first();
  if(!room||invite&&room.id!==action.room)return {error:'这个房间已开局、邀请过期，或你已有未结束的对局。',status:409};
  return {room};
}

export async function liveAPI(request,env){
  const url=new URL(request.url),now=Date.now();
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(!['GET','POST'].includes(request.method))return json({error:'不支持的请求'},405);
  if(request.method==='POST'&&(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json')))return json({error:'请求来源无效，请刷新重试。'},403);
  let token=request.headers.get('Cookie')?.match(/(?:^|;\s*)knight_live=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!token){
    if(request.method==='POST')return json({error:'请先打开联网大厅，建立你的棋手席位。'},401);
    token=hex(crypto.getRandomValues(new Uint8Array(32)));
    headers['Set-Cookie']=`knight_live=${token}; Path=/; Max-Age=2592000; HttpOnly; ${url.protocol==='https:'?'Secure; ':''}SameSite=Strict`;
  }
  if(!env.DB)return json({error:'联网大厅暂时不可用，本机玩法不受影响。'},503);
  const owner=await hash(token);
  // Always read primary state when D1 read replication is enabled.
  const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
  try{
    await db.prepare('UPDATE knight_live_players SET seen_at=? WHERE owner=? AND seen_at<?').bind(now,owner,now-5000).run();
    let room=await db.prepare('SELECT r.* FROM knight_live_rooms r JOIN knight_live_players p ON p.room_id=r.id WHERE p.owner=?').bind(owner).first();
    room=await expireRoom(db,room,now);
    if(request.method==='GET'){
      const invite=url.searchParams.get('invite');let invitation=null;
      if(validId(invite)){
        const row=await db.prepare('SELECT white_name,status FROM knight_live_rooms WHERE id=?').bind(invite).first();
        invitation=row?{id:invite,name:row.white_name,available:row.status==='waiting'}:{id:invite,available:false};
      }
      return json({room:await publicRoom(db,room,owner,now),invitation});
    }
    const raw=await request.text();if(raw.length>4096)return json({error:'请求过大'},413);
    let action;try{action=JSON.parse(raw);}catch{return json({error:'请求无法读取'},400);}
    if(!action||typeof action!=='object')return json({error:'请求无效'},400);
    if(['match','create','join'].includes(action.type)){
      if(room?.status==='active'||room?.status==='waiting')return json({room:await publicRoom(db,room,owner,now)});
      if(room&&now-room.created_at<2500)return json({error:'稍等一下，再开始新的相遇。'},429);
      const result=await joinRoom(db,owner,action,now);
      if(result.error)return json({error:result.error},result.status);
      return json({room:await publicRoom(db,result.room,owner,now)});
    }
    if(!room||room.id!==action.room)return json({error:'对局不属于当前席位，请重新打开大厅。'},403);
    const side=sideOf(room,owner),state=JSON.parse(room.state);
    if(action.type==='cancel'){
      const result=await db.prepare("UPDATE knight_live_rooms SET status='cancelled',revision=revision+1,updated_at=? WHERE id=? AND status='waiting' AND white_owner=?").bind(now,room.id,owner).run();
      if(!result.meta.changes)return json({error:'对手已经入座，请返回棋局。'},409);
      room=await db.prepare('SELECT * FROM knight_live_rooms WHERE id=?').bind(room.id).first();
      return json({room:await publicRoom(db,room,owner,now)});
    }
    if(room.status!=='active')return json({error:'这局已经结束。',room:await publicRoom(db,room,owner,now)},409);
    if(action.revision!==room.revision)return json({error:'棋局已有变化，已为你同步，请重新选择。',room:await publicRoom(db,room,owner,now)},409);
    const game=replayGame(state.moves),clocks=clockValues(state,room.turn_at,now);
    let status='active',turnAt=room.turn_at;
    if(action.type==='move'){
      if(game.turn()!==side)return json({error:'还没轮到你。'},409);
      if(typeof action.uci!=='string'||!/^([a-h][1-8]){2}[qrbn]?$/.test(action.uci))return json({error:'走法无效'},400);
      let move;try{move=game.move({from:action.uci.slice(0,2),to:action.uci.slice(2,4),promotion:action.uci[4]});}catch{return json({error:'这步不符合棋规，请重新选择。'},400);}
      state.moves.push({uci:action.uci,san:move.san,intent:INTENTS[action.intent]?action.intent:null,guess:state.moves.length&&INTENTS[action.guess]?action.guess:null,thinkMs:Math.max(0,now-room.turn_at)});
      state.fen=game.fen();state.whiteMs=clocks.w+(side==='w'?INCREMENT_MS:0);state.blackMs=clocks.b+(side==='b'?INCREMENT_MS:0);turnAt=now;
      // Moving declines the other player's offer; your own offer remains open.
      if(state.draw&&state.draw!==side)state.draw=null;
      if(game.isCheckmate()){state.result=win(side);state.reason='将死';status='finished';}
      else if(game.isDraw()||state.moves.length>=600){state.result='1/2-1/2';state.reason=game.isStalemate()?'逼和':game.isThreefoldRepetition()?'三次重复':game.isInsufficientMaterial()?'子力不足':state.moves.length>=600?'达到本房间步数上限':'五十回合规则';status='finished';}
    }else if(action.type==='resign'){
      state.whiteMs=clocks.w;state.blackMs=clocks.b;state.result=win(other(side));state.reason='认输';status='finished';
    }else if(action.type==='draw'){
      if(state.draw===other(side)){state.whiteMs=clocks.w;state.blackMs=clocks.b;state.result='1/2-1/2';state.reason='双方同意和棋';status='finished';}
      else if(state.draw===side)return json({room:await publicRoom(db,room,owner,now)});
      else state.draw=side;
    }else return json({error:'未知操作'},400);
    const result=await db.prepare('UPDATE knight_live_rooms SET state=?,status=?,turn_at=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND status=\'active\'').bind(JSON.stringify(state),status,turnAt,now,room.id,room.revision).run();
    if(!result.meta.changes)return json({error:'另一项操作已先完成，正在同步棋局。'},409);
    room=await db.prepare('SELECT * FROM knight_live_rooms WHERE id=?').bind(room.id).first();
    return json({room:await publicRoom(db,room,owner,now)});
  }catch(error){console.error('live request failed',error?.message);return json({error:'连接暂时中断，正在重连。请保留此页面。'},503);}
}
