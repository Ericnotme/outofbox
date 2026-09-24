import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {parseCollection,prepareReport,demoCollection,observedMoves,splitPgn} from '../dist/preparation.mjs';
import {sessionAdvice,weeklySessions} from '../dist/session.mjs';
import {sessionAPI} from '../worker/session.mjs';
import {normalizePlaces,distanceKm,discoveryAPI,limitedText} from '../worker/discovery.mjs';
test('preparation uses player perspective, deduplicates PGNs, and does not compare mixed speeds or sparse samples',()=>{
  const text=demoCollection(),c=parseCollection(text+'\n\n'+text);assert.equal(c.games.length,24);assert.equal(c.duplicates,24);
  const r=prepareReport(c.games,'demoopponent');assert.equal(r.n,24);assert.equal(r.side,'b');assert.equal(r.w,4);assert.equal(r.d,4);assert.equal(r.l,16);assert.equal(r.lines[0].n,16);assert.ok(r.trend);
  assert.equal(prepareReport(c.games,'DemoOpponent',{side:'w'}).n,0);
  assert.equal(prepareReport(c.games.slice(0,19),'DemoOpponent').trend,null);
  const mixed=c.games.map((g,i)=>({...g,speed:i%2?'blitz':'rapid'}));assert.equal(prepareReport(mixed,'DemoOpponent').trend,null);
  const future=prepareReport(c.games,'DemoOpponent',{days:30,now:Date.parse('2026-09-20')});assert.ok(future.games.every(g=>g.stamp<=Date.parse('2026-09-21')));
  const g=r.lines[0].games[0],before=g.moves[5].before;assert.equal(observedMoves(r.games,before,'b')[0].san,'Bc5');
  assert.equal(parseCollection('[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 e5 *').games.length,0);
  assert.equal(splitPgn('[White "A"]\n\n1. e4 {\n[Event "fake"]\n} e5 1-0\n\n[White "B"]\n\n1. d4 d5 1-0').length,2);
});
test('daily advice follows prior commitments without claiming losses diagnose tilt',()=>{
  const s={startedAt:10000,budget:3,minutes:30,lossLimit:2,energy:'calm',games:[]};assert.equal(sessionAdvice(s,11000).kind,'play');
  assert.equal(sessionAdvice({...s,games:[{result:'l'}]},11000).kind,'play');
  assert.equal(sessionAdvice({...s,games:[{result:'l'},{result:'l'}]},11000).kind,'stop');
  assert.equal(sessionAdvice({...s,games:[{result:'l'},{result:'d'},{result:'l'}],budget:5},11000).kind,'play');
  assert.equal(sessionAdvice(s,1810000).kind,'stop');assert.equal(sessionAdvice({...s,energy:'tired'},11000).kind,'pause');
  const ended={...s,endedAt:20000,reflection:'check threats'};assert.equal(sessionAdvice(ended,25000).kind,'done');assert.equal(weeklySessions([ended],25000).withinBudget,1);
});
function environment(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../drizzle/0001_handy_goliath.sql',import.meta.url),'utf8'));return {DB:{prepare(sql){const st=db.prepare(sql);return {bind(...values){return {async first(){return st.get(...values);},async run(){return {meta:{changes:Number(st.run(...values).changes)}};}};}};}},db};}
test('daily sessions persist, isolate visitors, reject stale concurrent writes, and support correcting and deleting records',async()=>{
  const env=environment();const req=(cookie,a,origin='https://test.invalid')=>new Request('https://test.invalid/api/session',{method:a?'POST':'GET',headers:{Cookie:cookie||'',...(a?{Origin:origin,'Content-Type':'application/json'}:{})},body:a?JSON.stringify(a):undefined});
  try{
    const first=await sessionAPI(req(),env),cookie=first.headers.get('set-cookie').split(';')[0];let state=await first.json();assert.equal(state.revision,-1);
    const send=async a=>{const r=await sessionAPI(req(cookie,{...a,revision:state.revision}),env);assert.equal(r.status,200);state=await r.json();return state;};
    const start={type:'start',id:'session-001',budget:3,minutes:30,lossLimit:2,energy:'calm',focus:'checks'};await send(start);assert.equal(state.sessions.length,1);
    assert.equal((await (await sessionAPI(req('knight_book='+'b'.repeat(64)),env)).json()).sessions.length,0);
    await send({type:'game',id:start.id,gameId:'game-001',result:'l'});assert.equal(state.sessions[0].games.length,1);
    const stale={type:'game',id:start.id,gameId:'game-002',result:'w',revision:state.revision};
    await send({type:'game',id:start.id,gameId:'game-003',result:'l'});assert.equal((await sessionAPI(req(cookie,stale),env)).status,409);
    await send({type:'undo',id:start.id});assert.equal(state.sessions[0].games.length,1);
    await send({type:'finish',id:start.id,reflection:'先看威胁',helpful:true});assert.ok(state.sessions[0].endedAt);
    const reread=await (await sessionAPI(req(cookie),env)).json();assert.equal(reread.sessions[0].reflection,'先看威胁');
    assert.equal((await sessionAPI(req(cookie,{type:'clear',revision:state.revision},'https://evil.test'),env)).status,403);
    await send({type:'clear'});assert.equal(state.sessions.length,0);
  }finally{env.db.close();}
});
test('place discovery rejects invalid input and excludes private or unrelated places',async()=>{
  const elements=[{type:'node',id:1,lat:0,lon:0,tags:{sport:'chess',club:'sport',name:'Club'}},{type:'node',id:2,lat:0,lon:.001,tags:{sport:'chess',leisure:'picnic_table'}},{type:'node',id:3,lat:0,lon:0,tags:{name:'Chess music bar'}},{type:'node',id:4,lat:0,lon:0,tags:{sport:'chess',access:'private'}},{type:'node',id:5,lat:10,lon:10,tags:{sport:'chess'}}];
  const p=normalizePlaces(elements,0,0,5);assert.equal(p.length,2);assert.equal(p[0].kind,'club');assert.equal(p[1].kind,'table');assert.ok(distanceKm(0,0,0,1)>100);
  assert.equal((await discoveryAPI(new Request('https://test.invalid/api/places?lat=x&lon=0&radius=5'))).status,400);
  assert.equal((await discoveryAPI(new Request('https://test.invalid/api/prepare?provider=lichess&username=../../bad'))).status,400);
  await assert.rejects(()=>limitedText(new Response('123456'),3),/数据量太大/);
});
