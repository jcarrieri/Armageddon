/* M3.5: ZOC geometry from the current, occupied six adjacent hexes. */
(function(global){'use strict';
const offsets=[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
const key=(p)=>`${p.col},${p.row}`;
function neighbors(p,scenario){const a=global.ARMAGEDDON_HEX.axialFromOffset(p.col,p.row);return offsets.map(([dq,dr])=>{const r=a.r+dr;return {col:a.q+dq+Math.floor(r/2),row:r};}).filter(p=>p.col>=0&&p.row>=0&&p.col<scenario.cols&&p.row<scenario.rows);}
function compute(scenario){const result={Blue:new Set(),Red:new Set()};for(const d of scenario.divisions)for(const n of neighbors(d,scenario))result[d.side].add(key(n));return result;}
// Presentation only: radius-three friendly and enemy influence, not a change to movement ZOC rules.
function visualAreas(scenario,radius=3){
 const result={Blue:new Map(),Red:new Map()};
 for(const d of scenario.divisions){
  const origin=global.ARMAGEDDON_HEX.axialFromOffset(d.col,d.row);
  for(let dq=-radius;dq<=radius;dq++)for(let dr=-radius;dr<=radius;dr++){
   const distance=Math.max(Math.abs(dq),Math.abs(dr),Math.abs(dq+dr));
   if(distance>radius)continue;
   const r=origin.r+dr,col=origin.q+dq+Math.floor(r/2),row=r;
   if(col<0||row<0||col>=scenario.cols||row>=scenario.rows)continue;
   const k=`${col},${row}`,old=result[d.side].get(k);
   if(old===undefined||distance<old)result[d.side].set(k,distance);
  }
 }
 return result;
}
function enemySide(side){return side==='Blue'?'Red':'Blue';}
global.ARMAGEDDON_ZOC={neighbors,compute,visualAreas,key,enemySide};
})(window);
