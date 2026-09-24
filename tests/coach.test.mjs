import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {Chess} from '../dist/vendor/chess.mjs';
import {explainPosition,validateTask,scheduleReview,phaseOf,notebookStats} from '../dist/coach.mjs';
import {notebookAPI} from '../worker/notebook.mjs';
const b=new Chess();['f3','e5','g4'].forEach(m=>b.move(m));
const sample={fen:b.fen(),best:'d8h4',played:'b8c6',line:['d8h4'],refutation:[],missedMate:true,depth:14,loss:30};
test('explanations describe legal moves, mating opportunities, and phase without inventing a line',()=>{
  const task=validateTask(sample),info=explainPosition(task);
  assert.equal(task.color,'b');assert.equal(info.theme,'mate');assert.match(info.better,/将死/);assert.deepEqual(info.reference,['Qh4#']);
  assert.deepEqual(validateTask({...sample,line:['d8h4','a1a8'],refutation:['a1a8']}).line,['d8h4']);
  assert.equal(phaseOf('7k/8/6K1/8/8/8/8/R7 w - - 0 50'),'end');
  assert.throws(()=>validateTask({...sample,best:'d8d2'}));assert.throws(()=>validateTask({...sample,played:'d8h4'}));
});
test('unassisted spaced reviews progress; hints and errors reset and return sooner',()=>{
  let item={streak:0,attempts:0,successes:0};const now=100000;
  for(const [i,days] of [1,3,7,14,30,30].entries()){item=scheduleReview(item,true,false,now);assert.equal(item.dueAt-now,days*86400000);assert.equal(item.streak,i+1);}
  const hint=scheduleReview(item,true,true,now);assert.equal(hint.streak,0);assert.equal(hint.dueAt-now,600000);assert.equal(hint.successes,6);
  assert.equal(scheduleReview(item,false,false,now).streak,0);
  const stats=notebookStats([{...item,theme:'mate',dueAt:now-1},{...hint,theme:'king',dueAt:now+1}],now);assert.equal(stats.due,1);assert.equal(stats.mastered,1);
});
function environment(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../drizzle/0000_chilly_phalanx.sql',import.meta.url),'utf8'));return {DB:{prepare(sql){const statement=db.prepare(sql);return {bind(...values){return {async first(){return statement.get(...values);},async run(){return {meta:{changes:Number(statement.run(...values).changes)}};}};}};}},db};}
const request=(cookie,action,origin='https://knight.test')=>new Request('https://knight.test/api/notebook',{method:action?'POST':'GET',headers:{Cookie:cookie||'',...(action?{'Content-Type':'application/json',Origin:origin}:{})},body:action?JSON.stringify(action):undefined});
test('server notebook isolates anonymous visitors, deduplicates, saves across reloads, and grades idempotently',async()=>{
  const env=environment();
  try{
    const ar=await notebookAPI(request(),env),br=await notebookAPI(request(),env);
    const alice=ar.headers.get('set-cookie').split(';')[0],bob=br.headers.get('set-cookie').split(';')[0];assert.notEqual(alice,bob);assert.match(ar.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
    const send=async(cookie,action)=>{const res=await notebookAPI(request(cookie,action),env);assert.equal(res.status,200);return res.json();};
    const add=await send(alice,{type:'add',items:[sample]});assert.equal(add.added,1);const id=add.items[0].id;
    assert.equal((await send(bob)).items.length,0);assert.equal((await send(alice)).items.length,1);
    assert.equal((await send(alice,{type:'add',items:[sample]})).added,0);
    const action={type:'grade',id,event:'one-attempt-001',success:true,assisted:false};
    let grade=await send(alice,action);assert.equal(grade.items[0].streak,1);
    grade=await send(alice,action);assert.equal(grade.items[0].attempts,1);
    grade=await send(alice,{...action,event:'new-tab-stale-due'});assert.equal(grade.items[0].streak,1);
    const duplicate=await send(alice,{type:'add',items:[{...sample,depth:18}]});assert.equal(duplicate.items[0].streak,1);assert.equal(duplicate.items[0].depth,18);
    assert.equal((await notebookAPI(request(bob,action),env)).status,404);
    assert.equal((await notebookAPI(request(alice,{type:'clear'},'https://evil.test'),env)).status,403);
    assert.equal((await notebookAPI(request(alice,{type:'add',items:[{...sample,fen:'invalid'}]}),env)).status,400);
    await send(bob,{type:'import',items:duplicate.items});assert.equal((await send(bob)).items[0].streak,1);
    await send(alice,{type:'clear'});assert.equal((await send(alice)).items.length,0);assert.equal((await send(bob)).items.length,1);
  }finally{env.db.close();}
});
test('concurrent additions preserve both positions through optimistic updates',async()=>{
  const env=environment();try{const first=await notebookAPI(request(),env),cookie=first.headers.get('set-cookie').split(';')[0];
    const start=new Chess();const other={fen:start.fen(),best:'e2e4',played:'f2f3',depth:12};
    const results=await Promise.all([sample,other].map(item=>notebookAPI(request(cookie,{type:'add',items:[item]}),env)));assert.ok(results.every(r=>r.status===200));
    const state=await (await notebookAPI(request(cookie),env)).json();assert.equal(state.items.length,2);
  }finally{env.db.close();}
});
