import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from '../dist/vendor/chess.mjs';
import {allScenes,dailyScene,buildFuture,FutureExplorer,stepCaption} from '../dist/futures.mjs';
test('daily first-visit scenes have legal alternatives and the promised tactical geometry',()=>{
  const scenes=allScenes();for(const s of scenes){const root=new Chess(s.fen);assert.ok(!root.isGameOver());for(const m of s.choices)assert.doesNotThrow(()=>buildFuture(s.fen,m));}
  assert.equal(buildFuture(scenes[0].fen,scenes[0].choices[1]).terminal,'mate');
  assert.equal(buildFuture(scenes[2].fen,scenes[2].choices[1]).terminal,'mate');
  const fork=new Chess(scenes[1].fen);fork.move('Ne7+');assert.ok(fork.isCheck());assert.ok(fork.isAttacked('c8','w'));
  assert.deepEqual(dailyScene(new Date(2026,8,24)),dailyScene(new Date(2026,8,24,23,59)));
  assert.notEqual(dailyScene(new Date(2026,8,24)).fen,dailyScene(new Date(2026,8,25)).fen);
});
test('future playback validates continuations, preserves its root, and stops at terminal or illegal moves',()=>{
  const fen=new Chess().fen(),future=buildFuture(fen,'e2e4',{pv:['e7e5','g1f3','b8c6','f1b5','a7a6'],depth:12});
  assert.equal(future.moves.length,5);assert.equal(future.positions.length,6);assert.equal(future.positions[0],fen);assert.equal(future.depth,12);
  assert.equal(buildFuture(fen,'e2e4',{pv:['e7e5','a1a8','g1f3']}).moves.length,2);
  assert.throws(()=>buildFuture(fen,'e2e8'));
  const mate=buildFuture(allScenes()[0].fen,'e1e8',{pv:['g8g7']});assert.equal(mate.moves.length,1);assert.match(stepCaption(mate.moves[0]),/将死/);
});
test('new choices cancel stale searches and cache completed branches without accepting obsolete results',async()=>{
  let resolveFirst,calls=0;const engine={stop(){},search(){calls++;if(calls===1)return new Promise(r=>resolveFirst=r);return Promise.resolve({move:'e7e5',pv:['e7e5'],depth:10});}},explorer=new FutureExplorer(engine),fen=new Chess().fen();
  const old=explorer.explore(fen,'d2d4'),latest=await explorer.explore(fen,'e2e4');resolveFirst({move:'d7d5',pv:['d7d5']});await assert.rejects(old,/cancelled/);
  assert.equal(latest.choice,'e2e4');assert.strictEqual(await explorer.explore(fen,'e2e4'),latest);assert.equal(calls,2);
  let invoked=false;const terminal=new FutureExplorer({stop(){},search(){invoked=true;throw new Error('unexpected');}});assert.equal((await terminal.explore(allScenes()[0].fen,'e1e8')).terminal,'mate');assert.equal(invoked,false);
});
