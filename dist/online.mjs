import {Chess} from './vendor/chess.mjs';
import {INTENTS,revealStory,replayGame} from './live-shared.mjs';
const $=id=>document.getElementById(id),pieces={w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}};
let room=null,invitation=null,selected=null,intent=null,guess=null,flipped=false,busy=false,connected=false,lastResponse=0,clocksAt=0,timer,failures=0,renderKey='',cardURL=null;
const invited=new URL(location.href).searchParams.get('room');
const setText=(id,text)=>$(id).textContent=text;
const show=(id,on)=>$(id).hidden=!on;
const opponent=()=>room?.side==='w'?'b':'w';
function message(text){setText('error',text);show('error',!!text);}
async function request(action){
  const response=await fetch('/api/live'+(!action&&invited?'?invite='+encodeURIComponent(invited):''),{
    ...(action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action)}:{}),signal:AbortSignal.timeout(10000)});
  let data;try{data=await response.json();}catch{throw new Error('连接正在恢复，请稍等。');}
  if(data.room!==undefined)acceptRoom(data.room);
  if(data.invitation!==undefined)invitation=data.invitation;
  if(!response.ok)throw new Error(data.error||'暂时无法完成，请重试。');
  connected=true;lastResponse=Date.now();failures=0;setText('connection','已连接');$('connection').classList.add('connected');
  return data;
}
function acceptRoom(next){
  if(next&&room?.id===next.id&&next.revision<room.revision)return;
  if(next?.id!==room?.id){flipped=next?.side==='b';renderKey='';if(cardURL){URL.revokeObjectURL(cardURL);cardURL=null;document.getElementById('card-preview')?.remove();}}
  if(next?.fen!==room?.fen){selected=null;show('promotion',false);}
  room=next;clocksAt=performance.now();
}
async function poll(){
  clearTimeout(timer);
  if(busy){timer=setTimeout(poll,1200);return;}
  try{await request();message('');render();}
  catch(error){connected=false;failures++;setText('connection','重连中…');$('connection').classList.remove('connected');message(error.message==='Failed to fetch'?'网络暂时断开，正在自动重连。对局时钟仍在继续。':error.message);}
  timer=setTimeout(poll,Math.min(8000,(document.hidden?3000:1200)*Math.max(1,failures)));
}
async function act(type,extra={}){
  if(busy)return;
  busy=true;message('');renderButtons();
  try{await request({type,...(room?{room:room.id,revision:room.revision}:{}),...extra});if(type==='move'){intent=null;guess=null;selected=null;}render();}
  catch(error){message(error.message);try{await request();render();}catch{connected=false;}}
  finally{busy=false;renderButtons();clearTimeout(timer);timer=setTimeout(poll,1200);}
}
function canMove(){return room?.status==='active'&&room.fen.split(' ')[1]===room.side&&!busy&&connected&&Date.now()-lastResponse<12000;}
function drawBoard(){
  const game=new Chess(room?.fen),files=flipped?'hgfedcba':'abcdefgh',ranks=flipped?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1];
  const legal=selected?game.moves({square:selected,verbose:true}):[],last=room?.moves.at(-1)?.uci;
  const frag=document.createDocumentFragment();
  for(const [ri,rank] of ranks.entries())for(const [fi,file] of [...files].entries()){
    const sq=file+rank,piece=game.get(sq),button=document.createElement('button');
    button.className='live-square'+(('abcdefgh'.indexOf(file)+rank)%2===1?' dark':'')+(selected===sq?' selected':'')+(legal.some(m=>m.to===sq)?' target':'')+(last&&(last.slice(0,2)===sq||last.slice(2,4)===sq)?' last':'')+(piece?.type==='k'&&piece.color===game.turn()&&game.isCheck()?' check':'');
    button.dataset.square=sq;button.setAttribute('aria-label',`${sq}${piece?' '+(piece.color==='w'?'白':'黑')+({k:'王',q:'后',r:'车',b:'象',n:'马',p:'兵'}[piece.type]):' 空格'}`);button.setAttribute('aria-pressed',String(selected===sq));
    if(piece){const span=document.createElement('span');span.className='live-piece '+(piece.color==='w'?'white':'black');span.textContent=pieces[piece.color][piece.type];button.append(span);}
    if(fi===0){const span=document.createElement('span');span.className='coord rank';span.textContent=rank;button.append(span);}
    if(ri===7){const span=document.createElement('span');span.className='coord file';span.textContent=file;button.append(span);}
    button.onclick=()=>squareClick(sq);frag.append(button);
  }
  $('live-board').replaceChildren(frag);
}
function squareClick(sq){
  if(!canMove())return;
  const game=new Chess(room.fen),piece=game.get(sq);
  if(selected===sq){selected=null;drawBoard();return;}
  const moves=selected?game.moves({square:selected,verbose:true}).filter(m=>m.to===sq):[];
  if(moves.length){
    if(moves.some(m=>m.promotion)){
      $('promotion').replaceChildren(...moves.map(m=>{const b=document.createElement('button');b.textContent=pieces[room.side][m.promotion];b.setAttribute('aria-label','升变为'+({q:'后',r:'车',b:'象',n:'马'}[m.promotion]));b.onclick=()=>submitMove(m);return b;}));show('promotion',true);
    }else submitMove(moves[0]);
  }else{selected=piece?.color===room.side?sq:null;show('promotion',false);drawBoard();}
}
async function submitMove(move){show('promotion',false);await act('move',{uci:move.from+move.to+(move.promotion||''),intent,guess});}
function renderButtons(){
  for(const id of ['find-match','create-room','join-invite','cancel-match','draw','resign','play-again','friend-again'])$(id).disabled=busy||!connected;
  for(const b of document.querySelectorAll('[data-intent]')){b.setAttribute('aria-pressed',String(b.dataset.intent===intent));b.disabled=!canMove();}
  for(const b of document.querySelectorAll('[data-guess]')){b.setAttribute('aria-pressed',String(b.dataset.guess===guess));b.disabled=!canMove();}
}
function renderClocks(){
  const cs={...(room?.clocks||{w:300000,b:300000})},turn=room?.fen.split(' ')[1];
  if(room?.status==='active')cs[turn]=Math.max(0,cs[turn]-(performance.now()-clocksAt));
  for(const [id,side] of [['self-clock',room?.side||'w'],['opponent-clock',opponent()]]){
    const seconds=Math.ceil(cs[side]/1000);$(id).textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
    $(id).classList.toggle('running',room?.status==='active'&&side===turn);$(id).classList.toggle('low',seconds<30);
  }
}
function render(){
  const status=room?.status,waiting=status==='waiting',active=status==='active',finished=status==='finished',idle=!room||status==='cancelled';
  show('lobby',idle);show('waiting',waiting);show('capsule',active);show('reveal',finished);show('game-actions',active);show('move-card',active||finished);show('intro-card',idle||waiting);
  if(invitation){show('invitation',idle);setText('invitation',invitation.available?`${invitation.name} 给你留了一把椅子。`:'这个邀请已经开局或过期了。可以匹配其他棋友。');show('join-invite',idle&&invitation.available);}
  const me=room?.side||'w',opp=opponent();
  setText('self-name',room?.names[me]||'你');setText('opponent-name',room?.names[opp]||'空着的那把椅子');
  setText('self-info',room?(me==='w'?'白方 · 你先走':'黑方 · 你后走'):'无需注册，入座即可');
  setText('opponent-info',active?(room.presence[opp]?'真人棋友 · 在线':'对方连接中 · 时钟继续'):finished?'下过一盘，就不算陌生人了':'等一个棋友，把故事接下去');
  setText('table-title',finished?'棋局散场，心声开场。':active?'你走一步，对面接一句。':'对面，这次是一个人。');
  if(waiting){$('room-link').value=location.origin+'/online.html?room='+room.id;setText('waiting-title',room.visibility==='private'?'朋友的座位，留好了。':'给偶遇一点时间。');setText('waiting-copy',room.visibility==='private'?'把链接发给朋友，对方入座后自动开局。':'正在匹配真人棋友。大厅安静时，邀请朋友会更快。');}
  const turn=room?.fen.split(' ')[1],game=new Chess(room?.fen);
  setText('turn-status',active?(turn===me?(game.isCheck()?'你正被将军，轮到你应对。':'轮到你。棋盘在等一个决定。'):'对方正在想。别替他紧张。'):finished?`${room.result} · ${room.reason}`:waiting?'等待入座 · 计时尚未开始':'选一个名字，找个人下棋。');
  show('guess-area',active&&room.moves.length>0);setText('sealed-note',intent?'已选「'+INTENTS[intent]+'」，随下一步封存。':'棋盘会记录走法，我们替你保守秘密。');
  if(active){setText('draw',room.draw&&room.draw!==me?'接受和棋':room.draw===me?'已提议和棋':'提议和棋');show('draw-note',!!room.draw);setText('draw-note',room.draw===me?'等待对方回应；对方落子即拒绝本次提议。':'对方提议和棋。接受或继续走棋。');}
  const key=[room?.id,room?.revision,flipped].join(':');
  if(key!==renderKey){
    drawBoard();renderKey=key;
    if(room){const frag=document.createDocumentFragment();room.moves.forEach((m,i)=>{if(i%2===0){const n=document.createElement('span');n.className='num';n.textContent=(i/2+1)+'.';frag.append(n);}const s=document.createElement('span');s.textContent=m.san;frag.append(s);});$('move-list').replaceChildren(frag);$('move-list').scrollTop=$('move-list').scrollHeight;setText('move-count',room.moves.length+' 手');}
    if(finished)renderReveal();
  }
  renderButtons();renderClocks();
}
function renderReveal(){
  const story=revealStory(room.moves);setText('reveal-title',story.title);setText('reveal-copy',story.line);setText('reveal-score',story.total?`你们读懂了 ${story.hits} / ${story.total} 次有答案的心声`:`封存了 ${story.sealed.length} 个瞬间`);
  const moments=[...story.sealed].sort((a,b)=>(Number(/[+#x]/.test(b.san))-Number(/[+#x]/.test(a.san)))||b.ply-a.ply).slice(0,4).sort((a,b)=>a.ply-b.ply);
  $('reveal-moments').replaceChildren(...moments.map(m=>{const d=document.createElement('div');d.className='reveal-moment';const strong=document.createElement('strong');strong.textContent=`${Math.ceil(m.ply/2)}${m.side==='w'?'.':'…'} ${m.san} · ${room.names[m.side]}`;const p=document.createElement('p');p.textContent=`当时的心声：${INTENTS[m.intent]}`;const read=document.createElement('em');read.textContent=m.read?`对面猜「${INTENTS[m.read]}」 ${m.read===m.intent?'✓':'↔'}`:'对面没有猜，把悬念留给了现在。';d.append(strong,p,read);return d;}));
}
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function saveCard(){
  if(room?.status!=='finished')return;
  const story=revealStory(room.moves),c=document.createElement('canvas');c.width=1080;c.height=1350;const ctx=c.getContext('2d');ctx.fillStyle='#101c19';ctx.fillRect(0,0,c.width,c.height);
  const text=(value,x,y,size,color='#f3f0df')=>{ctx.font=`${size>=45?'600':'400'} ${size}px -apple-system, "PingFang SC", sans-serif`;ctx.fillStyle=color;ctx.fillText(value,x,y);};
  const wrap=(value,y,size,max=900)=>{ctx.font=`${size}px -apple-system, "PingFang SC", sans-serif`;let line='';for(const ch of value){if(ctx.measureText(line+ch).width>max){text(line,80,y,size);y+=size*1.6;line='';}line+=ch;}text(line,80,y,size);return y+size*1.6;};
  text('KNIGHT ROOM / 棋间',80,110,30,'#c9f28b');text('THE REVEAL',80,170,20,'#b1c3b7');let y=wrap(story.title,280,62);y=wrap(story.line,y+35,29);text(`${room.result}  ·  ${room.reason}`,80,y+35,25,'#c9f28b');y+=110;
  for(const m of story.sealed.slice(-3)){text(`${Math.ceil(m.ply/2)}${m.side==='w'?'.':'…'} ${m.san}  /  ${m.side==='w'?'白方':'黑方'}`,80,y,32);text(`心声：${INTENTS[m.intent]}`,80,y+48,32,'#f1c078');text(m.read?`对面以为：${INTENTS[m.read]}`:'有些念头，下完才知道。',80,y+90,26,'#b1c3b7');y+=165;}
  text('一盘棋，两份心声。',80,1230,32);text('knight-room.weijiaxian.chatgpt.site',80,1290,24,'#c9f28b');
  c.toBlob(blob=>{
    if(!blob){message('卡片生成失败，请重试。');return;}
    if(cardURL)URL.revokeObjectURL(cardURL);cardURL=URL.createObjectURL(blob);document.getElementById('card-preview')?.remove();
    const figure=document.createElement('figure');figure.id='card-preview';figure.style.margin='18px 0';
    const img=document.createElement('img');img.src=cardURL;img.alt='这盘棋的心声卡片';img.style.width='100%';img.style.borderRadius='8px';
    const a=document.createElement('a');a.href=cardURL;a.download='knight-room-reveal.png';a.textContent='下载 PNG 心声卡 ↓';a.className='secondary';a.style.display='block';a.style.textAlign='center';
    figure.append(img,a);$('save-card').after(figure);
  },'image/png');
}
$('find-match').onclick=()=>act('match',{name:$('nickname').value});$('create-room').onclick=()=>act('create',{name:$('nickname').value});$('join-invite').onclick=()=>act('join',{room:invited,name:$('nickname').value});$('cancel-match').onclick=()=>act('cancel');
$('copy-room').onclick=async()=>{try{await navigator.clipboard.writeText($('room-link').value);$('copy-room').textContent='已复制';}catch{$('room-link').select();message('链接已选中，可手动复制。');}};
$('flip').onclick=()=>{flipped=!flipped;renderKey='';drawBoard();};
document.querySelectorAll('[data-intent]').forEach(b=>b.onclick=()=>{intent=intent===b.dataset.intent?null:b.dataset.intent;render();});document.querySelectorAll('[data-guess]').forEach(b=>b.onclick=()=>{guess=guess===b.dataset.guess?null:b.dataset.guess;render();});
$('draw').onclick=()=>act('draw');$('resign').onclick=()=>$('resign-confirm').showModal();$('keep-playing').onclick=()=>$('resign-confirm').close();$('confirm-resign').onclick=()=>{$('resign-confirm').close();act('resign');};
$('play-again').onclick=()=>act('match',{name:room.names[room.side]});$('friend-again').onclick=()=>act('create',{name:room.names[room.side]});$('save-card').onclick=saveCard;
$('download-pgn').onclick=()=>{const game=replayGame(room.moves);game.header('Event','Knight Room casual','White',room.names.w,'Black',room.names.b,'Result',room.result,'TimeControl','300+3');download(new Blob([game.pgn()],{type:'application/x-chess-pgn'}),'knight-room.pgn');};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});window.addEventListener('online',poll);window.addEventListener('beforeunload',event=>{if(room?.status==='active'){event.preventDefault();event.returnValue='';}});document.addEventListener('keydown',e=>{if(e.key==='Escape'){selected=null;show('promotion',false);drawBoard();}});
render();poll();setInterval(renderClocks,250);
