import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {Chess} from '../dist/vendor/chess.mjs';
import {dailyScore,readTake,uci,phrase,lastDays,validDay} from '../dist/jam.mjs';
import {jamsAPI} from '../worker/jams.mjs';
import {JazzBand} from '../dist/jam-audio.mjs';
function sample(day='2026-09-24',id='sample-jam-0001'){
  const game=new Chess(dailyScore(day).fen),moves=[];
  for(let i=0;i<8&&!game.isGameOver();i++){const legal=game.moves({verbose:true});moves.push(uci(game.move(legal[(i*5+3)%legal.length])));}
  return {id,day,version:1,moves,blue:[1]};
}
test('daily scores repeat deterministically, change across days, remain legal, and cover date boundaries',()=>{
  const days=lastDays('2026-10-03',40),configs=days.map(dailyScore);
  assert.equal(new Set(configs.map(c=>`${c.fen}|${c.root}|${c.tempo}`)).size,40);
  for(const score of configs){assert.deepEqual(score,dailyScore(score.day));const game=new Chess(score.fen);assert.ok(!game.isGameOver());assert.equal(game.turn(),'w');assert.equal(readTake(sample(score.day)).moves.length,8);}
  assert.deepEqual(lastDays('2026-01-02',3),['2025-12-31','2026-01-01','2026-01-02']);assert.equal(validDay('2026-02-30'),false);
});
test('scores reject incomplete, illegal, malformed or incompatible recordings; blue notes resolve by semitone',()=>{
  const take=sample(),{moves}=readTake(take),score=dailyScore(take.day);
  for(const invalid of [{...take,moves:take.moves.slice(0,2)},{...take,moves:['a1a8',...take.moves.slice(1)]},{...take,blue:[8]},{...take,blue:[1,1]},{...take,version:2},{...take,day:'2026-02-30'},{...take,id:'<svg>'}])assert.throws(()=>readTake(invalid));
  assert.deepEqual(readTake(take).take,take);const normal=phrase(score,moves[1],1),blue=phrase(score,moves[1],1,true);assert.equal(blue.notes[0],normal.notes[0]-1);assert.equal(blue.notes[1],blue.notes[0]+1);assert.deepEqual(blue.chord,normal.chord);
});
function environment(){const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));return {db,DB:{prepare(sql){const st=db.prepare(sql);return {bind(...v){return {async first(){return st.get(...v);},async run(){return {meta:{changes:Number(st.run(...v).changes)}};}};}};}}};}
test('jam storage survives rereads, isolates visitors, retries concurrent saves and deduplicates retries',async()=>{
  const env=environment(),req=(cookie,take,origin='https://test.invalid')=>new Request('https://test.invalid/api/jams',{method:take?'POST':'GET',headers:{Cookie:cookie||'',...(take?{Origin:origin,'Content-Type':'application/json'}:{})},body:take?JSON.stringify(take):undefined});
  try{
    const fresh=await jamsAPI(req(),env),cookie=fresh.headers.get('set-cookie').split(';')[0],a=sample(),b=sample('2026-09-23','sample-jam-0002');
    assert.deepEqual(await fresh.json(),{takes:[]});assert.ok(fresh.headers.get('set-cookie').includes('HttpOnly'));
    const both=await Promise.all([jamsAPI(req(cookie,a),env),jamsAPI(req(cookie,b),env)]);assert.ok(both.every(r=>r.status===200));
    const repeat=await (await jamsAPI(req(cookie,a),env)).json();assert.equal(repeat.takes.length,2);
    assert.equal((await (await jamsAPI(req(cookie),env)).json()).takes.length,2);
    assert.equal((await (await jamsAPI(req('knight_book='+'a'.repeat(64)),env)).json()).takes.length,0);
    assert.equal((await jamsAPI(req(cookie,{...a,blue:[]}),env)).status,409);
    assert.equal((await jamsAPI(req(cookie,a,'https://evil.invalid'),env)).status,403);
    assert.equal((await jamsAPI(req(cookie,{...a,moves:['e2e8']}),env)).status,400);
    for(let i=0;i<31;i++)assert.equal((await jamsAPI(req(cookie,{...a,id:`sample-jam-${String(i+100).padStart(4,'0')}`}),env)).status,200);
    assert.equal((await (await jamsAPI(req(cookie),env)).json()).takes.length,30);
  }finally{env.db.close();}
});
test('the band stays silent until enabled, schedules voices, and cancels them when muted',async()=>{
  const original=globalThis.AudioContext,nodes=[];const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  class FakeAudio{
    constructor(){this.currentTime=10;this.sampleRate=8000;this.state='suspended';this.destination={};}
    async resume(){this.state='running';}async suspend(){this.state='suspended';}
    node(){return {connect(){},disconnect(){}};}createGain(){return {...this.node(),gain:param()};}createDynamicsCompressor(){return {...this.node(),threshold:param(),ratio:param()};}
    createOscillator(){const n={...this.node(),frequency:param(),started:false,stopped:false,start(at){assert.ok(at>=10);this.started=true;},stop(at){if(at===undefined)this.stopped=true;}};nodes.push(n);return n;}
    createBufferSource(){return this.createOscillator();}createBuffer(_,length){return {getChannelData(){return new Float32Array(length);}};}createBiquadFilter(){return {...this.node(),frequency:param()};}
  }
  globalThis.AudioContext=FakeAudio;
  try{const band=new JazzBand(),take=sample(),{moves}=readTake(take),score=dailyScore(take.day);band.live(score,moves[0],0,false);assert.equal(nodes.length,0);await band.enable();band.live(score,moves[0],0,true);assert.ok(nodes.length>20);assert.ok(nodes.every(n=>n.started));band.mute();assert.ok(nodes.every(n=>n.stopped));assert.equal(band.enabled,false);assert.equal(band.context.state,'suspended');const count=nodes.length;band.live(score,moves[1],1,false);assert.equal(nodes.length,count);}finally{globalThis.AudioContext=original;}
});
