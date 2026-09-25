import {Chess} from './vendor/chess.mjs';
export const INTENTS={calm:'算过了',bluff:'虚张声势',lost:'我也没底'};
export const INITIAL_MS=300000,INCREMENT_MS=3000;
export function initialLiveState(){return {fen:new Chess().fen(),moves:[],whiteMs:INITIAL_MS,blackMs:INITIAL_MS,result:null,reason:null,draw:null};}
export function clockValues(state,turnAt,now,active=true){
  const clocks={w:state.whiteMs,b:state.blackMs};
  if(active)clocks[state.fen.split(' ')[1]]=Math.max(0,clocks[state.fen.split(' ')[1]]-Math.max(0,now-turnAt));
  return clocks;
}
export function replayGame(moves){const game=new Chess();for(const m of moves)game.move({from:m.uci.slice(0,2),to:m.uci.slice(2,4),promotion:m.uci[4]});return game;}
export function revealStory(moves){
  const sealed=moves.map((m,i)=>({...m,ply:i+1,side:i%2?'b':'w',read:moves[i+1]?.guess||null})).filter(m=>INTENTS[m.intent]);
  const guesses=sealed.filter(m=>INTENTS[m.read]),hits=guesses.filter(m=>m.read===m.intent).length;
  const bluff=sealed.filter(m=>m.intent==='bluff'),lost=sealed.filter(m=>m.intent==='lost');
  let title='棋局结束，人才刚刚出现。',line='棋盘记得每一步。现在，看看落子时的你们。';
  if(lost.some(m=>m.side==='w')&&lost.some(m=>m.side==='b')){title='原来，我们都在硬撑。';line='白方和黑方都留下了“我也没底”。两张镇定的脸，一场共同的冒险。';}
  else if(bluff.some(m=>m.read==='calm')){title='你以为是深谋远虑，其实是演技。';line='有一步“虚张声势”，被对面当成了“算过了”。棋盘不会眨眼，人会。';}
  else if(guesses.length&&hits===guesses.length){title='隔着棋盘，居然被你看穿了。';line='这局有答案的心声，你们全猜中了。下一盘，还能藏得住吗？';}
  else if(!sealed.length){title='这盘棋，保留一点神秘。';line='你们没有留下心声。下一盘，落子前试着封存一个念头。';}
  return {title,line,hits,total:guesses.length,sealed};
}
