// Stockfish runs off the UI thread. Cancellation destroys the worker so stale
// searches can never submit a move to a new game.
export class Engine {
  constructor() { this.worker = null; this.pending = null; this.ready = null; }
  stop() {
    this.worker?.terminate(); this.worker = null; this.ready = null;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error('cancelled')); this.pending = null; }
    this.rejectReady?.(new Error('cancelled')); this.rejectReady = null;
    clearTimeout(this.readyTimer);
  }
  init() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      this.rejectReady = reject;
      const worker = new Worker(new URL('./vendor/stockfish.js', import.meta.url));
      this.worker = worker;
      const fail = () => {
        reject(new Error('引擎未能加载，请重新开始，或使用同屏双人模式。'));
        if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error('引擎运行失败，请重试。')); this.pending = null; }
        worker.terminate(); this.worker = null; this.ready = null; clearTimeout(this.readyTimer);
      };
      worker.onerror = fail;
      this.readyTimer = setTimeout(fail, 15000);
      worker.onmessage = ({data}) => {
        if (typeof data !== 'string') return;
        if (data === 'uciok') { worker.postMessage('setoption name Hash value 16'); worker.postMessage('isready'); }
        if (data === 'readyok') { clearTimeout(this.readyTimer); this.rejectReady = null; resolve(); }
        if (this.pending && data.startsWith('info ')) {
          const score = data.match(/score (cp|mate) (-?\d+)/);
          // Keep score, depth and PV from the same completed search iteration.
          // Bound-only aspiration results are not stable position evaluations.
          if (score && !/\b(lowerbound|upperbound)\b/.test(data)) {
            this.pending.score = {type:score[1], value:Number(score[2])};
            const depth = data.match(/\bdepth (\d+)/); if (depth) this.pending.depth = +depth[1];
            const pv = data.match(/\bpv (.+)/); if (pv) this.pending.pv = pv[1].split(' ');
          }
        }
        if (this.pending && data.startsWith('bestmove ')) {
          const pending = this.pending; this.pending = null; clearTimeout(pending.timer);
          pending.resolve({move:data.split(' ')[1],score:pending.score,depth:pending.depth,pv:pending.pv || []});
        }
      };
      worker.postMessage('uci');
    });
    return this.ready;
  }
  async search(fen, skill=15, duration=700, {moves=[]}={}) {
    await this.init();
    if (!this.worker) throw new Error('cancelled');
    if (this.pending) throw new Error('引擎正在思考，请稍候。');
    return new Promise((resolve,reject) => {
      const timer=setTimeout(()=>{ this.stop(); reject(new Error('引擎响应超时，请重试。')); },15000);
      this.pending = {resolve,reject,timer};
      this.worker.postMessage('setoption name Skill Level value '+skill);
      this.worker.postMessage('position fen '+fen+(moves.length?' moves '+moves.join(' '):''));
      this.worker.postMessage('go movetime '+duration);
    });
  }
}
