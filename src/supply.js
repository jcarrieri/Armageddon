/* ARMAGEDDON M3.80: start-of-turn supply network. */
(function(global){'use strict';
const key=(c,r)=>c+','+r;
function check(scenario,terrainAt,controlAt,cityStates){
 const units=scenario.divisions.filter(d=>!d.destroyed&&d.strength>0);
 const occupied=new Map(units.map(d=>[key(d.col,d.row),d.side]));
 const border=global.ARMAGEDDON_BORDER||[];
 const cities=global.ARMAGEDDON_CITIES||[];
 const output=new Map();
 for(const side of ['Blue','Red']){
  function passable(c,r){
   if(c<0||r<0||c>=scenario.cols||r>=scenario.rows)return false;
   if(['Lake','Mountains'].includes(terrainAt(c,r)))return false;
   const k=key(c,r),occ=occupied.get(k);
   if(occ)return occ===side; // Occupation overrides opposing ZOCs.
   // Trace supply through current friendly-controlled territory, not only original home territory.
   const friendly=typeof controlAt==='function'?controlAt(c,r)===side:(side==='Blue'?r>=border[c]:r<border[c]);
   // Current territorial control already accounts for enemy ZOCs and contested hexes.
   // A friendly-controlled hex remains supply-passable even inside an enemy ZOC.
   return friendly;
  }
  const seen=new Set(),queue=[];
  for(const city of cities){
   const state=cityStates&&cityStates.find(s=>s.city===city);
   if((state?state.owner:city.side)!==side || (state?(state.occupier||state.pacification>0):(city.pacifying||city.underPacification)))continue;
   // City anchor may be occupied by an enemy; such a city is not a supply source.
   if(!passable(city.c,city.r))continue;
   const k=key(city.c,city.r);if(!seen.has(k)){seen.add(k);queue.push({col:city.c,row:city.r});}
  }
  for(let i=0;i<queue.length;i++)for(const n of global.ARMAGEDDON_ZOC.neighbors(queue[i],scenario)){
   const k=key(n.col,n.row);if(!seen.has(k)&&passable(n.col,n.row)){seen.add(k);queue.push(n);}
  }
  for(const d of units)if(d.side===side)output.set(d.id,seen.has(key(d.col,d.row)));
 }
 return output;
}
global.ARMAGEDDON_SUPPLY={check};
})(window);
