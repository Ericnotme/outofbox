import {Chess} from './vendor/chess.mjs';
import {parseCollection,prepareReport,observedMoves,demoCollection,SPEEDS} from './preparation.mjs';
import {sessionAdvice,weeklySessions,FOCUS_RULES} from './session.mjs';
const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=x=>`${Math.round(x*100)}%`,date=x=>new Date(x).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const safeURL=x=>{try{const u=new URL(x);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const link=(url,label)=>safeURL(url)?`<a href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';
function download(name,content,type='text/plain'){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([content],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
async function api(path,action){const r=await fetch(path,action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action)}:undefined);let d;try{d=await r.json();}catch{throw new Error('服务暂时无法读取，请稍后重试。');}if(!r.ok)throw new Error(d.error||'请求失败，请重试。');return d;}

const markup=`<dialog id="tool-dialog" class="tool-dialog" aria-labelledby="tool-heading">
<div class="tool-top"><div><span class="eyebrow">KNIGHT ROOM · FREE</span><h2 id="tool-heading">让下一盘，更有准备。</h2></div><button id="tool-close" class="secondary">返回棋盘</button></div>
<nav class="tool-tabs" aria-label="棋间工具"><button data-tool="daily">每日节奏</button><button data-tool="prepare">赛前备战</button><button data-tool="nearby">附近下棋</button></nav>
<section id="tool-daily" class="tool-view">
<div class="tool-intro"><span class="tool-kicker">开局前 30 秒 · 每盘后 10 秒</span><h3>今天下几盘，由你先决定。</h3><p>先定一轮的边界。输赢发生之后，仍然记得开始时的约定。</p></div>
<p id="daily-status" class="tool-status" role="status" aria-live="polite"></p><button id="daily-reload" class="textbtn accent">重新读取进度</button>
<form id="daily-start" class="tool-card" hidden><div class="tool-fields"><label>这一轮最多<select id="daily-budget"><option value="2">2 盘</option><option value="3" selected>3 盘</option><option value="5">5 盘</option><option value="8">8 盘</option></select></label><label>或最多用时<select id="daily-minutes"><option value="10">10 分钟</option><option value="20">20 分钟</option><option value="30" selected>30 分钟</option><option value="45">45 分钟</option><option value="60">60 分钟</option><option value="90">90 分钟</option><option value="120">120 分钟</option></select></label><label>连续输几盘时提醒休息<select id="daily-limit"><option value="2">2 盘</option><option value="3">3 盘</option><option value="4">4 盘</option></select></label><label>此刻的感受<select id="daily-energy"><option value="calm">平静，想认真下棋</option><option value="tired">有点累</option><option value="chasing">想把分赢回来</option></select></label></div><label class="tool-label" for="daily-focus">今天只带走一条提醒</label><input id="daily-focus" maxlength="140" value="${FOCUS_RULES[0]}"><div class="tool-actions"><button class="primary" type="submit">开始这一轮</button><button id="daily-warmup" class="secondary" type="button">先练我的错题</button></div></form>
<div id="daily-active" hidden><section id="daily-advice" class="tool-card daily-advice" aria-live="polite"></section><section class="tool-card"><h4>刚刚结束的一盘</h4><p class="tool-muted">手动记结果即可；可以在棋间、Lichess 或 Chess.com 下棋。这里只记录已结束的对局。</p><div class="daily-outcomes"><button data-result="w">赢了</button><button data-result="d">和棋</button><button data-result="l">输了</button></div><div id="daily-ledger" class="daily-ledger"></div><button id="daily-undo" class="textbtn">撤销最后一条</button></section><form id="daily-finish" class="tool-card"><h4>把这一轮留在这里</h4><label for="daily-reflection">下一次开局前，想提醒自己什么？（可不填）</label><textarea id="daily-reflection" rows="2" maxlength="200" placeholder="比如：不急着开下一局，先复盘刚才漏看的威胁。"></textarea><label class="tool-label" for="daily-helpful">这次的提醒帮你按计划停下来了吗？</label><select id="daily-helpful"><option value="">还不能判断</option><option value="yes">有帮助</option><option value="no">没有帮助</option></select><div class="tool-actions"><button type="submit" class="primary">结束这一轮</button><button id="daily-review" type="button" class="secondary">去复盘一局</button></div></form></div>
<section id="daily-history" class="tool-card" hidden></section><p class="tool-fine">免费试用功能。提醒遵循你设置的规则，不从输赢诊断情绪，也不预测下一盘胜率。网页不能阻止你在其他网站继续下棋；没有后台自动监测。进度保存于服务器，以当前浏览器识别，保留最近 60 轮。只在页面打开时显示提醒。</p><div class="tool-actions"><button id="daily-export" class="textbtn" disabled>导出我的记录</button><button id="daily-clear" class="textbtn" disabled>删除节奏记录</button></div><div id="daily-clear-confirm" class="tool-card" hidden><p>删除全部节奏记录？错题本不受影响。</p><button id="daily-clear-yes" class="secondary">确认删除</button><button id="daily-clear-no" class="textbtn">取消</button></div>
</section>
<section id="tool-prepare" class="tool-view" hidden><div class="tool-intro"><span class="tool-kicker">认识习惯 · 验证判断 · 提前演练</span><h3>下一位对手，习惯怎样开局？</h3><p>从已结束棋谱出发。每条判断，都能回到具体的那几盘。</p></div>
<form id="prep-fetch" class="tool-card"><div class="tool-fields"><label>公开棋谱来源<select id="prep-provider"><option value="lichess">Lichess</option><option value="chesscom">Chess.com</option></select></label><label>对手的平台账号<input id="prep-account" autocomplete="off" placeholder="输入 username" maxlength="30" required></label></div><div class="tool-actions"><button id="prep-load" class="primary">读取最近对局</button><button id="prep-demo" type="button" class="secondary">先看虚构示例</button></div><p class="tool-fine">无需密码。读取最多 100 局；线上账号的表现不代表线下比赛水平。账号由你确认，不根据姓名猜测身份。</p></form>
<details class="tool-card"><summary>有比赛棋谱？导入多局 PGN</summary><label class="tool-label" for="prep-file">选择文件（最多 2 MB，读取前 100 局）</label><input id="prep-file" type="file" accept=".pgn,.txt"><label class="tool-label" for="prep-text">或粘贴多局棋谱</label><textarea id="prep-text" rows="4" placeholder='[White "对手名字"] …'></textarea><button id="prep-import" class="secondary">生成备战报告</button><p class="tool-fine">导入文件在当前页面分析，不上传。关闭或刷新前，可导出报告与单盘棋谱。</p></details>
<p id="prep-status" class="tool-status" role="status" aria-live="polite"></p>
<section id="prep-report" hidden><div class="tool-fields tool-card"><label>研究谁<select id="prep-player"></select></label><label>对手执棋<select id="prep-side"><option value="b">黑方（你执白）</option><option value="w">白方（你执黑）</option></select></label><label>用时类别<select id="prep-speed"><option value="all">全部用时</option>${Object.entries(SPEEDS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>最近时间<select id="prep-days"><option value="0">全部已读取棋谱</option><option value="30">30 天</option><option value="90">90 天</option><option value="365">一年</option></select></label></div><div id="prep-summary"></div><div id="prep-priorities" class="tool-card"></div><div class="tool-actions"><button id="prep-export" class="secondary">导出备战摘要</button></div><h4 class="tool-subheading">常走路线 · 前 3 回合</h4><div id="prep-lines"></div><p class="tool-fine">得分率 =（胜局 + 0.5 × 和局）/ 样本数，均为对手视角。输棋原因可能发生在中残局，低得分路线只是待核查线索。近期战绩受对手强度、用时和样本选择影响，不是心理状态判断。</p></section>
<section id="prep-shadow" class="tool-card" hidden><div class="tool-top"><div><span class="tool-kicker">影子对手 · 开局演练</span><h4 id="shadow-title"></h4></div><button id="shadow-close" class="textbtn">收起</button></div><p class="tool-muted">你走自己的棋。对手采用样本里此局面最常走的一步；可改走另一条已观察到的路线。样本结束时演练停止，不伪装成真人的完整棋力。</p><div class="shadow-layout"><div id="shadow-board" class="shadow-board" role="group" aria-label="开局演练棋盘"></div><div><p id="shadow-status" role="status" aria-live="polite"></p><div id="shadow-options" class="tool-actions"></div><div id="shadow-promotion" class="tool-actions" hidden></div><p id="shadow-line" class="tool-mono"></p><button id="shadow-restart" class="secondary">重新演练</button><button id="shadow-review" class="secondary">带到棋盘分析</button></div></div></section>
</section>
<section id="tool-nearby" class="tool-view" hidden><div class="tool-intro"><span class="tool-kicker">从屏幕，走到棋桌。</span><h3>今天，去哪里下棋？</h3><p>查找地图中已收录的国际象棋俱乐部、场所与公共棋桌。</p></div><section class="tool-card"><form id="place-search"><div class="tool-fields"><label>输入城市中文名或英文名<input id="place-city" placeholder="例如：上海、London" minlength="2" required></label><label>搜索半径<select id="place-radius"><option value="5">5 公里</option><option value="15" selected>15 公里</option><option value="30">30 公里</option></select></label></div><div class="tool-actions"><button class="primary" id="place-city-search">查找城市</button><button class="secondary" id="place-locate" type="button">使用我的位置</button></div></form><p class="tool-fine">城市名在浏览器中匹配。点击定位后才申请位置权限；查询会把取整到约 100 米的坐标发送给地图数据服务。精确位置不保存进个人记录。</p><div id="place-cities" class="place-cities"></div></section><p id="place-status" class="tool-status" role="status" aria-live="polite"></p><div id="place-result-tools" hidden><div class="tool-actions"><label>显示 <select id="place-kind"><option value="all">全部场所</option><option value="club">俱乐部 / 运动中心</option><option value="table">公共棋桌</option><option value="place">其他棋类地点</option></select></label><button id="place-retry" class="secondary">重新查询这里</button></div><div id="place-alternatives" class="tool-card"></div></div><div id="place-results"></div><p class="tool-fine">地图收录不完整，尤其部分中文地区；没有结果不代表没有俱乐部。俱乐部类型按地图标签推断，开放时间和活动均未经本站现场确认，出发前请联系场所。最多显示最近 80 处，距离为直线距离。</p><p class="tool-fine">场所：${link('https://www.openstreetmap.org/copyright','© OpenStreetMap contributors · ODbL')} · 查询由 VK Maps 的 Overpass API 提供。城市：${link('https://www.geonames.org/','GeoNames · CC BY 4.0')}，2026-09-22 数据快照，覆盖约 3.4 万个人口 1.5 万以上城市及部分行政中心。${link('https://www.openstreetmap.org/','补充地图资料')}</p></section>
</dialog>`;

export function createToolkit({pause,resume,importPgn,practice,review}){
  document.body.insertAdjacentHTML('beforeend',markup);
  const dialog=$('tool-dialog');let current='daily',daily=null,dailyBusy=false,loaded=false,collection=null,report=null,isDemo=false,prepJob=0;
  let shadow=null,shadowStart=null,shadowSide='b',selected=null,lastObservation=null,shadowEnded=false,shadowPromotion=null;
  let cities=null,placePoint=null,places=[],placeJob=0,placeLoaded=false;
  function open(name='daily'){
    if(!['daily','prepare','nearby'].includes(name))name='daily';current=name;
    document.querySelectorAll('[data-tool]').forEach(b=>{b.classList.toggle('selected',b.dataset.tool===name);b.setAttribute('aria-pressed',String(b.dataset.tool===name));});
    for(const v of ['daily','prepare','nearby'])$('tool-'+v).hidden=v!==name;
    if(!dialog.open){pause();dialog.showModal();}if(name==='daily'&&!loaded)loadDaily();
  }
  $('tool-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>resume());
  document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>open(b.dataset.tool));
  const message=(id,s,error=false)=>{$(id).textContent=s;$(id).classList.toggle('error',error);};
  async function loadDaily(){if(dailyBusy)return;dailyBusy=true;message('daily-status','正在读取你的节奏记录…');try{daily=await api('/api/session');loaded=true;renderDaily();message('daily-status','已保存的记录会在下次打开时继续显示。');}catch(e){message('daily-status',e.message,true);}finally{dailyBusy=false;}}
  function active(){return daily?.sessions.find(s=>!s.endedAt);}
  async function saveDaily(action){
    if(dailyBusy||!daily)return false;dailyBusy=true;dailyDisable(true);message('daily-status','正在保存…');
    try{daily=await api('/api/session',{...action,revision:daily.revision});renderDaily();message('daily-status','已保存。');return true;}catch(e){message('daily-status',e.message+' 可点击「重新读取进度」确认保存状态。',true);return false;}finally{dailyBusy=false;dailyDisable(false);}
  }
  function dailyDisable(value){document.querySelectorAll('#daily-start button,#daily-active button,#daily-clear-yes').forEach(b=>b.disabled=value);}
  function renderAdvice(){const s=active();if(!s)return;const a=sessionAdvice(s);$('daily-advice').dataset.kind=a.kind;$('daily-advice').innerHTML=`<span class="tool-kicker">${s.games.length} / ${s.budget} 盘 · 已过 ${a.elapsed||0} 分钟</span><h3>${esc(a.title)}</h3><p>${a.reasons.map(esc).join('<br>')}</p><div class="daily-focus">今天的提醒：${esc(s.focus)}</div>${a.kind==='stop'?'<p class="tool-muted">如果还有对局没结束，先完成那盘；之后再记录和收工。</p>':''}`;}
  function renderDaily(){
    const s=active();$('daily-start').hidden=!!s;$('daily-active').hidden=!s;renderAdvice();
    if(s){$('daily-ledger').innerHTML=s.games.map((g,i)=>`<span class="result-${g.result}">${i+1}. ${{w:'胜',d:'和',l:'负'}[g.result]}</span>`).join('')||'<span>还没有记录已结束的对局。</span>';$('daily-undo').hidden=!s.games.length;}
    const week=weeklySessions(daily.sessions),done=daily.sessions.filter(s=>s.endedAt);$('daily-history').hidden=!daily.sessions.length;
    $('daily-history').innerHTML=`<h4>最近 7 天，你怎样使用了下棋时间</h4><div class="tool-stats"><div><strong>${week.sessions}</strong><span>开始的轮次</span></div><div><strong>${week.games}</strong><span>手动记录的对局</span></div><div><strong>${week.withinBudget} / ${week.finished}</strong><span>在局数和时间内收工</span></div></div><p class="tool-fine">时间允许 1 分钟记录余量。这是使用记录，不是棋力提升证明。</p>${done.slice(0,5).map(x=>`<div class="daily-history-row"><strong>${esc(date(x.startedAt))} · ${x.games.length} 盘</strong><p>${esc(x.reflection||'这轮没有留下提醒。')}</p></div>`).join('')}`;
    $('daily-export').disabled=!daily.sessions.length;$('daily-clear').disabled=!daily.sessions.length;
    if(!s&&done[0]?.reflection)$('daily-focus').value=done[0].reflection.slice(0,140);
  }
  $('daily-reload').onclick=loadDaily;
  $('daily-start').onsubmit=async e=>{e.preventDefault();if(await saveDaily({type:'start',id:crypto.randomUUID(),budget:Number($('daily-budget').value),minutes:Number($('daily-minutes').value),lossLimit:Number($('daily-limit').value),energy:$('daily-energy').value,focus:$('daily-focus').value.trim()||FOCUS_RULES[0]})){$('daily-reflection').value='';$('daily-helpful').value='';}};
  document.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>{const s=active();if(s)saveDaily({type:'game',id:s.id,gameId:crypto.randomUUID(),result:b.dataset.result});});
  $('daily-undo').onclick=()=>{if(active())saveDaily({type:'undo',id:active().id});};
  $('daily-finish').onsubmit=async e=>{e.preventDefault();if(active())await saveDaily({type:'finish',id:active().id,reflection:$('daily-reflection').value,helpful:$('daily-helpful').value===''?null:$('daily-helpful').value==='yes'});};
  $('daily-warmup').onclick=()=>{dialog.close();practice();};$('daily-review').onclick=()=>{dialog.close();review();};
  $('daily-export').onclick=()=>download('knight-room-sessions.json',JSON.stringify({version:1,...daily},null,2),'application/json');
  $('daily-clear').onclick=()=>$('daily-clear-confirm').hidden=false;$('daily-clear-no').onclick=()=>$('daily-clear-confirm').hidden=true;
  $('daily-clear-yes').onclick=async()=>{if(await saveDaily({type:'clear'}))$('daily-clear-confirm').hidden=true;};
  setInterval(()=>{if(dialog.open&&current==='daily'&&!dailyBusy)renderAdvice();},15000);

  function acceptCollection(text,who,note,demo=false){
    const parsed=parseCollection(text);if(!parsed.games.length)throw new Error('没有找到可用的已结束标准棋。请检查双方姓名、Result 标签和 PGN 走法。');
    collection=parsed;isDemo=demo;$('prep-player').innerHTML=parsed.players.map(p=>`<option>${esc(p.name)}</option>`).join('');
    const found=parsed.players.find(p=>p.name.toLowerCase()===who?.toLowerCase());if(found)$('prep-player').value=found.name;
    $('prep-report').hidden=false;$('prep-shadow').hidden=true;
    message('prep-status',`${demo?'虚构示例，不代表真实棋手。 ':''}${note} 可用 ${parsed.games.length} 局，跳过 ${parsed.skipped} 局，去重 ${parsed.duplicates} 局${parsed.truncated?`，另有 ${parsed.truncated} 局未读取`:''}。`);renderReport();
  }
  function prepLoading(b){$('prep-load').disabled=b;$('prep-import').disabled=b;$('prep-demo').disabled=b;$('prep-file').disabled=b;}
  $('prep-fetch').onsubmit=async e=>{e.preventDefault();const job=++prepJob,who=$('prep-account').value.trim();prepLoading(true);message('prep-status','正在读取公开的已结束棋谱，可能需要十几秒…');try{const data=await api(`/api/prepare?provider=${encodeURIComponent($('prep-provider').value)}&username=${encodeURIComponent(who)}`);if(job===prepJob)acceptCollection(data.pgn,who,data.note);}catch(e){if(job===prepJob)message('prep-status',e.message+' 也可以直接导入 PGN。',true);}finally{if(job===prepJob)prepLoading(false);}};
  $('prep-demo').onclick=()=>{prepJob++;acceptCollection(demoCollection(),'DemoOpponent','共 24 局用于演示报告。',true);};
  $('prep-import').onclick=()=>{try{acceptCollection($('prep-text').value,'','导入棋谱在本页面分析。');}catch(e){message('prep-status',e.message,true);}};
  $('prep-file').onchange=async()=>{const f=$('prep-file').files[0];if(!f)return;const job=++prepJob;prepLoading(true);try{if(f.size>2000000)throw new Error('文件最多 2 MB。');const t=await f.text();if(job===prepJob){$('prep-text').value=t;acceptCollection(t,'','已读取本地文件。');}}catch(e){if(job===prepJob)message('prep-status',e.message,true);}finally{if(job===prepJob)prepLoading(false);}};
  for(const id of ['prep-player','prep-side','prep-speed','prep-days'])$(id).onchange=()=>{$('prep-shadow').hidden=true;renderReport();};
  function renderReport(){
    if(!collection)return;report=prepareReport(collection.games,$('prep-player').value,{side:$('prep-side').value,speed:$('prep-speed').value,days:Number($('prep-days').value)});
    const r=report;$('prep-summary').innerHTML=`<section class="tool-card"><h4>${esc(r.player)} · 执${r.side==='w'?'白':'黑'}${isDemo?' · 虚构示例':''}</h4><div class="tool-stats"><div><strong>${r.n}</strong><span>筛选后对局</span></div><div><strong>${r.n?pct(r.score):'—'}</strong><span>对手得分率</span></div><div><strong>${r.w} / ${r.d} / ${r.l}</strong><span>胜 / 和 / 负</span></div></div><p class="tool-muted">${r.from?`${esc(r.from)} — ${esc(r.to)}`:'没有可比较的日期'}${r.unknownDates?` · ${r.unknownDates} 局日期未知`:''} · 均为当前读取到的样本</p></section>`;
    const top=r.lines[0],weak=r.lines.filter(l=>l.n>=5&&l.score<.4).sort((a,b)=>a.score-b.score)[0];
    $('prep-priorities').innerHTML=`<h4>你的备战顺序</h4>${top?`<p><strong>① 先熟悉最常出现的路线</strong><br><span class="tool-mono">${esc(top.line)}</span><br>出现 ${top.n}/${r.n} 局（${pct(top.n/r.n)}）。先演练其中常见应手。</p><p><strong>② ${weak?'核查一条低得分路线':'扩大样本，再判断弱点'}</strong><br>${weak?`${esc(weak.line)}：${weak.n} 局中得分率 ${pct(weak.score)}。查看证据棋谱，区分开局问题与后续失误。`:'当前没有至少 5 局、得分率低于 40% 的路线。少量输棋不构成稳定弱点。'}</p>`:'<p>没有符合筛选条件的对局。换执棋颜色、用时或日期范围试试。</p>'}${r.trend?`<p><strong>③ 同类用时的近期对比</strong><br>最近 10 局得分率 ${pct(r.trend.recent.score)}；此前 10 局 ${pct(r.trend.prior.score)}。<br>相应对手平均等级分：${r.trend.recent.rating??'未知'} / ${r.trend.prior.rating??'未知'}（有等级分记录 ${r.trend.recent.rated}/10、${r.trend.prior.rated}/10 局）。变化不等于状态或棋力变化。</p>`:'<p class="tool-muted">近期对比需要至少 20 局有日期、同类用时、同一执棋颜色的对局。选择一种用时后再看。</p>'}`;
    $('prep-lines').innerHTML=r.lines.slice(0,12).map((l,i)=>`<article class="tool-card opening-card"><div class="opening-row"><span class="tool-mono">${esc(l.line)}</span><span>${l.n} 局 · 得分率 ${pct(l.score)}</span></div><p class="tool-muted">${l.n<5?'样本较少，先了解习惯，不下弱点结论。':`${l.w} 胜 ${l.d} 和 ${l.l} 负；请核查棋谱中的具体原因。`}</p><button class="secondary" data-shadow="${i}">按这条路线演练</button><details><summary>查看证据棋谱（${l.n} 局）</summary>${l.games.slice(0,8).map((g,j)=>`<div class="evidence-row"><span>${esc(g.date||'日期未知')} · ${esc(g.opponent)} · ${esc(g.h.Result)}</span><button class="textbtn accent" data-evidence="${i},${j}">导入并复盘</button>${link(g.h.Site,'原始棋谱')}</div>`).join('')}${l.n>8?'<p class="tool-fine">这里列出最近 8 局，摘要保留全部路线样本数。</p>':''}</details></article>`).join('');
    $('prep-lines').querySelectorAll('[data-shadow]').forEach(b=>b.onclick=()=>startShadow(r.lines[Number(b.dataset.shadow)]));
    $('prep-lines').querySelectorAll('[data-evidence]').forEach(b=>b.onclick=()=>{const [i,j]=b.dataset.evidence.split(',').map(Number);dialog.close();importPgn(r.lines[i].games[j].pgn);});
  }
  $('prep-export').onclick=()=>{if(!report)return;const r=report;download('knight-room-preparation.txt',`${isDemo?'【虚构演示】\n':''}棋间赛前备战 · ${r.player}\n对手执${r.side==='w'?'白':'黑'}，用时：${SPEEDS[r.speed]||'全部'}\n${r.from||'日期未知'} — ${r.to||''}\n样本 ${r.n} 局，${r.w} 胜 ${r.d} 和 ${r.l} 负，得分率 ${pct(r.score)}\n\n${r.lines.map(l=>`${l.line}\n${l.n} 局，得分率 ${pct(l.score)}${l.n<5?'（小样本）':''}`).join('\n\n')}\n\n低得分不是已证实的开局弱点；近期战绩不是心理状态。样本不代表全部历史。`);};
  function startShadow(line){shadowStart=line.games[0].moves[Math.min(5,line.games[0].moves.length-1)].after;shadowSide=report.side;resetShadow();$('prep-shadow').hidden=false;$('prep-shadow').scrollIntoView?.({behavior:'smooth',block:'start'});}
  function resetShadow(){shadow=new Chess(shadowStart);selected=null;shadowPromotion=null;lastObservation=null;shadowEnded=false;$('shadow-title').textContent=`你执${shadowSide==='b'?'白':'黑'} · 对手 ${report.player}`;reply();renderShadow();}
  function reply(){
    if(shadow.isGameOver()){shadowEnded=true;return;}
    if(shadow.turn()!==shadowSide)return;
    const choices=observedMoves(report.games,shadow.fen(),shadowSide);
    if(!choices.length){shadowEnded=true;return;}
    const before=shadow.fen();shadow.move(choices[0].san);lastObservation={before,choices,pick:choices[0]};
  }
  const symbols={w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}};
  function renderShadow(){
    const own=shadowSide==='b'?'w':'b',files=own==='w'?'abcdefgh':'hgfedcba',ranks=own==='w'?'87654321':'12345678',legal=selected?shadow.moves({square:selected,verbose:true}):[];
    $('shadow-board').innerHTML=[...ranks].flatMap((rank,ri)=>[...files].map((f,fi)=>{const square=f+rank,p=shadow.get(square),target=legal.some(m=>m.to===square);return `<button type="button" data-square="${square}" class="shadow-square ${(ri+fi)%2?'dark':'light'} ${selected===square?'chosen':''} ${target?'target':''}" aria-label="${square}${p?` ${p.color==='w'?'白':'黑'}${{k:'王',q:'后',r:'车',b:'象',n:'马',p:'兵'}[p.type]}`:' 空格'}" ${shadowEnded?'disabled':''}><span class="${p?.color==='w'?'white-piece':'black-piece'}">${p?symbols[p.color][p.type]:''}</span><small>${square}</small></button>`;})).join('');
    $('shadow-board').querySelectorAll('button').forEach(b=>b.onclick=()=>playShadow(b.dataset.square));
    $('shadow-status').textContent=shadowEnded?'当前样本没有更多应手，演练到这里。可带到棋盘继续分析。':lastObservation?`对手刚走 ${lastObservation.pick.san}，这个局面有 ${lastObservation.choices.reduce((n,c)=>n+c.n,0)} 局记录，其中 ${lastObservation.pick.n} 局这样走。现在轮到你。`:'轮到你走棋。点击棋子，再点目标格。';
    $('shadow-line').textContent=shadow.history().join(' ');
    $('shadow-options').innerHTML=lastObservation&&!shadowPromotion?lastObservation.choices.slice(1,5).map((c,i)=>`<button class="textbtn accent" data-branch="${i+1}">换成 ${esc(c.san)}（${c.n} 局）</button>`).join(''):'';
    $('shadow-options').querySelectorAll('[data-branch]').forEach(b=>b.onclick=()=>{const o=lastObservation,pick=o.choices[Number(b.dataset.branch)];shadow=new Chess(o.before);shadow.move(pick.san);lastObservation={...o,pick};selected=null;shadowEnded=false;renderShadow();});
    $('shadow-promotion').hidden=!shadowPromotion;
  }
  function playShadow(square){if(shadowEnded||shadowPromotion||shadow.turn()===shadowSide)return;const p=shadow.get(square);
    if(selected){const moves=shadow.moves({square:selected,verbose:true}).filter(m=>m.to===square);if(moves.length){if(moves[0].promotion){shadowPromotion={from:selected,to:square};$('shadow-promotion').innerHTML=['q','r','b','n'].map(x=>`<button class="secondary" data-promote="${x}">${{q:'后',r:'车',b:'象',n:'马'}[x]}</button>`).join('');$('shadow-promotion').querySelectorAll('button').forEach(b=>b.onclick=()=>commitShadow({...shadowPromotion,promotion:b.dataset.promote}));renderShadow();return;}commitShadow({from:selected,to:square});return;}}
    selected=p&&p.color===shadow.turn()?square:null;renderShadow();
  }
  function commitShadow(move){shadow.move(move);selected=null;shadowPromotion=null;lastObservation=null;reply();renderShadow();}
  $('shadow-close').onclick=()=>$('prep-shadow').hidden=true;$('shadow-restart').onclick=resetShadow;
  $('shadow-review').onclick=()=>{dialog.close();importPgn(shadow.pgn());};

  $('place-search').onsubmit=async e=>{e.preventDefault();const q=$('place-city').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),job=++placeJob;if(q.length<2)return;message('place-status','正在匹配城市…');$('place-city-search').disabled=true;
    try{if(!cities){const r=await fetch('./vendor/cities.json');if(!r.ok)throw new Error('城市目录暂时无法读取，请使用定位或稍后重试。');cities=await r.json();}if(job!==placeJob)return;
      const found=cities.filter(c=>c[0].some(n=>n.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q))).slice(0,12);
      $('place-cities').innerHTML=found.map((c,i)=>`<button class="secondary" data-city="${i}">${esc(c[0].find(n=>/[\u4e00-\u9fff]/.test(n))||c[0][0])} · ${esc(c[0][0])} · ${esc(c[1])} / ${esc(c[5])}</button>`).join('');
      $('place-cities').querySelectorAll('button').forEach(b=>b.onclick=()=>{const c=found[Number(b.dataset.city)];placePoint={lat:c[2],lon:c[3],label:c[0][0]+' · '+c[1]};findPlaces();});
      message('place-status',found.length?'请选择正确的城市，距离将从城市中心计算。':'城市目录中没有匹配项。试试英文名，或使用定位；也可在地图网站搜索该城市的国际象棋俱乐部。');
    }catch(e){if(job===placeJob)message('place-status',e.message,true);}finally{$('place-city-search').disabled=false;}
  };
  $('place-locate').onclick=()=>{
    if(!navigator.geolocation){message('place-status','当前浏览器不支持定位，请搜索城市。',true);return;}
    const job=++placeJob;$('place-locate').disabled=true;message('place-status','等待位置授权…');
    navigator.geolocation.getCurrentPosition(p=>{$('place-locate').disabled=false;if(job!==placeJob)return;placePoint={lat:Math.round(p.coords.latitude*1000)/1000,lon:Math.round(p.coords.longitude*1000)/1000,label:'我的位置'};findPlaces();},()=>{$('place-locate').disabled=false;if(job===placeJob)message('place-status','未获得位置。你仍可以输入城市查询。',true);},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  };
  async function findPlaces(){
    if(!placePoint)return;const job=++placeJob,p={...placePoint},radius=$('place-radius').value;placeLoaded=false;places=[];$('place-results').innerHTML='';$('place-result-tools').hidden=false;
    const q=encodeURIComponent(`${p.label==='我的位置'?`${p.lat},${p.lon}`:p.label} chess club`);
    $('place-alternatives').innerHTML=`<strong>地图资料不全？继续查找</strong><div class="tool-actions">${link(`https://www.google.com/maps/search/?api=1&query=${q}`,'Google 地图')}${link(`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=14/${p.lat}/${p.lon}`,'在 OSM 看位置')}${link(`https://map.baidu.com/search/${encodeURIComponent((p.label==='我的位置'?'附近':p.label)+' 国际象棋俱乐部')}`,'百度地图')}</div><p class="tool-fine">外部地图结果需自行核实，不是已确认的活动安排。</p>`;
    message('place-status',`正在搜索 ${p.label} 周围 ${radius} 公里的棋类场所，可能需要半分钟…`);$('place-retry').disabled=true;
    try{const data=await api(`/api/places?lat=${p.lat}&lon=${p.lon}&radius=${radius}`);if(job!==placeJob)return;places=data.places;placeLoaded=true;renderPlaces();message('place-status',`${p.label} · ${radius} 公里 · 找到 ${places.length} 处地图记录。资料读取于 ${date(data.checkedAt)}，不等于已确认营业。`);}catch(e){if(job===placeJob)message('place-status',e.message+' 可先用下方地图入口。',true);}finally{if(job===placeJob)$('place-retry').disabled=false;}
  }
  function renderPlaces(){const kind=$('place-kind').value,visible=places.filter(p=>kind==='all'||p.kind===kind);$('place-results').innerHTML=visible.map(p=>`<article class="tool-card place-card"><div class="opening-row"><h4>${esc(p.name)}</h4><span>${p.distance.toFixed(1)} km</span></div><span class="tool-kicker">${{club:'俱乐部 / 运动中心（按标签）',table:'公共棋桌',place:'其他棋类地点'}[p.kind]}</span><p class="tool-muted">${esc(p.address||'未提供街道地址')}${p.hours?`<br>地图开放时间：${esc(p.hours)}`:''}${p.access==='customers'?'<br>可能仅限顾客使用':''}${p.fee==='yes'?'<br>地图标注：收费':''}</p><div class="tool-actions">${link(`https://www.openstreetmap.org/${p.id}`,'查看数据来源')}${link(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`,'路线')}${link(p.website,'场所网站')}</div></article>`).join('')||(placeLoaded?'<div class="tool-card"><h4>这里还没有匹配的地图记录。</h4><p>不代表附近没有棋友或俱乐部。试试扩大半径、切换类型，或使用上方地图入口。</p></div>':'');}
  $('place-kind').onchange=renderPlaces;$('place-retry').onclick=findPlaces;$('place-radius').onchange=()=>{if(placePoint)findPlaces();};
  return {open};
}
