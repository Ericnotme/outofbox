import {Chess} from './vendor/chess.mjs';

// Independent review implementation. Move formulas are documented at
// https://lichess.org/page/accuracy . Aggregation and classifications below
// are Knight Room's own rules, not a reproduction of CAPS or Lichess ratings.
export const CLASSES = {
  best:{label:'最佳',symbol:'★'}, excellent:{label:'优秀',symbol:'✓'},
  good:{label:'稳健',symbol:'·'}, inaccuracy:{label:'不精确',symbol:'?!'},
  mistake:{label:'失误',symbol:'?'}, blunder:{label:'严重失误',symbol:'??'}
};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
export const uci=move=>move.from+move.to+(move.promotion||'');
export const fromUci=move=>({from:move.slice(0,2),to:move.slice(2,4),...(move[4]?{promotion:move[4]}:{})});
export function winPercent(cp){return 100/(1+Math.exp(-0.00368208*clamp(cp,-10000,10000)));}
export function moveAccuracy(loss){return loss<=0?100:clamp(103.1668*Math.exp(-0.04354*loss)-3.1669,0,100);}
export function classification(loss,isBest=false){
  if(isBest)return 'best';
  if(loss>=20)return 'blunder';
  if(loss>=10)return 'mistake';
  if(loss>=5)return 'inaccuracy';
  return loss<1?'excellent':'good';
}
export function normalizeEvaluation(answer,turn){
  if(!answer.score||!Number.isFinite(answer.score.value))throw new Error('引擎没有返回有效评分，请改用细致模式重试。');
  const sign=turn==='w'?1:-1,value=answer.score.value*sign;
  if(answer.score.type==='mate'){
    const winner=answer.score.value===0?(turn==='w'?'b':'w'):(value>0?'w':'b');
    return {cp:winner==='w'?10000:-10000,win:winner==='w'?100:0,mate:Math.abs(value),winner,depth:answer.depth||0,best:answer.move,pv:answer.pv};
  }
  return {cp:value,win:winPercent(value),depth:answer.depth||0,best:answer.move,pv:answer.pv};
}
function terminalEvaluation(board){
  if(board.isCheckmate()){
    const winner=board.turn()==='w'?'b':'w';
    return {cp:winner==='w'?10000:-10000,win:winner==='w'?100:0,mate:0,winner,depth:0,terminal:true};
  }
  if(board.isDraw())return {cp:0,win:50,depth:0,terminal:true,draw:true};
  return null;
}
export function formatEvaluation(e){
  if(e.draw)return '和棋';
  if(e.mate!==undefined)return (e.winner==='w'?'白':'黑')+(e.mate===0?'方将死':`方 M${e.mate}`);
  return (e.cp>=0?'+':'')+(e.cp/100).toFixed(2);
}
export function gameAccuracy(moves){
  if(!moves.length)return null;
  const totalWeight=moves.reduce((s,m)=>s+m.weight,0);
  const weighted=moves.reduce((s,m)=>s+m.accuracy*m.weight,0)/totalWeight;
  const harmonic=moves.some(m=>m.accuracy===0)?0:moves.length/moves.reduce((s,m)=>s+1/m.accuracy,0);
  return clamp((weighted+harmonic)/2,0,100);
}

// Deliberately illustrative: no training dataset or Elo calibration is claimed.
// The anchors are disclosed in the UI; range is a display band, not confidence.
export function performanceEstimate(accuracy,moves,complete){
  const informative=moves.filter(m=>!m.forced&&!m.before?.terminal&&m.beforeWin>=10&&m.beforeWin<=90).length;
  if(!complete)return {available:false,reason:'棋谱未结束，暂不估分'};
  if(moves.length<10||informative<6)return {available:false,reason:'有效走子不足，暂不估分'};
  const anchors=[[0,100],[40,400],[60,800],[70,1100],[80,1450],[90,1850],[95,2200],[100,2600]];
  const x=clamp(accuracy,0,100);
  let value=2600;
  for(let i=1;i<anchors.length;i++){
    const [hi,hiRating]=anchors[i],[lo,loRating]=anchors[i-1];
    if(x<=hi){value=loRating+(x-lo)/(hi-lo)*(hiRating-loRating);break;}
  }
  const center=Math.round(value/50)*50,band=informative<15?600:400;
  return {available:true,center,low:Math.max(100,center-band),high:Math.min(3000,center+band),informative};
}
export function buildReport(record,evaluations,{complete=false,duration=450}={}){
  if(evaluations.length!==record.length+1)throw new Error('棋谱与评分长度不匹配。');
  const moves=record.map((move,i)=>{
    const before=evaluations[i],after=evaluations[i+1],white=move.color==='w';
    const beforeWin=white?before.win:100-before.win,afterWin=white?after.win:100-after.win;
    const rawLoss=Math.max(0,beforeWin-afterWin),isBest=before.best===uci(move),forced=before.legalCount===1;
    // Adjacent timed searches have different horizons. A move that the engine
    // itself selected (or the only legal move) must not become a false blunder
    // merely because its continuation was searched more deeply afterwards.
    const loss=isBest||forced?0:rawLoss;
    const window=evaluations.slice(Math.max(0,i-2),Math.min(evaluations.length,i+3)).map(e=>e.win);
    const average=mean(window),weight=clamp(Math.sqrt(mean(window.map(x=>(x-average)**2))),1,12);
    let bestSan=null,line=[];
    const board=new Chess(move.before);
    if(before.best){try{bestSan=board.move(fromUci(before.best)).san;}catch{}}
    const variation=new Chess(move.before);
    for(const candidate of (before.pv||[]).slice(0,5)){try{line.push(variation.move(fromUci(candidate)).san);}catch{break;}}
    return {ply:i+1,color:move.color,san:move.san,number:Number(move.before.split(' ')[5]),
      before,after,beforeWin,afterWin,rawLoss,loss,accuracy:moveAccuracy(loss),weight,
      category:classification(loss,isBest||forced),best:before.best,bestSan,line,forced,
      missedMate:!isBest&&!forced&&before.winner===move.color&&before.mate!==undefined&&after.winner!==move.color};
  });
  const players={};
  for(const color of ['w','b']){
    const own=moves.filter(m=>m.color===color),accuracy=gameAccuracy(own);
    const counts=Object.fromEntries(Object.keys(CLASSES).map(key=>[key,own.filter(m=>m.category===key).length]));
    players[color]={accuracy,count:own.length,counts,performance:accuracy===null?{available:false,reason:'没有走子记录'}:performanceEstimate(accuracy,own,complete)};
  }
  const depths=evaluations.filter(e=>!e.terminal).map(e=>e.depth);
  return {moves,evaluations,players,complete,duration,minDepth:depths.length?Math.min(...depths):0,maxDepth:depths.length?Math.max(...depths):0};
}

export async function reviewGame({record,initialFen,engine,duration=450,complete=false,onProgress=()=>{},isCancelled=()=>false}){
  const board=new Chess(initialFen),evaluations=[],past=[];
  for(let i=0;i<=record.length;i++){
    if(isCancelled())throw new Error('cancelled');
    const legalCount=board.moves().length;
    let evaluation=terminalEvaluation(board);
    if(!evaluation){
      const answer=await engine.search(initialFen,20,duration,{moves:past});
      if(isCancelled())throw new Error('cancelled');
      evaluation=normalizeEvaluation(answer,board.turn());
    }
    evaluations.push({...evaluation,legalCount});
    onProgress(i+1,record.length+1);
    if(i<record.length){const move=record[i];board.move({from:move.from,to:move.to,...(move.promotion?{promotion:move.promotion}:{})});past.push(uci(move));}
  }
  return buildReport(record,evaluations,{complete:complete||board.isGameOver(),duration});
}
