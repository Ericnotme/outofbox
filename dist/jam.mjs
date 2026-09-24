import {Chess} from './vendor/chess.mjs';
export const JAM_VERSION=1;
export const JAM_LENGTH=8;
const sets=[
  {title:'今天也可以摇摆',line:'待办事项很多。先把国王请上舞池。',opening:['e4','e5','Nf3','Nc6'],mood:'轻快 Swing'},
  {title:'马走日，今天走神',line:'人生暂时无解，马至少有八个方向。',opening:['d4','d5','Nf3','Nf6'],mood:'松弛 Swing'},
  {title:'允许一点不合时宜',line:'蓝音不是走错了，是旋律有自己的意见。',opening:['e4','c5','Nf3','d6'],mood:'午夜 Blues'},
  {title:'国王今天不上班',line:'没有绩效考核。后也终于松了一口气。',opening:['c4','e5','Nc3','Nf6'],mood:'暖调 Swing'},
  {title:'把坏心情升个半音',line:'有些事情想不通，可以先让它好听。',opening:['e4','e5','Bc4','Nc6'],mood:'慵懒 Blues'},
  {title:'没有标准答案的八步',line:'棋谱负责合法，你负责离谱。',opening:['Nf3','d5','g3','Nf6'],mood:'自由 Swing'},
  {title:'散场前，再任性一下',line:'今天不争胜负，争一小段好心情。',opening:['d4','Nf6','c4','e6'],mood:'夜色 Swing'}
];
export function localDay(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function validDay(day){return typeof day==='string'&&/^20\d\d-\d\d-\d\d$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;}
export function dayNumber(day){if(!validDay(day))throw new Error('日期无效');return Math.floor(Date.parse(day+'T12:00:00Z')/86400000);}
export function dailyScore(day=localDay()){
  const n=dayNumber(day),set=sets[n%sets.length],game=new Chess();set.opening.forEach(m=>game.move(m));
  const keys=[{root:60,key:'C'},{root:65,key:'F'},{root:62,key:'D'},{root:67,key:'G'},{root:63,key:'E♭'}],key=keys[Math.floor(n/7)%keys.length];
  return {...set,...key,day,fen:game.fen(),tempo:92+((n+Math.floor(n/35))%5)*4,number:n-dayNumber('2026-01-01')+1};
}
export function uci(move){return move.from+move.to+(move.promotion||'');}
export function readTake(input){
  if(!input||input.version!==JAM_VERSION||!validDay(input.day)||typeof input.id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(input.id)||!Array.isArray(input.moves)||!input.moves.length||input.moves.length>JAM_LENGTH||!Array.isArray(input.blue)||input.blue.length>JAM_LENGTH||input.blue.some(i=>!Number.isInteger(i)||i<0||i>=input.moves.length)||new Set(input.blue).size!==input.blue.length)throw new Error('乐谱格式无效');
  const game=new Chess(dailyScore(input.day).fen),moves=[];
  for(const m of input.moves){if(game.isGameOver()||typeof m!=='string'||!(/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)))throw new Error('走法无效');moves.push(game.move({from:m.slice(0,2),to:m.slice(2,4),...(m[4]?{promotion:m[4]}:{})}));}
  if(moves.length!==JAM_LENGTH&&!game.isGameOver())throw new Error('还没演奏完');
  return {take:{id:input.id,version:JAM_VERSION,day:input.day,moves:moves.map(uci),blue:[...input.blue].sort((a,b)=>a-b)},moves,game};
}
export function phrase(score,move,index,blue=false){
  const scale=[0,2,3,5,7,9,10,12],file=move.to.charCodeAt(0)-97,rank=+move.to[1]-1;
  const chords=[[0,4,7,11],[9,12,16,19],[2,5,9,12],[7,11,14,17]],chord=chords[index%4];
  const shift={p:0,n:2,b:4,r:1,q:5,k:3}[move.piece],start=(file+rank+shift)%7;
  const notes=[0,2,1,3].map((step,i)=>score.root+12+scale[(start+step)%8]+(i===0&&blue?-1:0));
  if(blue)notes[1]=notes[0]+1;
  if(move.captured)notes[2]+=12;
  return {notes,chord:chord.map(n=>score.root+n),bass:score.root-24+chord[0],beat:60/score.tempo,color:move.color,blue};
}
export function lastDays(day=localDay(),n=7){const stamp=Date.parse(day+'T12:00:00Z');return Array.from({length:n},(_,i)=>new Date(stamp-(n-1-i)*86400000).toISOString().slice(0,10));}
