import {Chess} from './vendor/chess.mjs';
import {Engine} from './engine.mjs';
import {createReviewUI} from './review-ui.mjs';
import {CLASSES} from './review.mjs';
import {createCoachUI} from './coach-ui.mjs';
import {createToolkit} from './toolkit.mjs';
import {createJam} from './jam-ui.mjs';
import {createFutures} from './futures-ui.mjs';
const $=id=>document.getElementById(id);
const colorName=c=>c==='w'?'白方':'黑方';
const symbols={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const names={k:'王',q:'后',r:'车',b:'象',n:'马',p:'兵'};
const levels={0:'入门',5:'进阶',15:'挑战'};
const engine=new Engine();
let game=new Chess(), initialFen=game.fen(), positions=[game.fen()], record=[];
let mode='computer',draftMode='computer',human='w',orientation='w',level=0;
let selected=null,hintSquares=[],review=null,result=null,imported=false,promotion=null,pausedForReview=false;
let thinking=false,task=0,clockBase=0,increment=0,remaining={w:0,b:0},clockHistory=[{w:0,b:0}],lastTick=Date.now(),started=false;
let toastTimer;
const reviewUI=createReviewUI({
  getState:()=>({record,initialFen,human,index:visibleIndex(),paused:pausedForReview,complete:!!result||['1-0','0-1','1/2-1/2'].includes(game.getHeaders().Result)}),
  navigate,prepare:prepareReview,resume:resumeGame,notify:toast,onChange:render,
  onReport:(report,state)=>coachUI.reportChanged(report,state?.record||[],state?.human||'w'),
  highlight:(from,to,text)=>{hintSquares=[from,to];$('analysis').textContent=text;renderBoard();}
});
const coachUI=createCoachUI({prepare:()=>{if(reviewUI.running)reviewUI.cancel();prepareReview();},onChange:render,notify:toast,resume:resumeGame});
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function cancelSearch(){task++;engine.stop();thinking=false;}
function prepareReview(){
  tick();cancelSearch();pausedForReview=!imported&&!result;
  selected=null;hintSquares=[];promotion=null;$('promotion-dialog').close();lastTick=Date.now();
}
function resumeGame(){
  if(!pausedForReview)return;
  cancelSearch();reviewUI.reset();pausedForReview=false;review=null;selected=null;hintSquares=[];lastTick=Date.now();
  $('analysis').textContent='已返回对局，可以继续下棋。';render();computerMove();
}
function visibleIndex(){return review===null?record.length:review;}
function visibleGame(){return review===null?game:new Chess(positions[review]);}
function canMove(){return !imported&&!pausedForReview&&review===null&&!result&&!thinking&&(mode==='local'||game.turn()===human);}
function evaluateEnd(){
  if(game.isCheckmate()){result={text:colorName(game.turn()==='w'?'b':'w')+'获胜 · 将死',score:game.turn()==='w'?'0-1':'1-0'};}
  else if(game.isStalemate()) result={text:'和棋 · 无子可动',score:'1/2-1/2'};
  else if(game.isInsufficientMaterial()) result={text:'和棋 · 子力不足',score:'1/2-1/2'};
  else if(game.isThreefoldRepetition()) result={text:'和棋 · 三次重复局面',score:'1/2-1/2'};
  else if(game.isDrawByFiftyMoves()) result={text:'和棋 · 五十回合规则',score:'1/2-1/2'};
  if(result)game.setHeader('Result',result.score);
}
function tick(){
  const now=Date.now();
  if(clockBase&&started&&!result&&!imported&&!pausedForReview){
    const c=game.turn();remaining[c]=Math.max(0,remaining[c]-(now-lastTick));
    if(remaining[c]===0){
      const winner=c==='w'?'b':'w';
      const others=game.board().flat().filter(p=>p&&p.color===winner&&p.type!=='k');
      result=others.length?{text:colorName(winner)+'获胜 · 对手超时',score:winner==='w'?'1-0':'0-1'}:{text:'和棋 · 对手超时但仅剩王',score:'1/2-1/2'};
      game.setHeader('Result',result.score);cancelSearch();promotion=null;$('promotion-dialog').close();render();
    }
  }
  lastTick=now;renderClocks();
}
function renderClocks(){
  for(const [loc,color] of [['bottom',orientation],['top',orientation==='w'?'b':'w']]){
    const el=$(loc+'-clock');const sec=Math.ceil(remaining[color]/1000);
    el.textContent=clockBase?`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`:'∞';
    el.classList.toggle('active',!result&&!imported&&!pausedForReview&&game.turn()===color);
    el.classList.toggle('low',!!clockBase&&sec<=30&&!result);
  }
}
function renderBoard(){
  const shown=visibleGame(),idx=visibleIndex();
  const last=idx?record[idx-1]:null;
  const legal=selected&&canMove()?game.moves({square:selected,verbose:true}):[];
  const files=orientation==='w'?'abcdefgh':'hgfedcba',ranks=orientation==='w'?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8];
  const focused=document.activeElement?.dataset?.square;
  const fragment=document.createDocumentFragment();
  for(let r=0;r<8;r++)for(let f=0;f<8;f++){
    const square=files[f]+ranks[r],piece=shown.get(square),button=document.createElement('button');
    button.type='button';button.className='square '+((square.charCodeAt(0)-97+Number(square[1]))%2?'dark':'light');button.dataset.square=square;
    button.setAttribute('aria-label',square+(piece?' '+colorName(piece.color)+names[piece.type]:' 空格'));
    button.setAttribute('aria-pressed',String(square===selected));
    if(piece)button.classList.add('occupied');
    if(last&&(last.from===square||last.to===square))button.classList.add('last-move');
    if(square===selected)button.classList.add('selected');
    if(hintSquares.includes(square))button.classList.add('hinted');
    if(legal.some(m=>m.to===square))button.classList.add('legal');
    if(piece?.type==='k'&&piece.color===shown.turn()&&shown.inCheck())button.classList.add('in-check');
    if(piece){const span=document.createElement('span');span.className='piece '+(piece.color==='w'?'white':'black');span.textContent=symbols[piece.type];span.setAttribute('aria-hidden','true');button.append(span);button.draggable=canMove()&&piece.color===game.turn();}
    if(f===0){const span=document.createElement('span');span.className='coordinate rank';span.textContent=ranks[r];button.append(span);}
    if(r===7){const span=document.createElement('span');span.className='coordinate file';span.textContent=files[f];button.append(span);}
    fragment.append(button);
  }
  $('board').replaceChildren(fragment);
  if(focused)$('board').querySelector(`[data-square="${focused}"]`)?.focus({preventScroll:true});
}
function renderMoves(){
  $('move-count').textContent=record.length+' 步';
  if(!record.length){$('moves').innerHTML='<div class="empty"><span>♘</span><strong>棋局，从一步开始</strong><p>走子后留下记录，供未来的你作证。</p></div>';return;}
  const scroll=$('moves').scrollTop,rows=new Map();
  record.forEach((move,i)=>{
    const n=Number(move.before.split(' ')[5]);
    if(!rows.has(n)){const row=document.createElement('div');row.className='move-row';const label=document.createElement('span');label.textContent=n+'.';row.append(label,document.createElement('span'),document.createElement('span'));rows.set(n,row);}
    const b=document.createElement('button');b.textContent=move.san;b.dataset.ply=i+1;b.className=i+1===visibleIndex()?'current':'';b.setAttribute('aria-label','第'+n+'回合 '+colorName(move.color)+' '+move.san);
    const judged=reviewUI.report?.moves[i];if(judged){const badge=document.createElement('span');badge.className='notation-badge '+judged.category;badge.textContent=CLASSES[judged.category].symbol;badge.title=CLASSES[judged.category].label;b.append(badge);b.setAttribute('aria-label',b.getAttribute('aria-label')+'，'+CLASSES[judged.category].label);}
    rows.get(n).children[move.color==='w'?1:2].replaceWith(b);
  });
  $('moves').replaceChildren(...rows.values());
  if(review===null)$('moves').scrollTop=$('moves').scrollHeight;else $('moves').scrollTop=scroll;
}
function render(){
  renderBoard();renderMoves();renderClocks();reviewUI.render();
  for(const [loc,c] of [['bottom',orientation],['top',orientation==='w'?'b':'w']]){
    $(loc+'-name').textContent=imported?colorName(c):mode==='computer'?(c===human?'你':'Stockfish'):colorName(c)+'棋手';
    $(loc+'-detail').textContent=(mode==='computer'&&c!==human&&!imported?levels[level]+' · ':'')+colorName(c)+(c==='w'?' · 先行':'');
    $(loc+'-avatar').textContent=c==='w'?'♙':'♟';$(loc+'-avatar').className='avatar '+(c==='w'?'light-avatar':'dark-avatar');
  }
  $('game-mode').textContent=imported?'棋谱回放':mode==='computer'?'人机对弈':'同屏双人';
  $('status').textContent=pausedForReview?`对局已暂停 · 回顾第 ${visibleIndex()} / ${record.length} 步`:review!==null?`回放 · 第 ${review} / ${record.length} 步`+(clockBase&&!result&&!imported?' · 计时继续':''):result?result.text:imported?'棋谱回放':thinking?'引擎思考中…':colorName(game.turn())+'走棋'+(game.inCheck()?' · 将军！':'');
  $('status-light').classList.toggle('busy',thinking);
  let aside='棋子各有走法。责任最后归你。';
  if(pausedForReview||review!==null||imported)aside='棋谱保留现场，复盘听取各方证词。';
  else if(result){
    if(game.isCheckmate())aside='国王已无合法去处，会议到此结束。';
    else if(game.isStalemate())aside='没有被将军，也无路可走。国王依法申请和棋。';
    else if(game.isInsufficientMaterial())aside='双方都想赢，但现场已不具备作案条件。';
    else if(game.isThreefoldRepetition())aside='相同局面出现三次，命运决定不再续集。';
    else if(result.text.includes('超时'))aside='棋盘还没给出结论，时钟先交了卷。';
    else if(result.text.includes('认输'))aside='国王收到撤退通知，本次远征到此结束。';
    else aside='本局结束。棋子可以休息，教训请带走。';
  }else if(thinking)aside='引擎正在计算，暂不接受心理战。';
  else if(game.inCheck())aside='国王收到一封必须立即回复的通知。';
  else if(record.length)aside='棋子负责执行，计划由你解释。';
  $('board-comment').textContent=aside;
  $('quick-review').disabled=reviewUI.running;
  $('quick-review').textContent=reviewUI.running?'正在复盘…':reviewUI.report?'查看复盘':'复盘这局';
  $('undo').disabled=imported||!record.length;
  $('hint').disabled=!canMove();
  $('analyze').disabled=thinking||reviewUI.running||visibleGame().isGameOver();
  $('resign').disabled=!!result||imported||pausedForReview||!record.length;
  $('first').disabled=$('prev').disabled=visibleIndex()===0;
  $('last').disabled=$('next').disabled=visibleIndex()===record.length;
}
function applyMove(move){
  tick();if(result||imported||pausedForReview)return false;
  let made;try{made=game.move(move);}catch{return false;}if(!made)return false;
  reviewUI.reset();if(clockBase)remaining[made.color]+=increment;
  started=true;lastTick=Date.now();record.push(made);positions.push(game.fen());clockHistory.push({...remaining});
  selected=null;hintSquares=[];$('analysis').textContent='需要灵感时，让引擎给出候选走法。国王不介意你请外援。';
  evaluateEnd();render();return true;
}
function fromUci(move){return {from:move.slice(0,2),to:move.slice(2,4),...(move.length===5?{promotion:move[4]}:{})};}
async function computerMove(){
  if(mode!=='computer'||game.turn()===human||result||imported||pausedForReview||thinking)return;
  const token=++task,fen=game.fen();thinking=true;render();
  try{
    const answer=await engine.search(fen,level,level===0?300:level===5?600:1000);
    if(token!==task||game.fen()!==fen)return;
    thinking=false;if(!applyMove(fromUci(answer.move)))throw new Error('引擎未返回合法走法，请重新开始。');
  }catch(e){if(token===task){thinking=false;render();toast(e.message);}}
}
function requestMove(from,to){
  if(!canMove())return false;
  const possibilities=game.moves({square:from,verbose:true}).filter(m=>m.to===to);
  if(!possibilities.length)return false;
  if(possibilities.some(m=>m.promotion)){promotion={from,to};$('promotion-dialog').showModal();return true;}
  if(applyMove({from,to})){computerMove();return true;}return false;
}
function clickSquare(square){
  if(!canMove()){if(pausedForReview)toast('对局已暂停，请点击回顾区的「返回对局」继续。');else if(review!==null)toast('点击「回到当前局面」后继续下棋。');return;}
  if(selected===square){selected=null;renderBoard();return;}
  if(selected&&requestMove(selected,square))return;
  const piece=game.get(square);selected=piece&&piece.color===game.turn()?square:null;hintSquares=[];renderBoard();
}
$('board').addEventListener('click',e=>{const s=e.target.closest('[data-square]')?.dataset.square;if(s)clickSquare(s);});
$('board').addEventListener('dragstart',e=>{const s=e.target.closest('[data-square]')?.dataset.square;if(!s||!canMove()||game.get(s)?.color!==game.turn()){e.preventDefault();return;}e.dataTransfer.setData('text/plain',s);e.dataTransfer.effectAllowed='move';});
$('board').addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';});
$('board').addEventListener('drop',e=>{e.preventDefault();const to=e.target.closest('[data-square]')?.dataset.square;const from=e.dataTransfer.getData('text/plain');if(/^[a-h][1-8]$/.test(from)&&to)requestMove(from,to);});
document.querySelectorAll('[data-promotion]').forEach(b=>b.addEventListener('click',()=>{const move=promotion;promotion=null;$('promotion-dialog').close();if(move&&canMove()&&applyMove({...move,promotion:b.dataset.promotion}))computerMove();}));
$('promotion-dialog').addEventListener('cancel',()=>{promotion=null;});
function newGame(){
  cancelSearch();reviewUI.reset();pausedForReview=false;game=new Chess();initialFen=game.fen();record=[];positions=[initialFen];selected=null;hintSquares=[];review=null;result=null;imported=false;promotion=null;
  mode=draftMode;level=Number($('level').value);human=$('side').value;if(human==='random')human=Math.random()<.5?'w':'b';orientation=mode==='local'?'w':human;
  const time=$('time').value.split('+');clockBase=Number(time[0])*1000;increment=Number(time[1]||0)*1000;remaining={w:clockBase,b:clockBase};clockHistory=[{...remaining}];started=false;lastTick=Date.now();
  game.setHeader('Event','Knight Room practice');game.setHeader('White',mode==='computer'&&human==='b'?'Stockfish':'White');game.setHeader('Black',mode==='computer'&&human==='w'?'Stockfish':'Black');game.setHeader('Result','*');
  $('analysis').textContent='需要灵感时，让引擎给出候选走法。国王不介意你请外援。';render();computerMove();
}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{draftMode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});$('side-row').hidden=$('level-row').hidden=draftMode==='local';}));
$('new-game').onclick=()=>record.length&&!result?$('confirm-dialog').showModal():newGame();
$('confirm-new').onclick=()=>{$('confirm-dialog').close();newGame();};
$('flip').onclick=()=>{orientation=orientation==='w'?'b':'w';render();};
$('undo').onclick=()=>{
  if(!record.length||imported)return;tick();cancelSearch();reviewUI.reset();pausedForReview=false;
  const count=mode==='computer'&&game.turn()===human&&record.length>1?2:1;
  for(let i=0;i<count;i++){game.undo();record.pop();positions.pop();clockHistory.pop();}
  remaining={...clockHistory.at(-1)};lastTick=Date.now();started=record.length>0;result=null;review=null;selected=null;hintSquares=[];game.setHeader('Result','*');
  $('analysis').textContent='已悔棋，可以重新考虑这一步。历史允许重写，教训请勿撤回。';render();computerMove();
};
function navigate(index){review=Math.min(Math.max(0,index),record.length);if(review===record.length)review=null;selected=null;hintSquares=[];$('analysis').textContent='点击「分析此局面」查看当前棋盘的候选走法。';render();}
$('moves').onclick=e=>{const ply=e.target.closest('[data-ply]')?.dataset.ply;if(ply)navigate(Number(ply));};
$('first').onclick=()=>navigate(0);$('prev').onclick=()=>navigate(visibleIndex()-1);$('next').onclick=()=>navigate(visibleIndex()+1);$('last').onclick=()=>navigate(record.length);
async function analyze(hint=false){
  if(thinking||reviewUI.running)return;if(hint&&!canMove())return;
  const shown=visibleGame(),fen=shown.fen();if(shown.isGameOver())return;
  const token=++task;thinking=true;render();$('analysis').textContent='正在寻找候选走法…';
  try{
    const answer=await engine.search(fen,20,900);
    if(token!==task)return;thinking=false;
    if(visibleGame().fen()!==fen){render();return;}
    const first=fromUci(answer.move),line=[];
    for(const uci of answer.pv.slice(0,5)){try{line.push(shown.move(fromUci(uci)).san);}catch{break;}}
    let score='';if(answer.score){const s=answer.score.value*(new Chess(fen).turn()==='w'?1:-1);score=answer.score.type==='mate'?`引擎预测${colorName(s>0?'w':'b')}可将死`:`白方视角估值 ${s>=0?'+':''}${(s/100).toFixed(2)}`;}
    $('analysis').textContent=`建议 ${first.from} → ${first.to}。${score}。参考变化：${line.join(' ')||answer.move}（深度 ${answer.depth||'—'}）。`;
    if(hint)hintSquares=[first.from,first.to];render();
  }catch(e){if(token===task){thinking=false;render();$('analysis').textContent=e.message;}}
}
$('hint').onclick=()=>analyze(true);$('analyze').onclick=()=>analyze(false);
$('resign').onclick=()=>{$('resign-description').textContent=colorName(mode==='computer'?human:game.turn())+'认输将结束当前对局。国王批准撤退，不追究口头豪言。';$('resign-dialog').showModal();};
$('confirm-resign').onclick=()=>{
  $('resign-dialog').close();tick();if(result)return;const loser=mode==='computer'?human:game.turn();cancelSearch();result={text:colorName(loser==='w'?'b':'w')+'获胜 · 对手认输',score:loser==='w'?'0-1':'1-0'};game.setHeader('Result',result.score);review=null;render();
};
$('export').onclick=()=>{
  const pgn=game.pgn();const url=URL.createObjectURL(new Blob([pgn],{type:'application/x-chess-pgn;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='knight-room-'+new Date().toISOString().slice(0,10)+'.pgn';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('棋谱已导出。证据已交由你自行保管。');
};
$('import').onclick=()=>{$('import-error').textContent='';$('pgn-file').value='';$('import-dialog').showModal();};
$('quick-import').onclick=()=>$('import').click();
$('quick-demo').onclick=()=>coachUI.openDemo();
$('quick-review').onclick=()=>{$('review-panel').scrollIntoView?.({behavior:'smooth',block:'start'});if(!reviewUI.report)reviewUI.start();};
let fileReadJob=0;
$('pgn-file').onchange=async()=>{const file=$('pgn-file').files[0],token=++fileReadJob;if(!file)return;$('pgn-input').value='';const button=$('confirm-import');button.disabled=true;
  try{if(file.size>200000)throw new Error('请导入单盘棋谱（最多 200 KB）。');const content=await file.text();if(token!==fileReadJob)return;$('pgn-input').value=content;$('import-error').textContent='';}
  catch(e){if(token===fileReadJob)$('import-error').textContent=e.message;}
  finally{if(token===fileReadJob)button.disabled=false;}
};
$('import-dialog').addEventListener('close',()=>{fileReadJob++;$('confirm-import').disabled=false;});
$('confirm-import').onclick=()=>{
  const text=$('pgn-input').value.trim();if(!text){$('import-error').textContent='请先粘贴棋谱。';return;}if(text.length>200000){$('import-error').textContent='请导入单盘棋谱（最多 200 KB）。';return;}
  try{
    const parsed=new Chess();parsed.loadPgn(text);const history=parsed.history({verbose:true});if(!history.length)throw new Error('棋谱中没有走子记录。');
    cancelSearch();reviewUI.reset();pausedForReview=false;game=parsed;record=history;initialFen=history[0].before;positions=[initialFen,...history.map(m=>m.after)];review=0;imported=true;result=null;clockBase=0;remaining={w:0,b:0};started=false;selected=null;hintSquares=[];orientation='w';
    $('analysis').textContent='棋谱已导入。使用箭头逐步回放，或点击走法跳转。';$('import-dialog').close();render();
  }catch(e){$('import-error').textContent='无法读取这份棋谱。请检查 PGN 格式和走法。';}
};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('about').onclick=()=>$('about-dialog').showModal();$('credits').onclick=()=>$('credits-dialog').showModal();
document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;if(e.key==='ArrowLeft'){e.preventDefault();navigate(visibleIndex()-1);}if(e.key==='ArrowRight'){e.preventDefault();navigate(visibleIndex()+1);}if(e.key==='Escape'){selected=null;hintSquares=[];renderBoard();}});
setInterval(tick,150);document.addEventListener('visibilitychange',tick);
newGame();
const toolkit=createToolkit({
  pause:()=>{if(reviewUI.running)reviewUI.cancel();prepareReview();},resume:resumeGame,
  importPgn:pgn=>{fileReadJob++;$('confirm-import').disabled=false;$('pgn-file').value='';$('pgn-input').value=pgn;$('import-error').textContent='';$('import-dialog').showModal();},
  practice:()=>{$('coach-panel').scrollIntoView?.({behavior:'smooth',block:'start'});$('coach-start').disabled?coachUI.openDemo():$('coach-start').click();},
  review:()=>{$('import').click();}
});
const jam=createJam({pause:()=>{if(reviewUI.running)reviewUI.cancel();prepareReview();},resume:resumeGame,identityReady:coachUI.initialLoad});
const futures=createFutures({
  pause:()=>{if(reviewUI.running)reviewUI.cancel();prepareReview();},resume:resumeGame,
  snapshot:()=>({fen:visibleGame().fen(),canCommit:canMove()}),
  commit:(fen,move)=>{
    if(imported||result||game.fen()!==fen||review!==null||mode==='computer'&&game.turn()!==human)throw new Error('原棋局的状态已变化，请返回后重新试走。');
    const wasPaused=pausedForReview;pausedForReview=false;lastTick=Date.now();
    let applied=false;try{applied=applyMove(move);}finally{pausedForReview=wasPaused;}
    if(!applied)throw new Error('这一步现在无法落子，请重新选择。');
  }
});
const initialTool=new URLSearchParams(window.location.search).get('tool');
if(['daily','prepare','nearby'].includes(initialTool))toolkit.open(initialTool);
if(new URLSearchParams(window.location.search).get('challenge')==='mate')coachUI.openDemo();
else if(new URLSearchParams(window.location.search).get('future')==='today'&&!initialTool)futures.open();
else if(new URLSearchParams(window.location.search).get('jam')==='today'&&!initialTool)jam.open();
// Optional, feature-detected WebMCP. The same game and handlers power UI and tools.
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tools=[{
    name:'read_chess_position',title:'读取棋局',description:'Read the displayed board, legal moves, and game status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},
    execute(){const shown=visibleGame();return {fen:shown.fen(),legalMoves:shown.moves(),status:$('status').textContent,canMove:canMove(),reviewPly:visibleIndex(),pausedForReview};}
  },{
    name:'play_chess_move',title:'走一步棋',description:'Play one legal human move in the current local game. The computer replies automatically in computer mode.',inputSchema:{type:'object',properties:{from:{type:'string',pattern:'^[a-h][1-8]$'},to:{type:'string',pattern:'^[a-h][1-8]$'},promotion:{type:'string',enum:['q','r','b','n']}},required:['from','to'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){
      if(!input||typeof input!=='object'||!/^[a-h][1-8]$/.test(input.from)||!/^[a-h][1-8]$/.test(input.to)||input.promotion&&!['q','r','b','n'].includes(input.promotion))throw new Error('Invalid move input');
      if(!canMove())throw new Error('It is not a playable human turn');
      const matches=game.moves({square:input.from,verbose:true}).filter(m=>m.to===input.to&&m.promotion===input.promotion);
      if(!matches.length)throw new Error('Illegal move or missing promotion choice');
      if(!applyMove({from:input.from,to:input.to,...(input.promotion?{promotion:input.promotion}:{})}))throw new Error('Move could not be applied');
      const response={fen:game.fen(),move:record.at(-1).san};computerMove();return response;
    }
  },{
    name:'read_game_review',title:'读取整局回顾',description:'Read the completed review, both accuracies, move classifications and experimental performance scores, or its current status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},
    execute(){return {status:reviewUI.running?'analyzing':reviewUI.report?'complete':'not_analyzed',report:reviewUI.report,performanceCaveat:'Illustrative uncalibrated scale, not Chess.com or FIDE Elo.'};}
  },{
    name:'start_game_review',title:'开始整局回顾',description:'Analyze the recorded moves or an imported PGN. A live local game and its clock pause until Return to game is selected. Returns the completed report.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},
    async execute(){if(!record.length)throw new Error('Play a move or import a PGN first');if(reviewUI.running)throw new Error('Review is already running');await reviewUI.start();return {status:reviewUI.report?'complete':'incomplete',report:reviewUI.report};}
  }];
  tools.forEach(tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
