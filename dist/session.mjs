export const FOCUS_RULES=['落子前，检查对方的将军、吃子和直接威胁。','遇到关键局面，先列出两个候选走法。','每盘结束先记一句收获，再决定是否继续。'];
export function sessionAdvice(session,now=Date.now()){
  if(!session)return {kind:'ready',title:'先决定，再开局。',reasons:[]};
  if(session.endedAt)return {kind:'done',title:'这一轮已收工。',reasons:['下一次开始前，带上这次留下的一条提醒。']};
  let streak=0;for(const g of [...session.games].reverse()){if(g.result!=='l')break;streak++;}
  const elapsed=Math.max(0,Math.floor((now-session.startedAt)/60000)),reasons=[];
  if(session.games.length>=session.budget)reasons.push(`已完成预先约定的 ${session.budget} 盘。`);
  if(elapsed>=session.minutes)reasons.push(`已到预先约定的 ${session.minutes} 分钟。`);
  if(streak>=session.lossLimit)reasons.push(`已连续输了 ${streak} 盘，触及你设定的休息规则。`);
  if(reasons.length)return {kind:'stop',title:'这一轮，到这里就好。',reasons,streak,elapsed};
  if(session.energy!=='calm')return {kind:'pause',title:'先休息一下，再决定。',reasons:[session.energy==='tired'?'你开局前选择了「有点累」。':'你开局前选择了「想把分赢回来」。'],streak,elapsed};
  return {kind:'play',title:session.games.length?'下一局前，先回想这一盘。':'带着一个目标开始。',reasons:[`这一轮还剩 ${session.budget-session.games.length} 盘额度；没有必须下满的任务。`],streak,elapsed};
}
export function weeklySessions(sessions,now=Date.now()){
  const week=sessions.filter(s=>s.startedAt>=now-7*86400000),finished=week.filter(s=>s.endedAt);
  return {sessions:week.length,finished:finished.length,games:week.reduce((s,x)=>s+x.games.length,0),withinBudget:finished.filter(s=>s.games.length<=s.budget&&s.endedAt<=s.startedAt+s.minutes*60000+60000).length,reflections:finished.filter(s=>s.reflection).length};
}
