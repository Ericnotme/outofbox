import {Chess} from './vendor/chess.mjs';
import {fromUci,uci} from './review.mjs';
const scenes=[
  {title:'出口，原来一直在这里',fen:'6k1/5ppp/8/8/8/8/6PP/4R1K1 w - - 0 1',choices:['h2h3','e1e8'],hook:'一边是随手推进，一边是突然收场。试试两种选择。',discovery:'王身前的兵，也可能变成挡住退路的墙。'},
  {title:'看起来只是一匹马',fen:'r1q3k1/5ppp/8/5N2/8/8/6PP/6K1 w - - 0 1',choices:['f5g3','f5e7'],hook:'马跳到不同的格子，会让谁开始紧张？',discovery:'马到 e7，同时攻击 g8 的王与 c8 的后。将军让对手必须先照顾王。'},
  {title:'大胆，是因为有人接住',fen:'5rk1/5ppp/8/7Q/8/3B4/6PP/4R1K1 w - - 0 1',choices:['h2h3','h5h7'],hook:'后往前多走一点。它究竟是孤身冒险，还是早有照应？',discovery:'d3 的象沿着对角线保护 h7。看见连接，才看见这一步。'}
];
export const pieceNames={k:'王',q:'后',r:'车',b:'象',n:'马',p:'兵'};
export function dailyScene(date=new Date()){const day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;return {...scenes[Math.floor(Date.parse(day+'T12:00:00Z')/86400000)%scenes.length],day};}
export function allScenes(){return scenes.map(s=>({...s,choices:[...s.choices]}));}
export function moveLabel(fen,code){const m=new Chess(fen).move(fromUci(code));return `${pieceNames[m.piece]} ${m.from} → ${m.to}${m.promotion?'，升变为'+pieceNames[m.promotion]:''}`;}
export function buildFuture(fen,choice,answer={}){
  const game=new Chess(fen),first=game.move(fromUci(choice)),moves=[first],positions=[fen,game.fen()];
  const continuation=answer.pv?.length?answer.pv:answer.move?[answer.move]:[];
  for(const code of continuation.slice(0,4)){if(game.isGameOver())break;try{moves.push(game.move(fromUci(code)));positions.push(game.fen());}catch{break;}}
  const terminal=game.isCheckmate()?'mate':game.isDraw()?'draw':null;
  const summary=terminal==='mate'?`${game.turn()==='w'?'黑方':'白方'}将死对方，路线在这里结束。`:terminal==='draw'?'这条路线到达和棋局面。':`先看这 ${moves.length} 步，后面仍有别的可能。`;
  return {fen,choice:uci(first),label:moveLabel(fen,choice),moves,positions,terminal,summary,depth:answer.depth||0};
}
export function stepCaption(move){return `${move.color==='w'?'白方':'黑方'}${pieceNames[move.piece]} ${move.from} → ${move.to}${move.captured?'，吃掉'+pieceNames[move.captured]:''}${move.promotion?'，升变为'+pieceNames[move.promotion]:''}${move.san.endsWith('#')?'。将死，国王已无路可退。':move.san.endsWith('+')?'。将军，对方必须先解围。':'。'}`;}
export class FutureExplorer{
  constructor(engine){this.engine=engine;this.job=0;this.cache=new Map();}
  cancel(){this.job++;this.engine.stop();}
  async explore(fen,choice){
    this.cancel();const job=this.job,key=fen+'|'+choice;if(this.cache.has(key))return this.cache.get(key);
    const first=buildFuture(fen,choice),after=new Chess(first.positions[1]);
    const answer=after.isGameOver()?{}:await this.engine.search(first.positions[1],20,850);
    if(job!==this.job)throw new Error('cancelled');
    const result=buildFuture(fen,choice,answer);this.cache.set(key,result);if(this.cache.size>30)this.cache.delete(this.cache.keys().next().value);return result;
  }
  async suggest(fen,except){
    this.cancel();const job=this.job,answer=await this.engine.search(fen,20,850);if(job!==this.job)throw new Error('cancelled');
    const game=new Chess(fen),best=game.move(fromUci(answer.move));
    if(uci(best)!==except)return {choice:uci(best),preferred:true};
    const alternative=new Chess(fen).moves({verbose:true}).find(m=>uci(m)!==except);return alternative?{choice:uci(alternative),preferred:false}:{choice:uci(best),preferred:true};
  }
}
