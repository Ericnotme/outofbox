import {Chess} from './vendor/chess.mjs';
import {Engine} from './engine.mjs';
import {fromUci,normalizeEvaluation,uci} from './review.mjs';
import {tasksFromReport,explainPosition,describeMove,notebookStats,THEMES,PHASES} from './coach.mjs';
const $=id=>document.getElementById(id),symbols={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'},names={k:'王',q:'后',r:'车',b:'象',n:'马',p:'兵'};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function demoTask(){const b=new Chess();['f3','e5','g4'].forEach(m=>b.move(m));return {fen:b.fen(),best:'d8h4',played:'b8c6',line:['d8h4'],refutation:[],color:'b',san:'Nc6',number:2,loss:0,depth:0,missedMate:true,theme:'mate',phase:'opening',demo:true};}
export function createCoachUI({prepare,onChange,notify,resume=()=>{}}){
  let items=[],ready=false,loadFailed=false,saving=false,report=null,record=[],queue=[],index=0,task=null,board=null,selected=null,assisted=false,solved=false,busy=false,job=0,graded=false,pendingGrade=null,eventId='',demo=false,outcomes=[];
  const engine=new Engine();
  async function api(action){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{
    const response=await fetch('/api/notebook',{method:action?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:action?{'Content-Type':'application/json'}:{},body:action?JSON.stringify(action):undefined,signal:controller.signal});
    let data;try{data=await response.json();}catch{throw new Error('错题本暂时无法连接，请稍后重试。');}
    if(!response.ok)throw new Error(data.error||'保存失败，请重试');return data;
  }catch(e){throw new Error(e.name==='AbortError'?'连接超时，请重试；本次练习仍保留在页面中。':e.message);}finally{clearTimeout(timer);}}
  function renderLibrary(){
    const s=notebookStats(items);$('coach-due').textContent=String(s.due);$('coach-total').textContent=String(s.total);$('coach-mastered').textContent=String(s.mastered);
    $('coach-start').disabled=!ready||!s.due;$('coach-all').disabled=!ready||!s.total;$('coach-export').disabled=!ready||!s.total;$('coach-clear').disabled=!ready||!s.total;$('coach-import-button').disabled=!ready;
    $('coach-retry').hidden=!loadFailed;
    $('coach-summary').textContent=!ready?(loadFailed?'暂时无法读取错题本，请重试。':'正在读取你的错题本…'):s.total?(s.due?`今天有 ${s.due} 题待复习，每次先练 3 题。`:'今天的到期题已完成。也可以自由练习，不改变复习日期。'):'完成一次整局回顾，选择你的执棋颜色，把失误加入错题本。';
    $('coach-rate').textContent=s.rate===null?'尚未练习':`${s.rate}% 独立解出 · ${s.attempts} 次计分练习`;
    const stats=$('coach-themes');stats.replaceChildren();
    if(!s.themes.length)stats.append(el('p','coach-muted','积累错题后，这里会显示最常见的练习主题。'));
    for(const t of s.themes.slice(0,3)){const row=el('div','coach-theme');row.append(el('span','',t.label),el('strong','',String(t.count)));const bar=el('div','coach-bar');bar.style.setProperty('--progress',`${t.count/s.total*100}%`);row.append(bar);stats.append(row);}
    $('coach-phase').textContent=s.total?Object.entries(PHASES).map(([k,n])=>`${n} ${items.filter(i=>i.phase===k).length}`).join(' · '):'';
  }
  async function load(){ready=false;loadFailed=false;renderLibrary();try{const data=await api();items=data.items;ready=true;}catch(e){loadFailed=true;notify(e.message);}renderLibrary();renderCollect();}
  function reportChanged(next,moves=[],color='w'){report=next;record=moves;if(next)$('coach-color').value=color;renderCollect();}
  function renderCollect(){const count=report?tasksFromReport(report,record,$('coach-color').value).length:0;$('coach-save').disabled=!count||saving||!ready;$('coach-save').textContent=saving?'正在保存…':`收进错题本 · ${count} 题`;$('coach-collect-note').textContent=count?'保存自己这一方的失误；相同局面自动去重。教训可以复习，不必重新制造。':'这一方没有可生成的错题，可切换执棋颜色或分析另一局。';}
  async function collect(){if(!report||saving||!ready)return;const tasks=tasksFromReport(report,record,$('coach-color').value);saving=true;renderCollect();try{const data=await api({type:'add',items:tasks});items=data.items;ready=true;loadFailed=false;renderLibrary();notify(`新增 ${data.added} 道错题，已保存。`);$('coach-panel').scrollIntoView?.({behavior:'smooth',block:'center'});}catch(e){notify(e.message);}finally{saving=false;renderCollect();}}
  function renderBoard(){if(!board)return;const files=task.color==='w'?'abcdefgh':'hgfedcba',ranks=task.color==='w'?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8],fragment=document.createDocumentFragment();
    const focused=document.activeElement?.dataset?.trainSquare;
    const legal=selected&&!busy&&!solved?board.moves({square:selected,verbose:true}):[];
    for(let r=0;r<8;r++)for(let f=0;f<8;f++){const sq=files[f]+ranks[r],p=board.get(sq),b=el('button','square '+((sq.charCodeAt(0)-97+Number(sq[1]))%2?'dark':'light'));b.type='button';b.dataset.trainSquare=sq;b.setAttribute('aria-label',sq+(p?' '+(p.color==='w'?'白':'黑')+names[p.type]:' 空格'));b.setAttribute('aria-pressed',String(sq===selected));b.disabled=busy||solved;if(p){b.classList.add('occupied');const piece=el('span','piece '+(p.color==='w'?'white':'black'),symbols[p.type]);piece.setAttribute('aria-hidden','true');b.append(piece);}if(sq===selected)b.classList.add('selected');if(legal.some(m=>m.to===sq))b.classList.add('legal');if(f===0)b.append(el('span','coordinate rank',String(ranks[r])));if(r===7)b.append(el('span','coordinate file',files[f]));fragment.append(b);}
    $('coach-board').replaceChildren(fragment);
    if(focused)$('coach-board').querySelector(`[data-train-square="${focused}"]`)?.focus({preventScroll:true});
  }
  function controls(){const locked=busy||!!pendingGrade;$('coach-hint').disabled=locked||solved;$('coach-answer').disabled=locked||solved;$('coach-next').disabled=locked;$('coach-next').textContent=solved?(index+1>=queue.length?'查看本轮结果':'下一题'):(index+1>=queue.length?'跳过并结束':'先跳过这题');$('coach-save-retry').hidden=!pendingGrade;$('coach-promotion').hidden=true;renderBoard();}
  function feedback(text,kind=''){const n=$('coach-feedback');n.textContent=text;n.className='coach-feedback '+kind;}
  function showExplanation(){const info=explainPosition(task),box=$('coach-explanation');box.replaceChildren(el('strong','',info.title),el('p','',info.cause),el('p','',info.better));if(info.reference.length)box.append(el('p','coach-line','参考变化：'+info.reference.join(' ')));if(info.punishment.length)box.append(el('p','coach-line','原走法后的应手：'+info.punishment.join(' ')));box.append(el('p','coach-habit',info.habit));box.hidden=false;}
  function startQuestion(){$('coach-session-summary').hidden=true;$('coach-exercise').hidden=false;job++;engine.stop();task=queue[index];board=new Chess(task.fen);selected=null;assisted=false;solved=false;busy=false;graded=false;pendingGrade=null;eventId=crypto.randomUUID();
    $('coach-training-title').textContent=demo?'示例 · 找到一步将杀':`重走这一刻 · ${index+1} / ${queue.length}`;
    $('coach-turn').textContent=(task.color==='w'?'白方':'黑方')+'走棋'+(board.inCheck()?' · 正被将军':'');
    $('coach-origin').textContent=demo?'原创示例，不写入你的错题和统计。白王正在等待一份不太友好的通知。':`来自你的棋谱 · 第 ${task.number} 回合 · ${PHASES[task.phase]}${task.dueAt>Date.now()?' · 自由练习，不改变复习计划':''}`;
    $('coach-explanation').hidden=true;feedback(demo?'黑方走棋，找到一步将杀。王室安保的漏洞，等你指出。':'请在棋盘上走出更好的选择。这次，给历史换个结局。');controls();
  }
  async function persistGrade(success){if(demo||graded||task.dueAt>Date.now())return true;
    pendingGrade={type:'grade',id:task.id,event:eventId,success,assisted};controls();
    try{const data=await api(pendingGrade);items=data.items;ready=true;graded=true;pendingGrade=null;renderLibrary();controls();return true;}catch(e){feedback('进度尚未保存：'+e.message,'error');controls();return false;}}
  async function finish(correct,code){outcomes[index]=correct?(assisted?'assisted':'independent'):'reviewed';solved=true;busy=false;selected=null;board=new Chess(task.fen);board.move(fromUci(code));showExplanation();
    const verdict=correct?(assisted?(demo?'走对了。本次用过提示或试错，示例不计入个人统计。':'走对了。用过提示或试错，本题会较快再次出现。'):'走对了！这次你自己找到了更好的选择。'):'已展示参考答案。先理解这条变化，稍后再试一次。';
    const aside=correct?(board.isCheckmate()?'国王已无合法去处，会议到此结束。':'这次，历史终于没有重演。'):'答案已经招供，下一次请独立破案。';
    feedback(verdict+' '+aside,correct?'success':'');controls();await persistGrade(correct);}
  async function tryMove(from,to,promotion){if(busy||solved||pendingGrade)return;let made;try{made=new Chess(task.fen).move({from,to,...(promotion?{promotion}:{})});}catch{return;}const code=uci(made);if(code===task.best){await finish(true,code);return;}
    const token=++job;busy=true;selected=null;feedback('正在核对你的走法；同样好的选择也可以通过。');controls();
    try{
      const start=await engine.search(task.fen,20,1000);if(token!==job)return;
      const before=normalizeEvaluation(start,task.color),afterBoard=new Chess(made.after);let after;
      if(afterBoard.isCheckmate())after={win:task.color==='w'?100:0,depth:99};
      else if(afterBoard.isDraw())after={win:50,depth:99};
      else after=normalizeEvaluation(await engine.search(task.fen,20,1000,{moves:[code]}),afterBoard.turn());
      if(token!==job)return;busy=false;engine.stop();
      const loss=(task.color==='w'?before.win:100-before.win)-(task.color==='w'?after.win:100-after.win);
      if(start.move===code||(before.depth>=8&&after.depth>=8&&loss<=2)){await finish(true,code);return;}
      if(before.depth<8||after.depth<8){feedback('本次搜索太浅，暂不判错。可以重试，或查看已保存的参考走法。');controls();return;}
      assisted=true;feedback('这步暂未保持参考走法的局势。计划很完整，对手似乎没有同意。再检查将军、吃子和威胁，然后重试。');controls();await persistGrade(false);
    }catch(e){if(token===job){busy=false;engine.stop();feedback('核对中断：'+e.message+' 你可以重试或查看参考答案。','error');controls();}}
  }
  function clickSquare(sq){if(busy||solved||pendingGrade)return;if(selected===sq){selected=null;renderBoard();return;}
    if(selected){const legal=board.moves({square:selected,verbose:true}).filter(m=>m.to===sq);if(legal.length){if(legal.some(m=>m.promotion)){
      const from=selected;const options=$('coach-promotion');options.replaceChildren(el('span','','升变为：'));for(const p of ['q','r','b','n']){const b=el('button','secondary',names[p]);b.onclick=()=>{options.hidden=true;tryMove(from,sq,p);};options.append(b);}options.hidden=false;return;}
      tryMove(selected,sq);return;}}
    selected=board.get(sq)?.color===task.color?sq:null;renderBoard();
  }
  async function openSession(kind){if(pendingGrade){prepare();onChange();$('coach-dialog').showModal();controls();return;}if(!ready&&kind!=='demo')return;const data=kind==='demo'?[demoTask()]:items.filter(i=>kind==='all'||i.dueAt<=Date.now()).sort((a,b)=>a.dueAt-b.dueAt).slice(0,3);if(!data.length)return;
    prepare();onChange();queue=data;index=0;outcomes=Array(data.length).fill(null);demo=kind==='demo';startQuestion();$('coach-dialog').showModal();
  }
  $('coach-board').onclick=e=>{const sq=e.target.closest('[data-train-square]')?.dataset.trainSquare;if(sq)clickSquare(sq);};
  $('coach-start').onclick=()=>openSession('due');$('coach-all').onclick=()=>openSession('all');$('coach-demo').onclick=()=>openSession('demo');$('coach-retry').onclick=load;
  $('coach-hint').onclick=()=>{assisted=true;const info=explainPosition(task);feedback(info.habit+` 提示：考虑 ${task.best.slice(0,2)} 上的棋子。场外援助已到，指挥权仍归你。`);};
  $('coach-answer').onclick=async()=>{assisted=true;await finish(false,task.best);};
  function finishSession(){
    job++;engine.stop();$('coach-exercise').hidden=true;$('coach-session-summary').hidden=false;
    const independent=outcomes.filter(x=>x==='independent').length,assistedCount=outcomes.filter(x=>x==='assisted'||x==='reviewed').length,skipped=outcomes.filter(x=>x==='skipped').length;
    $('coach-training-title').textContent=demo?'体验完成':'本轮练习结果';
    $('coach-session-result').textContent=`${queue.length} 题 · 独立解出 ${independent} · 提示或看答案 ${assistedCount} · 跳过 ${skipped}`;
    const stats=notebookStats(items);
    $('coach-session-next').textContent=demo?'接下来下盘棋，或导入自己的 PGN：复盘后选择执棋颜色，把失误收进错题本。示例不计入个人统计。':stats.due?`还有 ${stats.due} 题到期，愿意的话可以再练一轮。`:'到期题已完成。需要提示的题会更早回来，独立解出的题按计划复习。';
    $('coach-session-again').textContent=demo?'再试一次':stats.due?'再练到期题':'自由练习';
    $('coach-session-again').onclick=()=>openSession(demo?'demo':stats.due?'due':'all');
    $('coach-session-again').focus();
  }
  $('coach-next').onclick=()=>{if(pendingGrade||busy)return;if(!solved)outcomes[index]='skipped';if(index+1>=queue.length){finishSession();return;}index++;startQuestion();};
  $('coach-share').onclick=async()=>{const url='https://knight-room.weijiaxian.chatgpt.site/?challenge=mate';try{await navigator.clipboard.writeText(url);notify('体验链接已复制。邀请朋友一起检查王室安保。');}catch{const input=$('coach-share-url');input.value=url;input.hidden=false;input.focus();input.select();notify('长按或复制输入框中的体验链接。');}};

  $('coach-save-retry').onclick=async()=>{if(!pendingGrade)return;busy=true;controls();try{const data=await api(pendingGrade);items=data.items;pendingGrade=null;graded=true;ready=true;renderLibrary();feedback('练习进度已保存。','success');}catch(e){feedback(e.message,'error');}finally{busy=false;controls();}};
  function close(){job++;engine.stop();$('coach-dialog').close();if(pendingGrade)notify('本次练习尚未保存，重新打开练习可重试；刷新页面会丢失未保存进度。');}
  $('coach-return').onclick=()=>{close();resume();$('board').scrollIntoView?.({behavior:'smooth',block:'center'});};
  $('coach-close').onclick=close;$('coach-dialog').addEventListener('cancel',e=>{e.preventDefault();close();});$('coach-dialog').addEventListener('close',()=>{job++;engine.stop();});
  $('coach-color').onchange=renderCollect;$('coach-save').onclick=collect;
  $('coach-export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({format:'knight-room-notebook',version:1,exportedAt:new Date().toISOString(),items})],{type:'application/json'}));const a=el('a');a.href=url;a.download='knight-room-notebook.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('coach-import-button').onclick=()=>$('coach-import-file').click();$('coach-import-file').onchange=async()=>{const file=$('coach-import-file').files[0];if(!file)return;try{if(file.size>2000000)throw new Error('备份文件不能超过 2 MB');const data=JSON.parse(await file.text());if(data.format!=='knight-room-notebook'||data.version!==1||!Array.isArray(data.items))throw new Error('请选择棋间导出的错题本 JSON 文件');const saved=await api({type:'import',items:data.items});items=saved.items;ready=true;loadFailed=false;renderLibrary();notify(`已恢复 ${saved.added} 道错题，已有局面的进度不会覆盖。`);}catch(e){notify(e.message);}finally{$('coach-import-file').value='';}};
  $('coach-clear').onclick=()=>$('coach-clear-dialog').showModal();$('coach-confirm-clear').onclick=async()=>{const b=$('coach-confirm-clear');b.disabled=true;try{const data=await api({type:'clear'});items=data.items;renderLibrary();$('coach-clear-dialog').close();notify('错题本已清空。');}catch(e){notify(e.message);}finally{b.disabled=false;}};
  $('open-coach').onclick=()=>$('coach-panel').scrollIntoView?.({behavior:'smooth',block:'start'});
  const initialLoad=load();return {reportChanged,openDemo:()=>openSession('demo'),initialLoad};
}
