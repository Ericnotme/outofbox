import {Chess} from './vendor/chess.mjs';
import {fromUci,uci} from './review.mjs';
export const THEMES={'king':'王的安全','mate':'把握将杀','material':'子力保护','capture':'吃子机会','check':'应对将军','choice':'局面选择'};
export const PHASES={opening:'开局',middle:'中局',end:'残局'};
const names={p:'兵',n:'马',b:'象',r:'车',q:'后',k:'王'};
const values={p:100,n:320,b:330,r:500,q:900,k:0};
export function phaseOf(fen){const b=new Chess(fen),material=b.board().flat().filter(p=>p&&p.type!=='p').reduce((s,p)=>s+values[p.type],0);return material<=2600?'end':Number(fen.split(' ')[5])<=10?'opening':'middle';}
function legalLine(fen,sequence){const b=new Chess(fen),moves=[];for(const code of (sequence||[]).slice(0,8)){try{moves.push(b.move(fromUci(code)));}catch{break;}}return moves;}
export function describeMove(fen,code){try{const m=new Chess(fen).move(fromUci(code));return `${m.san}：${names[m.piece]}从 ${m.from} 到 ${m.to}${m.captured?'，吃掉'+names[m.captured]:''}${m.promotion?'，升变为'+names[m.promotion]:''}${m.san.endsWith('#')?'，将死':m.san.endsWith('+')?'，将军':''}`;}catch{return '此走法已失效，请重新复盘。';}}
export function explainPosition(task){
  const board=new Chess(task.fen),good=legalLine(task.fen,[task.best]),bad=legalLine(task.fen,[task.played,...(task.refutation||[])]),best=good[0],reply=bad[1];
  let theme='choice',cause='这一步降低了引擎对局面的评价。请沿参考变化比较双方的应手；短变化不能证明完整的得失。';
  if(task.missedMate){theme='mate';cause='走子前引擎发现了强制将杀，实际走法没有保留这条将杀路线。先看将军、吃子和连续威胁。';}
  else if(task.allowsMate){theme='king';cause='走子后引擎发现对方有强制将杀。先检查对方的将军、王的逃生格和能否挡住攻击。';}
  else if(board.inCheck()){theme='check';cause='你正在被将军。比较所有合法应将：移王、吃掉攻击子、挡住线路。';}
  else if(reply?.captured&&values[reply.captured]>=320){theme='material';cause=`实际走法之后，对方可用 ${reply.san} 吃掉你的${names[reply.captured]}。继续核对能否回吃，以及是否有更强的将军；能被吃不一定等于净丢子。`;}
  else if(best?.captured){theme='capture';cause=`引擎建议先用 ${best.san} 吃掉${names[best.captured]}。计算对方回吃后的局面，避免只看第一步。`;}
  const reference=legalLine(task.fen,task.line?.length?task.line:[task.best]).map(m=>m.san);
  const punishment=bad.slice(1).map(m=>m.san);
  return {theme,title:THEMES[theme],cause,better:describeMove(task.fen,task.best),reference,punishment,
    habit:theme==='king'||theme==='check'?'落子前，先问：对方下一步有哪些将军？':theme==='material'?'落子前，逐个检查没有保护的棋子，再看对方能否连将带吃。':theme==='mate'?'优势局面先找强制走法：将军、吃子、威胁。':'先找出两个候选走法，再为每个走法计算对手最强的回应。'};
}
export function tasksFromReport(report,record,color){return report.moves.filter(m=>m.color===color&&(m.loss>=5||m.missedMate)&&m.best&&m.bestSan&&m.bestSan!==m.san).map(m=>{
  const original=record[m.ply-1];if(!original)return null;
  const task={fen:original.before,best:m.best,played:uci(original),line:(m.before.pv||[]).slice(0,8),refutation:(m.after.pv||[]).slice(0,8),
    color,san:m.san,number:m.number,loss:m.loss,depth:m.before.depth,missedMate:!!m.missedMate,allowsMate:m.after.winner!==color&&m.after.mate!==undefined&&!m.before.mate,category:m.category};
  return {...task,theme:explainPosition(task).theme,phase:phaseOf(task.fen)};
}).filter(Boolean);}
export function validateTask(input){
  if(!input||typeof input!=='object'||typeof input.fen!=='string'||input.fen.length>120)throw new Error('错题格式无效');
  const board=new Chess(input.fen);if(board.isGameOver())throw new Error('已结束的局面不能用于练习');
  const move=board.move(fromUci(String(input.best)));const original=new Chess(input.fen).move(fromUci(String(input.played)));
  if(uci(move)===uci(original))throw new Error('原走法和建议走法相同');
  const line=legalLine(input.fen,Array.isArray(input.line)?input.line:[]).map(uci);
  const refutation=legalLine(original.after,Array.isArray(input.refutation)?input.refutation:[]).map(uci);
  const task={fen:original.before,best:uci(move),played:uci(original),line:line[0]===uci(move)?line:[uci(move)],refutation,color:original.color,san:original.san,number:Number(original.before.split(' ')[5]),
    loss:Math.max(0,Math.min(100,Number(input.loss)||0)),depth:Math.max(0,Math.min(100,Number(input.depth)||0)),missedMate:input.missedMate===true,allowsMate:input.allowsMate===true};
  return {...task,theme:explainPosition(task).theme,phase:phaseOf(task.fen)};
}
export const positionKey=task=>task.fen.split(' ').slice(0,4).join(' ')+'|'+task.best;
export function scheduleReview(item,success,assisted,now=Date.now()){
  const earned=success&&!assisted,streak=earned?(item.streak||0)+1:0,days=earned?[1,3,7,14,30][Math.min(streak-1,4)]:0;
  return {...item,streak,attempts:(item.attempts||0)+1,successes:(item.successes||0)+(earned?1:0),lastReviewed:now,dueAt:now+(earned?days*86400000:10*60000)};
}
export function notebookStats(items,now=Date.now()){
  const themes=Object.entries(THEMES).map(([key,label])=>({key,label,count:items.filter(i=>i.theme===key).length})).filter(x=>x.count).sort((a,b)=>b.count-a.count);
  const attempts=items.reduce((s,i)=>s+(i.attempts||0),0),successes=items.reduce((s,i)=>s+(i.successes||0),0);
  return {total:items.length,due:items.filter(i=>i.dueAt<=now).length,mastered:items.filter(i=>i.streak>=3).length,attempts,successes,rate:attempts?Math.round(successes/attempts*100):null,themes};
}
