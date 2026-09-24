import {phrase} from './jam.mjs';
export class JazzBand{
  constructor(){this.context=null;this.voices=new Set();this.timer=null;this.enabled=false;}
  async enable(){
    const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Audio)throw new Error('这个浏览器暂不支持声音。仍然可以静音即兴。');
    if(!this.context){this.context=new Audio();this.master=this.context.createGain();this.master.gain.value=.55;const compressor=this.context.createDynamicsCompressor();compressor.threshold.value=-18;compressor.ratio.value=5;this.master.connect(compressor);compressor.connect(this.context.destination);}
    await this.context.resume();if(this.context.state!=='running')throw new Error('声音未开启，请再点一次「开启声音」。');this.enabled=true;
  }
  stop(){clearTimeout(this.timer);for(const voice of this.voices){try{voice.stop();}catch{}}this.voices.clear();}
  mute(){this.enabled=false;this.stop();if(this.context?.state==='running')this.context.suspend().catch(()=>{});}
  source(source,gain,when,duration){source.connect(gain);gain.connect(this.master);source.start(when);source.stop(when+duration);this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();};}
  tone(midi,when,duration,volume=.10,bass=false){
    const ctx=this.context,freq=440*2**((midi-69)/12);
    for(const [harmonic,weight] of bass?[[1,1],[2,.13]]:[[1,1],[2,.35],[3,.09]]){
      const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=freq*harmonic;
      gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(volume*weight,when+.008);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
      this.source(osc,gain,when,duration+.02);
    }
  }
  brush(when,accent=false){
    const ctx=this.context,length=accent?.14:.06,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*length),ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length)**2;
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;filter.type='highpass';filter.frequency.value=accent?1300:6000;gain.gain.value=accent?.055:.025;
    source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(when);this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};
  }
  schedule(score,move,index,blue,when){
    const p=phrase(score,move,index,blue),b=p.beat;
    [0,1+2/3,2,3+2/3].forEach((beat,i)=>this.tone(p.notes[i]+(p.color==='b'?-12:0),when+beat*b,.62*b,.16));
    p.chord.forEach(n=>{this.tone(n,when+.66*b,1.4*b,.034);this.tone(n,when+2.66*b,1.2*b,.025);});
    [p.bass,p.bass+7,p.bass+12,p.bass+11].forEach((n,i)=>this.tone(n,when+i*b,.82*b,.13,true));
    for(let i=0;i<4;i++){this.brush(when+i*b,i%2===1);this.brush(when+(i+2/3)*b);}
    return 4*b;
  }
  live(score,move,index,blue){if(!this.enabled||this.context?.state!=='running')return;this.stop();this.schedule(score,move,index,blue,this.context.currentTime+.02);}
  replay(score,moves,blue,onStep,onEnd){
    this.stop();if(!this.enabled||this.context?.state!=='running')return false;
    const start=this.context.currentTime+.08,bar=240/score.tempo;
    moves.forEach((m,i)=>this.schedule(score,m,i,blue.includes(i),start+i*bar));
    const end=start+moves.length*bar;[0,4,7,11].forEach(n=>this.tone(score.root+n,end,1.8,.055));
    let previous=-1;const tick=()=>{const i=Math.min(moves.length-1,Math.floor((this.context.currentTime-start)/bar));if(i>=0&&i!==previous){previous=i;onStep(i);}if(this.context.currentTime>=end+1.9){this.timer=null;onEnd();}else this.timer=setTimeout(tick,50);};tick();return true;
  }
}
