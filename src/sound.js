/* ARMAGEDDON M3.70: layered, fully offline procedural battlefield audio. */
(function(global){'use strict';
let ctx=null,enabled=true,noiseBuffer=null,master=null;
function audio(){if(!enabled)return null;try{ctx=ctx||new (global.AudioContext||global.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();if(!master){master=ctx.createDynamicsCompressor();master.threshold.value=-18;master.knee.value=18;master.ratio.value=3;master.attack.value=.004;master.release.value=.22;const gain=ctx.createGain();gain.gain.value=.65;master.connect(gain);gain.connect(ctx.destination);}return ctx;}catch(e){return null;}}
function white(c){if(noiseBuffer)return noiseBuffer;const n=c.sampleRate*3,b=c.createBuffer(1,n,c.sampleRate),a=b.getChannelData(0);for(let i=0;i<n;i++)a[i]=Math.random()*2-1;noiseBuffer=b;return b;}
function bus(c,volume=1,pan=0){const g=c.createGain();g.gain.value=volume;const p=c.createStereoPanner?c.createStereoPanner():null;if(p){p.pan.value=Math.max(-1,Math.min(1,pan));g.connect(p);p.connect(master);}else g.connect(master);return g;}
function safeTime(c,t){return Number.isFinite(t)?Math.max(0,c.currentTime,t):Math.max(0,c.currentTime);}
function env(c,dest,t,d,peak=.1,attack=.008,release=.12){t=safeTime(c,t);const g=c.createGain();g.gain.setValueAtTime(.00001,t);g.gain.linearRampToValueAtTime(Math.max(.0001,peak),t+attack);g.gain.setValueAtTime(Math.max(.0001,peak),Math.max(t+attack,t+d-release));g.gain.exponentialRampToValueAtTime(.00001,t+d);g.connect(dest);return g;}
function osc(c,dest,t,d,f,fEnd,type='sawtooth',vol=.08){t=safeTime(c,t);const o=c.createOscillator();o.type=type;o.frequency.setValueAtTime(Math.max(20,f),t);o.frequency.exponentialRampToValueAtTime(Math.max(20,fEnd||f),t+d);o.connect(env(c,dest,t,d,vol,.012,Math.min(.15,d*.45)));o.start(t);o.stop(t+d+.015);}
function hiss(c,dest,t,d,vol=.1,low=100,high=3500){t=safeTime(c,t);const s=c.createBufferSource();s.buffer=white(c);s.loop=true;const hp=c.createBiquadFilter(),lp=c.createBiquadFilter();hp.type='highpass';hp.frequency.value=low;lp.type='lowpass';lp.frequency.value=high;s.connect(hp);hp.connect(lp);lp.connect(env(c,dest,t,d,vol,.004,Math.min(.3,d*.7)));s.start(t,Math.random()*2);s.stop(t+d+.01);}
function thud(c,dest,t,weight=1){osc(c,dest,t,.115,92*weight,38*weight,'sine',.15);hiss(c,dest,t,.095,.10,80,900);}
function movement(type='Infantry',options={}){const c=audio();if(!c)return;const t=c.currentTime+.012,d=Math.max(.35,Math.min(3,Number(options.duration)||1.25));const dest=bus(c,Math.max(.15,Math.min(1,Number(options.volume)||.8)),Number(options.pan)||0);const kind=String(type).toLowerCase();
 if(kind.includes('infan')){for(let i=0;i<Math.ceil(d/.21);i++){const at=t+i*.21+(Math.random()-.5)*.038;if(at>t+d-.08)break;thud(c,dest,at,.75+Math.random()*.25);hiss(c,dest,at+.012,.09,.05,350,3800);}hiss(c,dest,t,d,.022,160,1500);}
 else {const tank=kind.includes('armor'),tracked=tank||kind.includes('mechan'),motor=kind.includes('motor');const fundamental=tank?47:tracked?67:motor?105:85;const beats=tank?13:tracked?16:23;
 // Multiple harmonics produce an irregular multi-cylinder engine rather than a musical note.
 for(let h=1;h<=5;h++){const f=fundamental*h;osc(c,dest,t,d,f*(.90+Math.random()*.06),f*(1.05+Math.random()*.08),h%2?'sawtooth':'triangle',(.038/h)*(tank?1.4:1));}
 hiss(c,dest,t,d,tracked?.095:.07,55,tracked?1000:1800);
 for(let i=0;i<Math.ceil(d*beats);i++){const at=t+i/beats+(Math.random()-.5)*.015;if(at>t+d-.045)break;hiss(c,dest,at,tracked?.05:.035,tracked?.085:.038,tracked?400:250,tracked?4500:1800);if(tracked&&i%3===0)osc(c,dest,at,.055,440+Math.random()*180,170,'triangle',tank?.033:.021);}
 if(motor)hiss(c,dest,t,d,.052,500,5000);
 }
}
function gun(c,dest,t,heavy=false){hiss(c,dest,t,heavy?.29:.105,heavy?.29:.18,heavy?45:500,heavy?1400:9500);osc(c,dest,t,heavy?.38:.13,heavy?105:240,heavy?28:90,'triangle',heavy?.24:.11);if(heavy){hiss(c,dest,t+.06,.65,.085,35,550);for(let i=0;i<3;i++)hiss(c,dest,t+.18+i*.13,.18,.024,200,2300);}}
function combat(type='mixed'){const c=audio();if(!c)return;const t=c.currentTime+.015,dest=bus(c,.85);const kind=String(type).toLowerCase();const heavy=kind.includes('armor')||kind.includes('artill');if(heavy){gun(c,dest,t,true);gun(c,dest,t+.65,false);}else{for(let i=0;i<6;i++)gun(c,dest,t+i*.12+(Math.random()-.5)*.03,false);gun(c,dest,t+.86,true);}}
// Short, distinct, synthesized interface sounds (offline; obey Sound toggle).
function uiCue(kind){const c=audio();if(!c)return;const t=c.currentTime+.008,dest=bus(c,.40);
 if(kind==='select'){osc(c,dest,t,.105,530,690,'sine',.16);osc(c,dest,t+.085,.12,720,940,'triangle',.12);}
 else if(kind==='destination'){osc(c,dest,t,.13,780,490,'triangle',.17);osc(c,dest,t+.11,.16,520,340,'sine',.12);}
 else if(kind==='city'){osc(c,dest,t,.14,392,392,'sine',.12);osc(c,dest,t+.10,.17,494,494,'sine',.12);osc(c,dest,t+.20,.21,587,587,'sine',.13);}
 else {osc(c,dest,t,.10,240,175,'triangle',.12);hiss(c,dest,t,.07,.035,350,1600);}
}
// Two-second blocked-unit warning; uses synthesized audio, no external assets.
function blocked(){const c=audio();if(!c)return;const t=c.currentTime+.01,dest=bus(c,.55);
 for(let i=0;i<4;i++){const at=t+i*.5;osc(c,dest,at,.39,220,145,'square',.09);hiss(c,dest,at+.05,.25,.035,250,1500);}
}
function retreat(){
 const c=audio();if(!c)return;const t=c.currentTime+.01,dest=bus(c,.72);
 // Four-second retreat soundtrack: falling alarm, hurried footsteps and distant gunfire.
 for(let i=0;i<4;i++){
   const at=t+i*.95;
   osc(c,dest,at,.68,610-i*55,300-i*30,'sawtooth',.065);
   osc(c,dest,at+.10,.58,380-i*24,195-i*16,'triangle',.065);
   hiss(c,dest,at,.80,.036,150,1700);
 }
 for(let i=0;i<23;i++){
   const at=t+.15+i*.205;if(at>t+3.9)break;
   thud(c,dest,at,.62+(i%3)*.09);
 }
 for(const at of [1.0,2.45,3.5])gun(c,dest,t+at,false);
}
function surrender(){const c=audio();if(!c)return;const t=c.currentTime+.01,dest=bus(c,.6);for(let i=0;i<12;i++){const at=t+i*.48;osc(c,dest,at,.45,390*Math.pow(.94,i),290*Math.pow(.94,i),'sine',.075);if(i%3===0)hiss(c,dest,at,.38,.035,120,1400);}}
// Sound is cosmetic: never let an audio-device or scheduling failure interrupt a game turn.
function nonBlocking(fn){return function(...args){try{return fn(...args);}catch(error){console.warn('ARMAGEDDON audio skipped:',error);}};}
global.ARMAGEDDON_SOUND={uiCue:nonBlocking(uiCue),movement:nonBlocking(movement),combat:nonBlocking(combat),blocked:nonBlocking(blocked),retreat:nonBlocking(retreat),surrender:nonBlocking(surrender),unlock:nonBlocking(audio),setEnabled(v){enabled=!!v;if(!enabled&&ctx)ctx.suspend();else if(enabled&&ctx)ctx.resume();},get enabled(){return enabled;}};
})(window);
