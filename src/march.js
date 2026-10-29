/* Offline, original procedural military march. No audio files required. */
(function(w){'use strict';
let ctx=null,output=null,timer=null,step=0,next=0,enabled=true,active=false;
const tempo=112, beat=60/tempo, eighth=beat/2;
const tune=[67,67,69,71,72,71,69,67,64,64,67,69,67,66,64,62,67,67,69,71,74,72,71,69,67,64,66,67,69,67,67,null];
const bass=[43,43,38,38,40,40,38,38];
function init(){try{ctx=ctx||new (w.AudioContext||w.webkitAudioContext)();if(!output){output=ctx.createGain();output.gain.value=.18;const comp=ctx.createDynamicsCompressor();comp.threshold.value=-20;comp.ratio.value=3;output.connect(comp);comp.connect(ctx.destination);}ctx.resume();return true;}catch(e){return false;}}
function hz(n){return 440*Math.pow(2,(n-69)/12);}
function tone(note,at,duration,vol=.1,type='sawtooth',filter=1000){if(note==null)return;const o=ctx.createOscillator(),f=ctx.createBiquadFilter(),g=ctx.createGain();o.type=type;o.frequency.value=hz(note);f.type='lowpass';f.frequency.value=filter;g.gain.setValueAtTime(.0001,at);g.gain.linearRampToValueAtTime(vol,at+.025);g.gain.setValueAtTime(vol*.72,at+Math.min(duration*.6,.22));g.gain.exponentialRampToValueAtTime(.0001,at+duration);o.connect(f);f.connect(g);g.connect(output);o.start(at);o.stop(at+duration+.02);}
function drum(at,snare=false){const n=Math.floor(ctx.sampleRate*.12),b=ctx.createBuffer(1,n,ctx.sampleRate),a=b.getChannelData(0);for(let i=0;i<n;i++)a[i]=(Math.random()*2-1)*Math.exp(-i/(n*(snare?.20:.13)));const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=b;f.type=snare?'highpass':'lowpass';f.frequency.value=snare?850:180;g.gain.value=snare?.085:.15;s.connect(f);f.connect(g);g.connect(output);s.start(at);s.stop(at+.12);if(!snare)tone(36,at,.14,.10,'sine',200);}
function schedule(){if(!active||!ctx)return;while(next<ctx.currentTime+.35){const s=step%32;const note=tune[s];if(note!=null){tone(note,next,eighth*.88,.082,'sawtooth',1250);tone(note-12,next,eighth*.75,.025,'triangle',650);}if(s%2===0){const root=bass[Math.floor(s/4)%8];tone(root,next,beat*.88,.10,'triangle',500);tone(root+7,next,beat*.82,.025,'sawtooth',600);drum(next,s%4===2);}else if(s%4===3)drum(next,true);step++;next+=eighth;}}
function start(){if(!enabled)return;if(!init())return;if(active)return;active=true;step=0;next=ctx.currentTime+.06;timer=setInterval(schedule,90);schedule();}
function stop(){active=false;if(timer){clearInterval(timer);timer=null;}if(output&&ctx){output.gain.cancelScheduledValues(ctx.currentTime);output.gain.setTargetAtTime(0,ctx.currentTime,.12);}}
function setEnabled(v){enabled=!!v;if(!enabled){stop();}else{if(output)output.gain.value=.18;start();}}
w.ARMAGEDDON_MARCH={start,stop,setEnabled,get enabled(){return enabled;}};
})(window);
