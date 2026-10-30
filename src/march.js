/* M6.08: opening, setup, and battlefield phase music. */
(function(w){'use strict';
 const tracks=['music/exciting-trailer.mp3','music/at-launch.mp3','music/black-vortex.mp3','music/the-descent.mp3'];
 const audio=new Audio();audio.loop=true;audio.preload='auto';audio.volume=0.20;
 let enabled=true,active=false,page=0;
 // Browser autoplay policies require a real user gesture. Starting from the
 // initial opening screen (rather than after advancing) is now supported.
 // Playback is started directly by the opening screen click handler, which stays on that screen.
 function selectPage(n){page=n;if(n>3){stop();return;}const path=tracks[n];if(audio.getAttribute('src')!==path){audio.pause();audio.setAttribute('src',path);audio.load();}if(enabled&&(active||n===3)){active=true;audio.play().catch(err=>{console.warn('Opening music playback failed:',err);});}}
 function start(){if(!enabled||page>3)return;active=true;audio.play().catch(err=>{console.warn('Opening music playback failed:',err);});}
 function stop(){active=false;audio.pause();audio.currentTime=0;}
 function setEnabled(value){enabled=!!value;if(!enabled){audio.pause();}else if(page<=3){start();}}
 // Battlefield music uses a separate audio channel from the opening sequence.
 const battleAudio=new Audio();battleAudio.loop=true;battleAudio.preload='none';battleAudio.volume=0.10;
 let battlePhase='planning',battleEnabled=true,battleUnlocked=false;
 const battleTracks={planning:'music/five-armies.mp3'};
 function playBattle(){
   if(!battleEnabled||!battleUnlocked||battlePhase==='execution'){battleAudio.pause();return;}
   const path=battleTracks[battlePhase];
   if(battleAudio.getAttribute('src')!==path){battleAudio.pause();battleAudio.setAttribute('src',path);battleAudio.load();}
   battleAudio.play().catch(err=>console.warn('Battlefield music could not play:',err));
 }
 function setBattlePhase(phase){battlePhase=phase==='execution'?'execution':'planning';if(battlePhase==='execution'){battleAudio.pause();return;}playBattle();}
 function unlockBattleMusic(){battleUnlocked=true;playBattle();}
 function setBattleEnabled(value){battleEnabled=!!value;if(!battleEnabled)battleAudio.pause();else unlockBattleMusic();}
 w.ARMAGEDDON_MARCH={start,stop,setEnabled,selectPage,setBattlePhase,unlockBattleMusic,setBattleEnabled,
   get battleEnabled(){return battleEnabled;},get battlePhase(){return battlePhase;},
   get enabled(){return enabled;},get active(){return active;}};
})(window);
