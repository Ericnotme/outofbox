import {Engine} from './engine.mjs';
import {tasksFromReport,explainPosition} from './coach.mjs';
import {reviewGame,CLASSES,formatEvaluation,fromUci} from './review.mjs';

const $=id=>document.getElementById(id);
const name=color=>color==='w'?'白方':'黑方';
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function badge(category){const data=CLASSES[category];return el('span','move-badge '+category,data.symbol+' '+data.label);}
const moveLabel=move=>`${move.number}${move.color==='w'?'.':'…'} ${move.san}`;

export function createReviewUI({getState,navigate,highlight,prepare,resume,notify,onChange,onReport=()=>{}}){
  const engine=new Engine();
  let report=null,running=false,job=0,done=0,total=0,message='';
  function reset(){job++;engine.stop();report=null;running=false;done=0;message='';onReport(null);}
  function cancel(){job++;engine.stop();running=false;message=getState().paused?'分析已取消。可以重新分析，或点击「返回对局」继续下棋。':'分析已取消，可以重新开始。';onChange();}
  async function start(){
    if(running)return;
    if(!getState().record.length){
      message='还没有走子记录。请先走一步，或点击「导入棋谱」后再回顾。';onChange();notify(message);return;
    }
    const token=++job;
    try{
      prepare();const state=getState();report=null;running=true;done=0;total=state.record.length+1;message='正在启动本机分析引擎… 正在传唤每一步的目击证人。';
      const duration=Number($('review-quality').value);onChange();
      const result=await reviewGame({record:[...state.record],initialFen:state.initialFen,complete:state.complete,engine,duration,
        isCancelled:()=>token!==job,
        onProgress:(completed,count)=>{if(token!==job)return;done=completed;total=count;message=`正在分析 ${completed} / ${count} 个局面 · ${Math.round(completed/count*100)}%`;render();}});
      if(token!==job)return;
      report=result;running=false;engine.stop();message='';onReport(report,state);onChange();
    }catch(error){if(token!==job)return;running=false;engine.stop();message='复盘失败：'+error.message;onChange();}
  }
  function renderCards(){
    const cards=['w','b'].map(color=>{
      const player=report.players[color],card=el('div','accuracy-card');
      card.append(el('div','accuracy-player',`${color==='w'?'♙':'♟'} ${name(color)} · ${report.complete?'整局':'片段'}准确度`));
      const number=el('strong','accuracy-value',player.accuracy===null?'—':player.accuracy.toFixed(1));
      if(player.accuracy!==null)number.append(el('small','','%'));card.append(number);
      const estimate=player.performance;
      card.append(el('div','performance-label','表现分 · 实验性'));
      card.append(el('div','performance-value',estimate.available?`≈ ${estimate.center}`:'暂不估分'));
      card.append(el('p','performance-range',estimate.available?`参考区间 ${estimate.low}–${estimate.high}`:estimate.reason));
      const counts=el('div','review-counts');
      for(const category of ['blunder','mistake','inaccuracy'])counts.append(el('span',category,`${CLASSES[category].symbol} ${player.counts[category]} ${CLASSES[category].label}`));
      card.append(counts);return card;
    });
    $('accuracy-cards').replaceChildren(...cards);
  }
  function renderGraph(){
    const idx=getState().index,points=report.evaluations.map((e,i)=>[12+i/(report.evaluations.length-1)*576,132-e.win*1.2]);
    const svg=$('review-graph'),ns='http://www.w3.org/2000/svg';
    const make=(tag,attributes)=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);return node;};
    svg.replaceChildren(make('rect',{x:0,y:0,width:600,height:144,rx:8,fill:'#191f1b'}),make('line',{x1:12,x2:588,y1:72,y2:72,stroke:'#53604f','stroke-dasharray':'4 5'}));
    const path=points.map(p=>p.join(',')).join(' ');
    svg.append(make('polygon',{points:`12,132 ${path} 588,132`,fill:'#a4dc7915'}),make('polyline',{points:path,fill:'none',stroke:'#a4dc79','stroke-width':2.5,'stroke-linejoin':'round'}));
    for(const move of report.moves.filter(m=>m.category==='blunder')){const [cx,cy]=points[move.ply];svg.append(make('circle',{cx,cy,r:4,fill:'#ff927b'}));}
    const [cx,cy]=points[idx];
    svg.append(make('line',{x1:cx,x2:cx,y1:8,y2:136,stroke:'#e3e8da','stroke-width':1,opacity:.5}),make('circle',{cx,cy,r:5,fill:'#f3f5eb',stroke:'#232727','stroke-width':2}));
    $('review-scrubber').max=String(report.moves.length);$('review-scrubber').value=String(idx);
    $('review-position').textContent=`第 ${idx} / ${report.moves.length} 步 · ${formatEvaluation(report.evaluations[idx])}`;
  }
  function renderDetail(){
    const detail=$('review-move-detail'),idx=getState().index,move=report.moves[idx-1];detail.replaceChildren();
    if(!move){detail.append(el('strong','','从关键走法开始'),el('p','','点击下方走法、棋谱或拖动曲线下的滑块，查看每一步的得失。记忆可能美化，棋谱保留原话。'));return;}
    const heading=el('div','review-detail-heading');heading.append(el('strong','',`${name(move.color)} ${moveLabel(move)}`),badge(move.category));detail.append(heading);
    const aside=move.forced?'你走出了唯一的选择。自由意志暂时休假。':move.missedMate?'本可当场结束，棋局被你续订了一季。':move.category==='blunder'?'这一步很有想法，对手尤其赞同。':move.category==='mistake'?'计划已经提交，对手提出了实质性异议。':move.category==='inaccuracy'?'路线略有绕远，国王希望你记得目的地。':move.category==='best'?'引擎没有异议。请珍惜这段短暂的共识。':'';
    if(aside)detail.append(el('p','dry-note',aside));
    detail.append(el('p','',`白方视角 ${formatEvaluation(move.before)} → ${formatEvaluation(move.after)} · 单步准确度 ${move.accuracy.toFixed(1)}%`));
    detail.append(el('p','',`计入评分的局势损失 ${move.loss.toFixed(1)} 个百分点。${move.forced?'这是唯一合法走法。':''}${move.rawLoss>move.loss+1?'引擎首选或唯一应手按满分计，相邻估值的变化受搜索深度影响。':''}${move.missedMate?'错失了引擎发现的强制将杀。':''}`));
    const original=getState().record[idx-1];
    const task=tasksFromReport(report,getState().record,move.color).find(t=>t.fen===original?.before);
    if(task){const info=explainPosition(task),explanation=el('div','coach-inline');explanation.append(el('strong','','这一步，怎么理解？'),el('p','',info.cause),el('p','',info.habit));if(info.punishment.length)explanation.append(el('p','review-variation','原走法后的应手：'+info.punishment.join(' ')));detail.append(explanation);}
    if(move.bestSan&&move.bestSan!==move.san){
      const button=el('button','secondary',`查看更好走法 ${move.bestSan}`);
      button.onclick=()=>{const first=fromUci(move.best);navigate(move.ply-1);highlight(first.from,first.to,`建议 ${move.bestSan}。参考变化：${move.line.join(' ')||move.bestSan}`);$('board').scrollIntoView?.({behavior:'smooth',block:'center'});};
      detail.append(button,el('p','review-variation','参考变化：'+(move.line.join(' ')||move.bestSan)));
    }else if(move.bestSan){detail.append(el('p','review-variation',move.loss>=5?'该步也是前一局面的引擎首选，但后续搜索发现更大损失；建议用细致模式复核。':'你走出了引擎推荐的走法。双方难得在此达成一致。'));}
  }
  function renderPriorities(){
    const color=$('coach-color').value,focus=report.moves.filter(m=>m.color===color&&(m.loss>=5||m.missedMate)).sort((a,b)=>(b.missedMate?100:0)+b.loss-((a.missedMate?100:0)+a.loss)).slice(0,3);
    const box=$('review-priorities');box.replaceChildren();
    $('priority-title').textContent=focus.length?`${name(color)} · 先看这 ${focus.length} 个关键失误`:`${name(color)} · 关键走法`;
    if(!focus.length){box.append(el('p','coach-muted','本次没有发现达到阈值的失误。可以切换执棋颜色，或继续查看完整回顾。'));return;}
    for(const move of focus){const button=el('button','priority-move');button.dataset.priorityPly=move.ply;button.append(el('strong','',moveLabel(move)),badge(move.category),el('span','',move.missedMate?'错失将杀':`局势损失 ${move.loss.toFixed(1)} 点`));button.onclick=()=>{navigate(move.ply);$('review-move-detail').scrollIntoView?.({behavior:'smooth',block:'center'});};box.append(button);}
  }
  function renderIssues(){
    const filter=$('review-filter').value;
    const moves=report.moves.filter(move=>{
      if(filter==='all')return true;
      if(filter==='blunder')return move.category==='blunder';
      return ['blunder','mistake','inaccuracy'].includes(move.category)||move.missedMate;
    });
    const fragment=document.createDocumentFragment();
    if(!moves.length)fragment.append(el('p','review-empty',filter==='blunder'?'本次分析没有发现严重失误。':'本次分析没有发现达到阈值的失误。'));
    for(const move of moves){
      const button=el('button','review-issue'+(move.ply===getState().index?' current':''));
      button.dataset.reviewPly=move.ply;button.setAttribute('aria-label',`${name(move.color)} ${moveLabel(move)}，${CLASSES[move.category].label}，查看分析`);
      button.append(el('strong','',`${name(move.color)} ${moveLabel(move)}`),badge(move.category),el('span','review-issue-loss',`−${move.loss.toFixed(1)} 点${move.missedMate?' · 错失将杀':''}`));
      button.onclick=()=>navigate(move.ply);fragment.append(button);
    }
    $('review-issues').replaceChildren(fragment);
  }
  function render(){
    const state=getState();
    $('start-review').disabled=running;
    $('start-review').hidden=false;$('start-review').textContent=running?'正在分析…':report?'重新分析':'开始整局回顾';
    $('cancel-review').hidden=!running;$('review-quality').disabled=running;
    $('resume-review').hidden=!state.paused;
    $('review-progress').hidden=!running;
    if(running&&done===0)$('review-progress').removeAttribute('value');else $('review-progress').value=total?done/total*100:0;
    $('review-panel').setAttribute('aria-busy',String(running));
    $('review-results').hidden=!report;
    const blunders=report?report.moves.filter(m=>m.category==='blunder').length:0;
    $('review-status').textContent=(message||(report?`${report.complete?'整局':'已记录片段'}回顾完成 · 共 ${report.moves.length} 步 · ${blunders} 次严重失误。`:state.record.length?`已准备好 ${state.record.length} 步棋谱，预计约 ${Math.max(1,Math.ceil((state.record.length+1)*Number($('review-quality').value)/1000))} 秒（设备不同会有差异）。${state.complete?'':'进行中的对局会暂停。'}可随时取消。`:'走一步或导入 PGN，即可开始回顾。'))+(state.paused?' 对局和计时已暂停。':'');
    if(report){
      renderCards();renderGraph();renderDetail();renderIssues();renderPriorities();
      $('review-engine-note').textContent=`Stockfish.js 10.0.2 · ${report.duration<1000?'快速':'细致'}模式 · 实际深度 ${report.minDepth}–${report.maxDepth}。${report.minDepth<10?'部分局面搜索较浅，评分可能波动。':''}快速分析可能漏算，关键局面建议用细致模式复核。`;
    }
  }
  $('start-review').onclick=start;$('cancel-review').onclick=cancel;$('resume-review').onclick=resume;
  $('review-filter').onchange=renderIssues;
  $('review-quality').onchange=render;
  $('coach-color').addEventListener('change',()=>{if(report)renderPriorities();});
  $('review-scrubber').oninput=()=>navigate(Number($('review-scrubber').value));
  $('review-graph').onclick=event=>{if(!report)return;const rect=$('review-graph').getBoundingClientRect();if(!rect.width)return;const fraction=((event.clientX-rect.left)/rect.width*600-12)/576;navigate(Math.round(Math.max(0,Math.min(1,fraction))*report.moves.length));};
  $('review-method').onclick=()=>$('review-method-dialog').showModal();
  window.addEventListener('pagehide',()=>engine.stop(),{once:true});
  return {render,reset,start,cancel,get report(){return report;},get running(){return running;}};
}
