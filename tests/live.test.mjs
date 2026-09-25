import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {liveAPI} from '../worker/live.mjs';
import {revealStory,clockValues,initialLiveState} from '../dist/live-shared.mjs';
function setup(){
  const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
  function prepared(sql,args=[]){const st=db.prepare(sql);return {bind(...v){return prepared(sql,v);},async first(){return st.get(...args)||null;},async all(){return {results:st.all(...args)};},execute(){return {meta:{changes:Number(st.run(...args).changes)}};},async run(){return this.execute();}};}
  const env={DB:{prepare:prepared,async batch(statements){db.exec('BEGIN');try{const r=statements.map(s=>s.execute());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};
  const client=()=>{let cookie='';return async(action,options={})=>{const response=await liveAPI(new Request('https://test.invalid/api/live'+(options.query||''),{method:action?'POST':'GET',headers:{Cookie:cookie,...(action?{Origin:options.origin||'https://test.invalid','Content-Type':'application/json'}:{})},...(action?{body:JSON.stringify(action)}:{})}),env);if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,data:await response.json()};};};
  return {db,client};
}
async function pair(ctx,invite=false){const a=ctx.client(),b=ctx.client();await a();await b();const created=await a({type:invite?'create':'match',name:'白棋友'});assert.equal(created.status,200);const joined=await b({type:invite?'join':'match',room:created.data.room.id,name:'黑棋友'});assert.equal(joined.status,200);assert.equal(joined.data.room.status,'active');return {a,b,id:joined.data.room.id};}
async function move(client,uci,intent,guess){const {room}= (await client()).data;return client({type:'move',room:room.id,revision:room.revision,uci,intent,guess});}
test('concurrent matchmaking creates exactly two distinct seats per game and one game per visitor',async()=>{
  const ctx=setup();try{const clients=Array.from({length:12},()=>ctx.client());await Promise.all(clients.map(c=>c()));const joined=await Promise.all(clients.map((c,i)=>c({type:'match',name:'Player '+i})));assert.ok(joined.every(r=>r.status===200));
    assert.equal(ctx.db.prepare("SELECT COUNT(*) n FROM knight_live_rooms WHERE status='active'").get().n,6);assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM knight_live_players').get().n,12);
    await Promise.all(Array.from({length:8},()=>clients[0]({type:'match'})));assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM knight_live_players').get().n,12);
    const games=ctx.db.prepare('SELECT white_owner,black_owner FROM knight_live_rooms').all();assert.ok(games.every(g=>g.white_owner!==g.black_owner));
  }finally{ctx.db.close();}
});
test('private invites stay out of public matching; third visitors cannot join or act',async()=>{
  const ctx=setup();try{const a=ctx.client(),b=ctx.client(),c=ctx.client();await Promise.all([a(),b(),c()]);const room=(await a({type:'create',name:'小马'})).data.room;
    const publicRoom=(await c({type:'match'})).data.room;assert.notEqual(publicRoom.id,room.id);
    assert.equal((await b({type:'join',room:room.id})).data.room.side,'b');
    assert.equal((await c({type:'move',room:room.id,revision:1,uci:'e2e4'})).status,403);
    const spy=ctx.client();await spy();const invite=await spy(null,{query:'?invite='+room.id});assert.equal(invite.data.room,null);assert.deepEqual(Object.keys(invite.data.invitation).sort(),['available','id','name']);assert.equal((await spy({type:'join',room:room.id})).status,409);
  }finally{ctx.db.close();}
});
test('server validates turn and chess moves, deduplicates concurrent submissions, and restores a session',async()=>{
  const ctx=setup();try{const {a,b,id}=await pair(ctx);assert.equal((await move(b,'e7e5')).status,409);assert.equal((await move(a,'e2e5')).status,400);
    const r=(await a()).data.room,action={type:'move',room:id,revision:r.revision,uci:'e2e4',intent:'bluff'};
    const results=await Promise.all([a(action),a(action)]);assert.equal(results.filter(r=>r.status===200).length,1);
    const restored=(await a()).data.room;assert.equal(restored.moves.length,1);assert.equal(restored.moves[0].uci,'e2e4');assert.equal(restored.side,'w');
    assert.equal((await move(b,'e7e5')).status,200);assert.equal((await a()).data.room.moves.length,2);
    assert.equal((await a(action,{origin:'https://evil.invalid'})).status,403);
  }finally{ctx.db.close();}
});
test('sealed thoughts and guesses remain private until checkmate; reveal is based on actual choices',async()=>{
  const ctx=setup();try{const {a,b}=await pair(ctx);
    await move(a,'f2f3','lost');let seen=(await b()).data.room;assert.equal(seen.moves[0].intent,undefined);assert.equal(seen.moves[0].guess,undefined);
    await move(b,'e7e5','lost','calm');seen=(await a()).data.room;assert.equal(seen.moves[1].intent,undefined);assert.equal(seen.moves[1].guess,undefined);
    await move(a,'g2g4','bluff','lost');const end=await move(b,'d8h4','calm','bluff');assert.equal(end.data.room.status,'finished');assert.equal(end.data.room.result,'0-1');assert.equal(end.data.room.reason,'将死');
    assert.equal(end.data.room.moves[0].intent,'lost');const reveal=revealStory(end.data.room.moves);assert.equal(reveal.title,'原来，我们都在硬撑。');assert.equal(reveal.total,3);assert.equal(reveal.hits,2);
  }finally{ctx.db.close();}
});
test('server clocks, increments, timeout and draw agreement cannot be supplied by the client',async()=>{
  const ctx=setup();try{const {a,b,id}=await pair(ctx);ctx.db.prepare('UPDATE knight_live_rooms SET turn_at=? WHERE id=?').run(Date.now()-12000,id);
    const next=await move(a,'e2e4');assert.ok(next.data.room.clocks.w<292000&&next.data.room.clocks.w>289000);assert.ok(next.data.room.clocks.b<=300000);
    let r=(await a()).data.room;await a({type:'draw',room:id,revision:r.revision});r=(await b()).data.room;const end=await b({type:'draw',room:id,revision:r.revision});assert.equal(end.data.room.result,'1/2-1/2');assert.equal(end.data.room.status,'finished');
    const ctx2=setup();try{const p=await pair(ctx2);ctx2.db.prepare('UPDATE knight_live_rooms SET turn_at=? WHERE id=?').run(Date.now()-301000,p.id);const flag=await p.a();assert.equal(flag.data.room.status,'finished');assert.equal(flag.data.room.reason,'超时');assert.equal(flag.data.room.clocks.w,0);}finally{ctx2.db.close();}
  }finally{ctx.db.close();}
});
test('cancellation racing a join never cancels an active match; stale queues are not paired',async()=>{
  const ctx=setup();try{const a=ctx.client(),b=ctx.client();await a();await b();const waiting=(await a({type:'match'})).data.room;
    const [cancel,join]=await Promise.all([a({type:'cancel',room:waiting.id,revision:0}),b({type:'match'})]);
    const final=ctx.db.prepare('SELECT * FROM knight_live_rooms WHERE id=?').get(waiting.id);assert.ok(final.status==='cancelled'||final.status==='active');if(final.status==='active')assert.equal(cancel.status,409);
    const stale=ctx.client();await stale();const candidate=(await stale({type:'create'})).data.room;ctx.db.prepare('UPDATE knight_live_players SET seen_at=? WHERE room_id=?').run(Date.now()-60000,candidate.id);const newcomer=ctx.client();await newcomer();assert.equal((await newcomer({type:'join',room:candidate.id})).status,409);
  }finally{ctx.db.close();}
});
test('clock display never runs backwards and reveal never invents missing thoughts',()=>{
  const state=initialLiveState();assert.deepEqual(clockValues(state,2000,1000),{w:300000,b:300000});assert.deepEqual(clockValues(state,0,900000),{w:0,b:300000});assert.equal(revealStory([]).sealed.length,0);assert.equal(revealStory([]).total,0);
});
