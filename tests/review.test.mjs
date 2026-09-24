import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from '../dist/vendor/chess.mjs';
import {winPercent,moveAccuracy,classification,normalizeEvaluation,gameAccuracy,performanceEstimate,buildReport,reviewGame} from '../dist/review.mjs';

test('scores stay in white perspective, including mates for either side',()=>{
  assert.equal(winPercent(0),50);
  assert.ok(Math.abs(winPercent(200)+winPercent(-200)-100)<1e-10);
  assert.equal(normalizeEvaluation({score:{type:'cp',value:220}},'b').cp,-220);
  assert.equal(normalizeEvaluation({score:{type:'mate',value:3}},'b').winner,'b');
  assert.equal(normalizeEvaluation({score:{type:'mate',value:-2}},'b').winner,'w');
  assert.equal(normalizeEvaluation({score:{type:'mate',value:0}},'w').winner,'b');
  assert.throws(()=>normalizeEvaluation({},'w'),/有效评分/);
});
test('loss thresholds and game aggregation penalize blunders without negatives',()=>{
  assert.equal(moveAccuracy(-3),100);assert.equal(moveAccuracy(0),100);
  assert.equal(moveAccuracy(100),0);assert.ok(moveAccuracy(10)<moveAccuracy(5));
  assert.equal(classification(20),'blunder');assert.equal(classification(10),'mistake');
  assert.equal(classification(5),'inaccuracy');assert.equal(classification(0,true),'best');
  assert.equal(classification(30,true),'best');
  assert.equal(gameAccuracy([]),null);assert.equal(gameAccuracy([{accuracy:100,weight:1}]),100);
  assert.equal(gameAccuracy([{accuracy:100,weight:1},{accuracy:0,weight:1}]),25);
});
test('an Elo-scale display is gated on completed games and meaningful sample size',()=>{
  const moves=Array.from({length:20},()=>({forced:false,beforeWin:50}));
  assert.equal(performanceEstimate(90,moves,false).available,false);
  assert.equal(performanceEstimate(90,moves.slice(0,9),true).available,false);
  assert.equal(performanceEstimate(90,moves.map(m=>({...m,forced:true})),true).available,false);
  assert.equal(performanceEstimate(90,moves.map(m=>({...m,before:{terminal:true}})),true).available,false);
  assert.deepEqual(performanceEstimate(90,moves,true),{available:true,center:1850,low:1450,high:2250,informative:20});
  assert.equal(performanceEstimate(100,moves,true).high,3000);
  assert.equal(performanceEstimate(0,moves,true).low,100);
});
test('black-to-move setup uses actual colors and fullmove numbers, not array parity',()=>{
  const game=new Chess('4k3/8/8/8/8/8/8/R3K3 b Q - 0 12');
  const move=game.move('Kf7');
  const report=buildReport([move],[{win:50,cp:0,legalCount:4},{win:90,cp:600}],{complete:true});
  assert.equal(report.players.w.accuracy,null);
  assert.equal(report.moves[0].color,'b');assert.equal(report.moves[0].number,12);
  assert.equal(report.moves[0].loss,40);assert.equal(report.moves[0].category,'blunder');
});
test('a best move or forced move is not a blunder due to search horizon noise',()=>{
  const game=new Chess(),move=game.move('e4');
  for(const before of [{win:80,cp:500,best:'e2e4',legalCount:20},{win:80,cp:500,legalCount:1}]){
    const report=buildReport([move],[before,{win:40,cp:-100}]);
    assert.equal(report.moves[0].rawLoss,40);assert.equal(report.moves[0].loss,0);
    assert.equal(report.moves[0].category,'best');assert.equal(report.players.w.accuracy,100);
  }
});
test('repetition detection and engine positions carry full move history',async()=>{
  const game=new Chess();game.loadPgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8');
  const record=game.history({verbose:true}),calls=[];
  const engine={async search(fen,skill,duration,{moves}){calls.push([...moves]);return {score:{type:'cp',value:0},depth:10};}};
  const report=await reviewGame({record,initialFen:record[0].before,engine});
  assert.equal(report.evaluations.at(-1).draw,true);assert.equal(report.evaluations.at(-1).win,50);
  assert.equal(report.complete,true);assert.equal(calls.length,8);assert.equal(calls[7].length,7);
  assert.deepEqual(calls[1],['g1f3']);assert.equal(report.players.b.accuracy,100);
});
test('checkmate endpoint is exact and resignation does not replace position evaluation',async()=>{
  const game=new Chess();game.loadPgn('1. f3 e5 2. g4 Qh4#');
  const record=game.history({verbose:true});
  const engine={async search(){return {score:{type:'cp',value:0},depth:10};}};
  const mate=await reviewGame({record,initialFen:record[0].before,engine});
  assert.equal(mate.evaluations.at(-1).winner,'b');assert.equal(mate.evaluations.at(-1).mate,0);
  const resigned=await reviewGame({record:record.slice(0,1),initialFen:record[0].before,engine,complete:true});
  assert.equal(resigned.evaluations.at(-1).win,50);assert.equal(resigned.evaluations.at(-1).terminal,undefined);
});
test('cancelled analysis never produces a completed report',async()=>{
  const game=new Chess();const move=game.move('e4');let cancelled=false;
  const engine={async search(){cancelled=true;return {score:{type:'cp',value:0}};}};
  await assert.rejects(reviewGame({record:[move],initialFen:move.before,engine,isCancelled:()=>cancelled}),/cancelled/);
});
