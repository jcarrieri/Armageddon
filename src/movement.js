/* M3.2 movement resolution. All positions are snapshotted; no animation writes game state. */
(function(global){
'use strict';
const SPEED={Infantry:{Plains:3,Forest:2,Hills:2,River:1,Urban:4,Road:4,Mountains:1,Swamp:1,Lake:0},Motorized:{Plains:4,Forest:2,Hills:2,River:1,Urban:7,Road:7,Mountains:1,Swamp:1,Lake:0},Mechanized:{Plains:5,Forest:2,Hills:3,River:1,Urban:6,Road:6,Mountains:1,Swamp:1,Lake:0},Armored:{Plains:5,Forest:2,Hills:3,River:1,Urban:6,Road:6,Mountains:1,Swamp:1,Lake:0}};
const key=p=>`${p.col},${p.row}`;
function cost(d,terrain,from,to,terrainAt,primaryAttack=false){
 // Lake hexes are strictly impassable, regardless of roads or waterways.
 if(terrain==='Lake')return Infinity;
 // Water crossings take precedence over city entry, unless the exact crossing
 // is bridged by a road. City terrain alone never creates a bridge.
 const adjacent=from&&to&&global.ARMAGEDDON_HEX?(()=>{const a=global.ARMAGEDDON_HEX.axialFromOffset(from.col,from.row),b=global.ARMAGEDDON_HEX.axialFromOffset(to.col,to.row);return Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r))===1;})():false;
 const edge=adjacent?[key(from),key(to)].sort().join('|'):null;
 const roadBridge=Boolean(edge&&global.ARMAGEDDON_ROAD_KEYS?.has(edge));
 const river=Boolean(edge&&global.ARMAGEDDON_RIVER_KEYS?.has(edge));
 const stream=Boolean(edge&&global.ARMAGEDDON_STREAM_KEYS?.has(edge));
 const speeds=SPEED[d.type]||SPEED.Infantry;
 if(!roadBridge&&river)return 10/1;
 if(!roadBridge&&stream)return 10/2;
 // Primary attackers never receive the road movement-speed benefit.
 // A bridge still eliminates the water-crossing penalty, but the attacker
 // pays the destination hex's underlying terrain movement cost.
 // 'River' is a visual proximity terrain label, NOT proof that this move crosses water.
 // Only the exact shared hexside keys above can trigger river/stream crossing costs.
 const landTerrain=terrain==='River'?'Plains':terrain;
 const effective=primaryAttack?landTerrain:((landTerrain==='Urban'||roadBridge)?'Road':landTerrain);
 const supplyFactor=Math.max(.5,1+Math.min(0,Number.isFinite(d.supply)?d.supply:1)*.1);
 const baseSpeed=speeds[effective]||0;
 const mph=baseSpeed>0?Math.max(1,baseSpeed*supplyFactor):0;
 return mph>0?10/mph:Infinity;
}
// Diagnostic uses the same function as route planning, arrival labels and execution.
function explainCost(d,terrain,from,to,terrainAt,primaryAttack=false){
 const adjacent=Boolean(from&&to&&global.ARMAGEDDON_HEX&&(()=>{const a=global.ARMAGEDDON_HEX.axialFromOffset(from.col,from.row),b=global.ARMAGEDDON_HEX.axialFromOffset(to.col,to.row);return Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r))===1;})());
 const edge=adjacent?[key(from),key(to)].sort().join('|'):null;
 const bridge=Boolean(edge&&global.ARMAGEDDON_ROAD_KEYS?.has(edge));
 const river=Boolean(edge&&global.ARMAGEDDON_RIVER_KEYS?.has(edge));
 const stream=Boolean(edge&&global.ARMAGEDDON_STREAM_KEYS?.has(edge));
 const movementCost=cost(d,terrain,from,to,terrainAt,primaryAttack);
 return {unit:d.id,from:from?key(from):null,to:to?key(to):null,edge,terrain,underlyingTerrain:terrain==='River'?'Plains':terrain,river,stream,bridge,primaryAttack,tiCost:movementCost,effectiveSpeed:Number.isFinite(movementCost)?10/movementCost:0};
}
function isCityBridge(cell,terrainAt){
 const a=global.ARMAGEDDON_HEX.axialFromOffset(cell.col,cell.row);
 const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
 let cities=0;
 for(const [dq,dr] of dirs){const r=a.r+dr,q=a.q+dq,c=q+Math.floor(r/2);if(terrainAt(c,r)==='Urban')cities++;}
 return cities>=2;
}
function rank(d){return Number.isFinite(d.initiative)?d.initiative:0;}
class MovementEngine{
 constructor(scenario,terrainAt,planner){this.scenario=scenario;this.terrainAt=terrainAt;this.planner=planner;this.day=1;this.ti=0;this.lastRouteHeads=new Map();for(const d of scenario.divisions){d.tis=Number.isFinite(d.tis)?d.tis:0;this.lastRouteHeads.set(d.id,this.head(d.id));}}
 head(id){const p=this.planner.get(id)[0];return p?key(p):null;}
 step(){
  if(this.ti>=10)throw Error('Day already complete');this.ti++;
  const divisions=this.scenario.divisions,occupancy=new Map(divisions.filter(d=>!d.destroyed&&d.strength>0).map(d=>[key(d),d]));
  const candidates=[];const attacks=[];const attempted=new Set();const costs=new Map();const zoc=global.ARMAGEDDON_ZOC.compute(this.scenario);const zocStops=[];
  // Detect reciprocal enemy-occupied-hex orders before resolving any movement.
  // Only one primary attack is created for a swap; the other unit is its defender.
  // Neither division may exchange positions during movement resolution.
  const swapDefenders=new Set(),swapAttackers=new Map();
  for(const a of divisions){
   if(a.destroyed||a.strength<=0)continue;
   const b=occupancy.get(this.head(a.id));
   if(!b||b.side===a.side||b.destroyed||b.strength<=0||swapAttackers.has(a.id)||swapDefenders.has(a.id))continue;
   if(this.head(b.id)!==key(a))continue;
   const ca=cost(a,this.terrainAt(b.col,b.row),a,b,this.terrainAt,true);
   const cb=cost(b,this.terrainAt(a.col,a.row),b,a,this.terrainAt,true);
   const fa=Number(a.tis||0)+1+1e-9>=ca,fb=Number(b.tis||0)+1+1e-9>=cb;
   if(!fa&&!fb)continue;
   const attacker=fa&&(!fb||rank(a)>=rank(b))?a:b;
   const defender=attacker===a?b:a;
   swapAttackers.set(attacker.id,defender.id);
   swapDefenders.add(defender.id);
  }

  for(const d of divisions){
   if(d.destroyed||d.strength<=0)continue;
   const head=this.head(d.id),previous=this.lastRouteHeads.get(d.id);
   // A changed first destination cancels previously accumulated movement time.
   if(previous!==head && previous!==null && head!==null)d.tis=0;
   this.lastRouteHeads.set(d.id,head);
   d.tis+=1;
   // Reciprocal movement is combat, never a direct swap. The designated
   // defender remains in place this increment, even with a funded route.
   if(swapDefenders.has(d.id))continue;
   // A pause consumes this execution increment without moving or attacking.
   // It does not spend accumulated movement TIs, which continue accruing.
   if((d.pauseTIs||0)>0){d.pauseTIs--;continue;}
   if(!head)continue;
   const next=this.planner.get(d.id)[0];
   const occupant=occupancy.get(key(next));
   const primaryAttack=Boolean(occupant&&occupant.side!==d.side);
   // Friendly pass-through: wait in the starting hex until the entire contiguous
   // occupied segment can be traversed and an empty, non-enemy-ZOC hex reached.
   // Every traversed hex is paid for; movement commits atomically in one TI.
   if(occupant&&occupant.side===d.side){
     const route=this.planner.get(d.id),enemyZoc=zoc[global.ARMAGEDDON_ZOC.enemySide(d.side)];
     if(!enemyZoc.has(key(d))){
       let total=0,from=d,landing=null,steps=0,legal=true;
       for(const waypoint of route){
         const occupantHere=occupancy.get(key(waypoint));
         if(enemyZoc.has(key(waypoint))||(occupantHere&&occupantHere.side!==d.side)){legal=false;break;}
         const segment=cost(d,this.terrainAt(waypoint.col,waypoint.row),from,waypoint,this.terrainAt);
         if(!Number.isFinite(segment)){legal=false;break;}
         total+=segment;steps++;from=waypoint;
         if(!occupantHere){landing=waypoint;break;}
       }
       if(legal&&landing){
         costs.set(d.id,total);
         if(d.tis+1e-9>=total){attempted.add(d.id);d.ip=0;candidates.push({d,from:{col:d.col,row:d.row},to:{col:landing.col,row:landing.row},cost:total,remaining:d.tis-total,routeSteps:steps,passThrough:true});}
         continue;
       }
     }
     // Blocked until an eligible empty landing hex exists. Preserve accumulated TIs.
     continue;
   }
   const c=cost(d,this.terrainAt(next.col,next.row),d,next,this.terrainAt,primaryAttack);costs.set(d.id,c);
   if(!Number.isFinite(c)||d.tis+1e-9<c)continue;
   // IP is lost only on a funded attempt to enter another hex during execution.
   attempted.add(d.id);d.ip=0;
   const enemyZoc=zoc[global.ARMAGEDDON_ZOC.enemySide(d.side)];
   // No ordinary movement directly from one enemy-controlled hex to another.
   // The combat-triggering exception is deferred until the combat engine exists.
   // An ordered entry into an enemy-occupied hex is an attack, not movement.
   // Resolve the attack from the current hex; never overlap opposing counters.
   if(occupant&&occupant.side!==d.side){
     // An attack attempt spends the full destination entry cost immediately.
     // The division must fund that cost anew before another attack attempt.
     attacks.push({attacker:d.id,defender:occupant.id,from:{col:d.col,row:d.row},to:{col:next.col,row:next.row},entryCost:c,meeting:swapAttackers.get(d.id)===occupant.id,reciprocalMove:swapAttackers.get(d.id)===occupant.id});
     d.tis=Math.max(0,d.tis-c);continue;
   }
   if(enemyZoc.has(key(d))&&enemyZoc.has(key(next))){
     // ZOC-to-ZOC movement is an attack against an adjacent enemy whose ZOC
     // covers both origin and destination. Movement is held pending combat.
     const defenders=divisions.filter(e=>e.side!==d.side&&!e.destroyed&&e.strength>0&&
       global.ARMAGEDDON_ZOC.neighbors(e,this.scenario).some(n=>key(n)===key(d))&&
       global.ARMAGEDDON_ZOC.neighbors(e,this.scenario).some(n=>key(n)===key(next)));
     defenders.sort((a,b)=>rank(b)-rank(a)||a.id.localeCompare(b.id));
     if(defenders.length){attacks.push({attacker:d.id,defender:defenders[0].id,from:{col:d.col,row:d.row},to:{col:next.col,row:next.row},entryCost:c,meeting:true,zocAttack:true});d.tis=Math.max(0,d.tis-c);}
     else zocStops.push({id:d.id,from:{col:d.col,row:d.row},to:{col:next.col,row:next.row},reason:'ZOC-to-ZOC without an eligible adjacent defender'});
     continue;
   }
   candidates.push({d,from:{col:d.col,row:d.row},to:{col:next.col,row:next.row},cost:c,remaining:d.tis-c});
  }
  // Opposing claims on the same empty hex: initiative wins the movement
  // contest, but the opposing division initiates a meeting engagement.
  const destinationClaims=new Map();
  for(const c of candidates){const k=key(c.to);if(!destinationClaims.has(k))destinationClaims.set(k,[]);destinationClaims.get(k).push(c);}
  const meetingLosers=new Set();
  for(const list of destinationClaims.values()){
    if(new Set(list.map(c=>c.d.side)).size<2)continue;
    list.sort((a,b)=>rank(b.d)-rank(a.d)||a.d.id.localeCompare(b.d.id));
    const winner=list[0];
    for(const loser of list.slice(1))if(loser.d.side!==winner.d.side){
      meetingLosers.add(loser.d.id);
      // A meeting engagement is between the moving opponents, even though
      // only the winner enters the contested empty hex.
      attacks.push({attacker:winner.d.id,defender:loser.d.id,from:winner.from,to:winner.to,entryCost:winner.cost,meeting:true,contestedDestination:true});
    }
  }
  const eligibleCandidates=candidates.filter(c=>!meetingLosers.has(c.d.id));
  // Resolve other destination contention by initiative, then remaining TIs.
  const claims=new Map();for(const c of eligibleCandidates){const k=key(c.to);if(!claims.has(k))claims.set(k,[]);claims.get(k).push(c);}
  const chosen=new Map();
  for(const list of claims.values()){
   list.sort((a,b)=>rank(b.d)-rank(a.d)||b.remaining-a.remaining||a.d.id.localeCompare(b.d.id));
   chosen.set(list[0].d.id,list[0]);
  }
  // Atomic dependency evaluation: if a friendly occupant cannot vacate, its followers cannot enter.
  const allowed=new Map(),visiting=new Set();
  function canMove(id){if(allowed.has(id))return allowed.get(id);if(visiting.has(id))return true;
   const c=chosen.get(id);if(!c)return false;visiting.add(id);
   const occupant=occupancy.get(key(c.to));const ok=!occupant||(occupant.side===c.d.side&&canMove(occupant.id));
   visiting.delete(id);allowed.set(id,ok);return ok;
  }
  const events=[...chosen.values()].filter(c=>canMove(c.d.id));
  const blockedUnits=[...new Set([...zocStops.map(z=>z.id),...candidates.filter(c=>!events.includes(c)&&!meetingLosers.has(c.d.id)).map(c=>c.d.id)])];
  const moved=new Set(events.map(e=>e.d.id));
  // Do not erase accumulated TIs for units waiting on a friendly pass-through.
  // Their entire transit must be funded before the atomic hop can occur.
  // Simultaneous commit. An event carries immutable pre/post coordinates for presentation.
  for(const e of events){e.d.col=e.to.col;e.d.row=e.to.row;e.d.tis-=e.cost;const consumed=this.planner.get(e.d.id).splice(0,e.routeSteps||1);e.path=[e.from,...consumed.map(p=>({col:p.col,row:p.row}))];
    const pauses=consumed.reduce((n,point)=>n+(point.pauseCount||0)+(point.pause?1:0),0);
    e.d.pauseTIs=(e.d.pauseTIs||0)+pauses;
    this.lastRouteHeads.set(e.d.id,this.head(e.d.id));}
  return {day:this.day,ti:this.ti,events:events.map(e=>({id:e.d.id,from:e.from,to:e.to,cost:e.cost,path:e.path})),blocked:candidates.length-events.length+zocStops.length,blockedUnits,zocStops,attacks,attempted:[...attempted]};
 }
 nextDay(){if(this.ti!==10)throw Error('Complete all 10 TIs first');this.day++;this.ti=0;for(const d of this.scenario.divisions){this.lastRouteHeads.set(d.id,this.head(d.id));}}
}
global.ARMAGEDDON_MOVEMENT={explainCost,MovementEngine,cost,SPEED,isCityBridge};
})(window);
