import {Chess} from './vendor/chess.mjs';

export const SPEEDS={bullet:'超快棋',blitz:'快棋',rapid:'快速棋',classical:'慢棋',daily:'通信棋',unknown:'用时未知'};
const norm=s=>String(s||'').trim().toLowerCase();
export function speedOf(value=''){
  if(value.includes('/'))return 'daily';
  if(!/^\d+(?:\+\d+)?$/.test(value))return 'unknown';
  const [base,inc=0]=value.split('+').map(Number),seconds=base+40*inc;
  return seconds<180?'bullet':seconds<600?'blitz':seconds<1800?'rapid':'classical';
}
// Split at a new header block, outside comments/variations. Do not assume Event is first.
export function splitPgn(text){
  const chunks=[];let start=0,body=false,brace=0,variation=0,semicolon=false,lineStart=true;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='\n'){semicolon=false;lineStart=true;continue;}
    if(semicolon)continue;
    if(c===';'&&!brace){semicolon=true;continue;}
    if(c==='{'){brace++;continue;}if(c==='}'){brace=Math.max(0,brace-1);continue;}if(brace)continue;
    if(c==='('){variation++;continue;}if(c===')'){variation=Math.max(0,variation-1);continue;}if(variation)continue;
    if(lineStart&&/\s/.test(c))continue;
    if(lineStart&&c==='['){
      if(body){chunks.push(text.slice(start,i).trim());start=i;body=false;}
      const end=text.indexOf('\n',i);i=end<0?text.length:end;lineStart=true;continue;
    }
    if(!/\s/.test(c))body=true;
    lineStart=false;
  }
  if(text.slice(start).trim())chunks.push(text.slice(start).trim());return chunks;
}
export function parseCollection(text,max=100){
  if(text.length>2000000)throw new Error('棋谱文件最多 2 MB。');
  const chunks=splitPgn(text),games=[],seen=new Set();let skipped=0,duplicates=0;
  for(const pgn of chunks.slice(0,max)){
    try{
      const chess=new Chess();chess.loadPgn(pgn);const h=chess.getHeaders(),moves=chess.history({verbose:true});
      if(!['1-0','0-1','1/2-1/2'].includes(h.Result)||!h.White||!h.Black||moves.length<2||h.FEN||(h.Variant&&!['standard','chess'].includes(norm(h.Variant)))){skipped++;continue;}
      const key=[h.Site,h.White,h.Black,h.Date,h.UTCDate,h.UTCTime,h.StartTime,h.Round,h.Result,moves.map(m=>m.san).join(' ')].join('|');
      if(seen.has(key)){duplicates++;continue;}seen.add(key);
      const date=(h.UTCDate||h.Date||'').replaceAll('.','-');
      let stamp=/^\d{4}-\d{2}-\d{2}$/.test(date)?Date.parse(date):NaN;
      if(Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)!==date)stamp=NaN;
      games.push({pgn,h,moves,speed:speedOf(h.TimeControl),date:Number.isFinite(stamp)?date:null,stamp});
    }catch{skipped++;}
  }
  const players=new Map();for(const g of games)for(const who of [g.h.White,g.h.Black]){const k=norm(who);const p=players.get(k)||{name:who,count:0};p.count++;players.set(k,p);}
  return {games,skipped,duplicates,truncated:Math.max(0,chunks.length-max),players:[...players.values()].sort((a,b)=>b.count-a.count)};
}
export function perspective(game,player){
  const side=norm(game.h.White)===norm(player)?'w':norm(game.h.Black)===norm(player)?'b':null;
  if(!side)return null;
  const score=game.h.Result==='1/2-1/2'?.5:game.h.Result===(side==='w'?'1-0':'0-1')?1:0;
  const rating=Number(game.h[side==='w'?'BlackElo':'WhiteElo']);
  return {...game,side,score,opponent:game.h[side==='w'?'Black':'White'],rating:rating>0&&rating<4000?rating:null};
}
export function stats(games){
  const n=games.length,w=games.filter(g=>g.score===1).length,d=games.filter(g=>g.score===.5).length;
  const rated=games.filter(g=>g.rating),score=n?(w+.5*d)/n:0;
  return {n,w,d,l:n-w-d,score,rating:rated.length?Math.round(rated.reduce((s,g)=>s+g.rating,0)/rated.length):null,rated:rated.length};
}
export function prepareReport(games,player,{side='b',speed='all',days=0,now=Date.now()}={}){
  const matched=games.map(g=>perspective(g,player)).filter(Boolean);
  const selected=matched.filter(g=>g.side===side&&(speed==='all'||g.speed===speed)&&(!days||(Number.isFinite(g.stamp)&&g.stamp>=now-days*86400000&&g.stamp<=now+86400000))).sort((a,b)=>(Number.isFinite(b.stamp)?b.stamp:0)-(Number.isFinite(a.stamp)?a.stamp:0));
  const groups=new Map();
  for(const g of selected){const line=g.moves.slice(0,6).map(m=>m.san).join(' ');const group=groups.get(line)||{line,games:[]};group.games.push(g);groups.set(line,group);}
  const lines=[...groups.values()].map(g=>({...g,...stats(g.games)})).sort((a,b)=>b.n-a.n||a.score-b.score);
  const dated=selected.filter(g=>Number.isFinite(g.stamp)),types=new Set(selected.map(g=>g.speed));
  // A comparison is only shown for at least 20 dated games of the same speed and side.
  const trend=dated.length>=20&&types.size===1&&!types.has('unknown')?{recent:stats(dated.slice(0,10)),prior:stats(dated.slice(10,20))}:null;
  return {player,side,speed,games:selected,all:matched.length,...stats(selected),lines,trend,from:dated.at(-1)?.date,to:dated[0]?.date,unknownDates:selected.length-dated.length};
}
export const positionKey=fen=>fen.split(' ').slice(0,4).join(' ');
export function observedMoves(games,fen,side){
  const rows=new Map();for(const g of games){
    // Only one observation per source game/position; repeated cycles do not inflate counts.
    const move=g.moves.slice(0,24).find(m=>m.color===side&&positionKey(m.before)===positionKey(fen));
    if(move){const r=rows.get(move.san)||{san:move.san,n:0};r.n++;rows.set(move.san,r);}
  }
  return [...rows.values()].sort((a,b)=>b.n-a.n||a.san.localeCompare(b.san));
}
export function demoCollection(){
  const lines=[['e4','e5','Nf3','Nc6','Bc4','Bc5','c3','Nf6','d4','exd4'],['e4','e5','Nf3','Nc6','Bc4','Bc5','c3','Nf6','d3','d6'],['d4','d5','c4','e6','Nc3','Nf6','Bg5','Be7']];
  return Array.from({length:24},(_,i)=>{const c=new Chess();c.header('Event','虚构功能演示','White','DemoPartner'+(i%3),'Black','DemoOpponent','Date',`2026.09.${String(i+1).padStart(2,'0')}`,'TimeControl','180+2','WhiteElo',String(1500+(i%4)*50),'BlackElo','1600','Result',i%6===0?'0-1':i%6===1?'1/2-1/2':'1-0');for(const m of lines[i%3])c.move(m);return c.pgn();}).join('\n\n');
}
