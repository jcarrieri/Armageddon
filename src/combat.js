/* ARMAGEDDON M3.75 combat: persistent three-TI battles, simultaneous fire,
   terrain/type odds, morale, improved positions and retreats. */
(function(global){'use strict';
const Z=()=>global.ARMAGEDDON_ZOC;
const TYPES=['Infantry','Motorized','Mechanized','Armored'];
const A={Plains:[1,1.2,1.4,1.6],Forest:[.8,.8,.8,.8],Hills:[.9,1,1.1,1.2],Swamp:[.7,.7,.7,.7],Mountains:[.6,.6,.6,.6],Urban:[.7,.7,.7,.7]};
const D={Plains:[1,1,1,1],Forest:[1,1,1,1],Hills:[1,1,1,1],Swamp:[1,1,1,1],Mountains:[1,1,1,1],Urban:[1,1,1,1]};
const key=d=>`${d.col},${d.row}`;
const rnd=()=>1; // M3.78: deterministic combat testing; random damage multiplier disabled.
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const terrain=(matrix,name,type)=> (matrix[name]||matrix.Plains)[Math.max(0,TYPES.indexOf(type))];
function distance(a,b){const x=global.ARMAGEDDON_HEX.axialFromOffset(a.col,a.row),y=global.ARMAGEDDON_HEX.axialFromOffset(b.col,b.row);return Math.max(Math.abs(x.q-y.q),Math.abs(x.r-y.r),Math.abs(x.q+x.r-y.q-y.r));}
const battles=new Map();
const completedOrders=new Map();
const firedToday=new Set();
const dailyBattles=[];
const dayStartStrength=new Map();
let firingDay=null;
const dead=d=>!d||d.destroyed||d.strength<=0;
function reset(){battles.clear();completedOrders.clear();firedToday.clear();dailyBattles.length=0;dayStartStrength.clear();firingDay=null;}
function resolve(scenario,terrainAt,day,ti,attackOrders=[],planner=null,movementEvents=[],movementAttempts=[]){
 const units=scenario.divisions, byId=new Map(units.map(d=>[d.id,d]));
 if(firingDay!==day){firedToday.clear();dailyBattles.length=0;dayStartStrength.clear();for(const u of units)dayStartStrength.set(u.id,u.strength);firingDay=day;}
 // Supply status is assessed once at the start of each day in app.js.
 // No hourly supply regeneration/consumption.
 const attempted=new Set(movementAttempts);
 // Starting an attack immediately removes the attacker's prepared position.
 // Active attackers do not rebuild IP while combat continues.
 const startingAttackers=new Set(attackOrders.map(o=>o.attacker));
 const ongoingAttackers=new Set([...battles.values()].map(b=>b.a));
 for(const id of startingAttackers){const attacker=byId.get(id);if(attacker&&!dead(attacker))attacker.ip=0;}
 for(const u of units){if(!dead(u)){u.supply=clamp(Number.isFinite(u.supply)?u.supply:1,-9,1);}}
 for(const d of units){
  if(dead(d))continue;
  d.effectiveness=clamp(Number.isFinite(d.effectiveness)?d.effectiveness:100,10,100);
  d.ip=clamp(Number.isFinite(d.ip)?d.ip:0,0,30);
  if(attempted.has(d.id)||startingAttackers.has(d.id)||ongoingAttackers.has(d.id))continue;
  // Stationary units prepare regardless of pending orders or combat activity.
  d.ip=Math.min(30,d.ip+2.0);
 }
 // Clear completed-order guards once a unit changes or cancels its route.
 if(planner)for(const [id,signature] of completedOrders){const u=byId.get(id),next=planner.get(id)[0];if(!u||!next||`${u.col},${u.row}>${next.col},${next.row}`!==signature)completedOrders.delete(id);}
 // Each funded enemy-hex entry initiates a persistent three-increment battle.
 // The entry credit is retained; combat costs are charged only after initiation.
 for(const order of attackOrders){
  const a=byId.get(order.attacker),d=byId.get(order.defender);
  if(dead(a)||dead(d)||a.side===d.side||distance(a,d)!==1||firedToday.has(a.id)||firedToday.has(d.id))continue;
  const id=a.id+'>'+d.id;
  const signature=`${a.col},${a.row}>${d.col},${d.row}`;
  if(completedOrders.get(a.id)===signature)continue;
  if(!battles.has(id)){battles.set(id,{a:a.id,d:d.id,remaining:3,target:{col:d.col,row:d.row},started:day+':'+ti});}
 }
 const active=[...battles.entries()].filter(([id,b])=>{
  const a=byId.get(b.a),d=byId.get(b.d);
  if(dead(a)||dead(d)||distance(a,d)!==1){battles.delete(id);return false;}return true;
 });
 // Remember battle roles for the single end-of-turn morale resolution.
 for(const [,b] of active){
  const orders=attackOrders.filter(o=>o.attacker===b.a&&o.defender===b.d);
  const meeting=orders.some(o=>o.reciprocalMove||o.contestedDestination||o.meeting);
  dailyBattles.push({attacker:b.a,defender:b.d,target:{...b.target},meeting,
   attackerFrom:{col:byId.get(b.a).col,row:byId.get(b.a).row},
   defenderFrom:{col:byId.get(b.d).col,row:byId.get(b.d).row},
   meetingTarget:orders[0]?.to||null});
 }
 const primary=new Set(active.flatMap(([,b])=>[b.a,b.d]));
 // One unit can participate in several battles but cannot commit more than its manpower.
 const engagementsByUnit=new Map();
 for(const [id,b] of active)for(const unit of [b.a,b.d]){if(!engagementsByUnit.has(unit))engagementsByUnit.set(unit,[]);engagementsByUnit.get(unit).push(id);}
 // M5.74: Expand participation only through adjacency to an enemy who
 // already participates. Friendly-only chains cannot pull units into combat.
 // The closure is shared across simultaneously initiated primary engagements.
 const participants=new Set(primary);
 let changed=true;
 while(changed){
  changed=false;
  for(const u of units){
   if(dead(u)||participants.has(u.id))continue;
   if(units.some(v=>!dead(v)&&participants.has(v.id)&&v.side!==u.side&&distance(u,v)===1)){
    participants.add(u.id);changed=true;
   }
  }
 }
 const supporters=new Map();
 for(const id of participants){if(!primary.has(id))supporters.set(id,[]);}
 // M5.01: Identify stationary primary defenders from the movement snapshot.
 // An attack order's nominal role must not deprive a stationary target of
 // defender protection. Reciprocal moving attacks are meeting engagements.
 const defendingIds=new Set();
 const meetingIds=new Set();
 for(const [,battle] of active){
  const attacker=byId.get(battle.a),defender=byId.get(battle.d);
  const orders=attackOrders.filter(o=>(o.attacker===battle.a&&o.defender===battle.d));
  const meeting=orders.some(o=>o.reciprocalMove||o.contestedDestination||
    (o.meeting&&attempted.has(battle.a)&&attempted.has(battle.d)));
  if(meeting){meetingIds.add(battle.a);meetingIds.add(battle.d);continue;}
  if(defender&&!attempted.has(defender.id))defendingIds.add(defender.id);
  else if(attacker&&!attempted.has(attacker.id)&&defender&&attempted.has(defender.id))defendingIds.add(attacker.id);
  else if(defender)defendingIds.add(defender.id);
 }
 const targetIsDefending=target=>defendingIds.has(target.id)&&!meetingIds.has(target.id);
 const outgoing=new Map(),incoming=new Map(),engagements=[];
 const fireDetails=new Map();
 const add=(map,id,value)=>map.set(id,(map.get(id)||0)+value);
 function fire(source,target,share,isAttacker,defenderPrimary){
  const morale=source.effectiveness;
  // Attacker fire uses target terrain; defensive fire has no target-terrain modifier.
  const targetTerrain=terrainAt(target.col,target.row);
  const mod=isAttacker?terrain(A,targetTerrain,source.type):1;
  const matchup=1+(TYPES.indexOf(source.type)-TYPES.indexOf(target.type))*.1;
  const ip=targetIsDefending(target) ? 1-clamp(target.ip,0,30)/100 : 1; // Only primary defenders receive IP protection against attacking fire.
  const supply=Math.max(.5,1+Math.min(0,source.supply)*.1);
  // M5.64: every negative target SR point increases incoming damage by 5%.
  const incomingSupply=1+.05*Math.max(0,-(Number(target.supply)||0));
  // Water combat penalties apply only to attacking fire across the shared hex edge.
  // A bridged river uses 80%; a bridged stream uses 90%.
  const crossing=[key(source),key(target)].sort().join('|');
  const river=Boolean(global.ARMAGEDDON_RIVER_KEYS?.has(crossing));
  const stream=Boolean(global.ARMAGEDDON_STREAM_KEYS?.has(crossing));
  const bridge=Boolean(global.ARMAGEDDON_ROAD_KEYS?.has(crossing));
  const waterModifier=!isAttacker?1:(river||stream)?(bridge?(river?.80:.90):(river?.50:.80)):1;
  const random=1; // deterministic casualty testing remains enabled.
  const moraleFactor=Math.sqrt(clamp(morale,10,100)/100);
  const finalRating=moraleFactor*supply*incomingSupply*mod*matchup*ip*waterModifier*random*(targetIsDefending(target)?0.70:1);
  const damage=.10*share*finalRating;
  const detail={unit:source.id,target:target.id,role:isAttacker?'Attacker':'Defender',strength:source.strength,committed:share,
    morale,moraleFactor,supply,incomingSupply,terrain:mod,
    terrainName:targetTerrain,
    matchup,improvedPosition:ip,defenderProtection:targetIsDefending(target)?.70:1,waterModifier,waterCrossing:river?'River':stream?'Stream':'None',bridge:bridge&&(river||stream),random,finalRating,damage};
  if(!fireDetails.has(source.id+'>'+target.id))fireDetails.set(source.id+'>'+target.id,[]);
  fireDetails.get(source.id+'>'+target.id).push(detail);
  add(incoming,target.id,damage);add(outgoing,source.id,damage);
  return damage;
 }
 // Resolve one simultaneous adjacency volley for the entire hour. Each participating
 // division commits its full pre-casualty strength, divided equally among all
 // adjacent enemy divisions (not merely enemies named in individual battles).
 // Participants were computed by enemy-adjacency closure above.
 // Combat underway prevents attackers from earning stationary preparation.
 for(const [,battle] of active){const attacker=byId.get(battle.a);if(attacker)attacker.ip=0;}
 const participatingUnits=[...participants].map(id=>byId.get(id)).filter(u=>!dead(u));
 // M4.85: Battle role belongs to the attacking SIDE, not just the primary
 // attacker ID. An attacking supporter firing on the primary defender must
 // receive the same attacker modifiers and defender/IP reductions.
 const isAttacking=(u,v)=>active.some(([,pair])=>{
  const attacker=byId.get(pair.a),defender=byId.get(pair.d);
  return attacker&&defender&&u.side!==v.side&&targetIsDefending(v)
    &&(u.id===pair.a||u.side===attacker.side||distance(u,v)===1);
 });
 for(const source of participatingUnits){
  // M5.77: Each division fires in at most ONE combat increment per game day.
  // It remains vulnerable to incoming fire in subsequent increments.
  if(firedToday.has(source.id))continue;
  const targets=participatingUnits.filter(target=>target.id!==source.id&&target.side!==source.side&&distance(source,target)===1);
  if(!targets.length)continue;
  const share=source.strength/targets.length;
  for(const target of targets)fire(source,target,share,isAttacking(source,target),true);
 }
 // Present one consolidated combat report per hourly volley. This avoids
 // attributing the same casualties to multiple battles or replaying fire.
 if(active.length){
  const [id,b]=active[0],a=byId.get(b.a),d=byId.get(b.d);
  const details=[...fireDetails.values()].flat();
  const actualFireToSide=side=>details.filter(f=>byId.get(f.target)?.side===side).reduce((sum,f)=>sum+f.damage,0);
  engagements.push({day,ti,blue:a.side==='Blue'?a.id:d.id,red:a.side==='Red'?a.id:d.id,
   blueLoss:0,redLoss:0,at:{col:d.col,row:d.row},attacker:a.id,defender:d.id,battleId:id,increment:4-b.remaining,
   rawAttackerLoss:incoming.get(a.id)||0,rawDefenderLoss:incoming.get(d.id)||0,
   attackerFactors:details.filter(f=>f.unit===a.id),
   defenderFactors:details.filter(f=>f.unit===d.id),
   supportFactors:details.filter(f=>f.unit!==a.id&&f.unit!==d.id),
   firePairs:details.map(f=>({source:f.unit,target:f.target,role:f.role})),
   volleyBlueDamage:actualFireToSide('Blue'),volleyRedDamage:actualFireToSide('Red')});
 }
 for(const [,b] of active)b.remaining--;
 // Simultaneous casualties, rounding only after all incoming fire is aggregated.
 const actual=new Map();const destroyed=[];
 for(const u of units){const damage=Math.min(u.strength,Math.floor((incoming.get(u.id)||0)+.5));
  actual.set(u.id,damage);u.strength-=damage;u.totalCasualties=(u.totalCasualties||0)+damage;
  if(u.strength<=0&&!u.destroyed){u.destroyed=true;destroyed.push({id:u.id,side:u.side,col:u.col,row:u.row,day,ti});}
 }
 // M4.81: Allocate every actual casualty to its firing source, target by target.
 // Largest-remainder apportionment guarantees integer Dam credits sum exactly
 // to the losses recorded for each target (including split fire).
 const damageByUnit={};const firingUnits=new Set();
 const allShots=[...fireDetails.values()].flat();
 for(const f of allShots)firingUnits.add(f.unit);
 for(const id of firingUnits)firedToday.add(id);
 for(const [targetId,raw] of incoming){
  const received=actual.get(targetId)||0;
  if(raw<=0||received<=0)continue;
  const shots=allShots.filter(f=>f.target===targetId&&f.damage>0);
  if(!shots.length)throw new Error(`Combat accounting: ${targetId} received casualties without firing source`);
  const portions=shots.map((f,i)=>({id:f.unit,index:i,exact:received*f.damage/raw}));
  let allocated=0;
  for(const p of portions){p.count=Math.floor(p.exact);allocated+=p.count;}
  portions.sort((a,b)=>(b.exact-b.count)-(a.exact-a.count)||a.index-b.index);
  for(let i=0;i<received-allocated;i++)portions[i%portions.length].count++;
  for(const p of portions)damageByUnit[p.id]=(damageByUnit[p.id]||0)+p.count;
 }
 const credited=new Map(Object.entries(damageByUnit));
 // Allocate credited kills in proportion to fire contribution against each target.
 // Morale adjustments occur once per consolidated hourly volley.
 // Morale: +0.02 per credited enemy casualty, -0.04 per own casualty.
 // Use the same exact per-source credits for morale.
 // This prevents the casualty and damage accounting systems from diverging.
 for(const u of units){if(u.destroyed)continue;u.effectiveness=clamp(u.effectiveness+.02*(credited.get(u.id)||0)-.04*(actual.get(u.id)||0),10,100);}
 for(const e of engagements){const a=byId.get(e.attacker),d=byId.get(e.defender);
  e.blueLoss=units.filter(u=>u.side==='Blue').reduce((n,u)=>n+(actual.get(u.id)||0),0);
  e.redLoss=units.filter(u=>u.side==='Red').reduce((n,u)=>n+(actual.get(u.id)||0),0);
 }
 const retreats=[],failedRetreats=[],failedAttackers=[];
 // M5.49: No morale checks or morale-driven retreats during hourly combat.
 // The only morale check is after all ten movement/combat increments.
 // M5.65: Combat must never erase plotted movement orders or zero
 // accumulated movement TIs. The normal firing charge is still paid,
 // including by a defending division attempting an ordered withdrawal.
 // Completed attack guards prevent a repeated attack on the same occupied
 // hex until the route or opposing occupancy changes.
 for(const [id,b] of active){
  if(b.remaining<=0){
   const a=byId.get(b.a),d=byId.get(b.d);
   if(a&&d&&!dead(a)&&!dead(d)&&(a.stance||'Hold')!=='Assault'){
    completedOrders.set(a.id,`${a.col},${a.row}>${d.col},${d.row}`);
   }
   battles.delete(id);
  }
 }
 // Charge each firing division for its single combat increment;
 // negative balances are retained until end-of-day combat cleanup.
 for(const id of firingUnits){
  const unit=byId.get(id);
  if(!unit)continue;
  unit.tis=Number(unit.tis||0)-1;
  unit._dayTISpent=Number(unit._dayTISpent||0)+1;
 }
 return {damageByUnit,firingUnits:[...firingUnits],shots:[...fireDetails.values()].flat(),engagements,destroyed,retreats,failedRetreats,failedAttackers,activeBattles:battles.size,participants:[...participants]};
}

// Once per completed ten-TI turn, check every surviving combat participant once.
// Resolve retreat/surrender and permitted advances only after all checks.
function endTurn(scenario,terrainAt,day,participantIds,planner){
 const units=scenario.divisions,byId=new Map(units.map(d=>[d.id,d]));
 const ti=10;
 const actual=new Map(units.map(u=>[u.id,Math.max(0,(dayStartStrength.get(u.id)??u.strength)-u.strength)])),destroyed=[],retreats=[],failedRetreats=[],failedAttackers=[];
 const zoc=Z().compute(scenario);
 const moraleFailed=new Set();
 const participants=new Set(participantIds||[]);
 for(const b of dailyBattles){participants.add(b.attacker);participants.add(b.defender);}
 // One end-of-turn morale check per combatant, plus one for divisions
 // already FAILING at the start of this turn. No duplicate checks.
 const priorFailing=new Set(units.filter(u=>!dead(u)&&u.failedMorale).map(u=>u.id));
 const adjacentEnemy=u=>units.some(v=>!dead(v)&&v.side!==u.side&&distance(u,v)===1);
 const checkMorale=u=>{
  const failed=Math.random()<Math.max(0,80-u.effectiveness)/100;
  u.lastMoraleCheck=failed?'failed':'passed';
  u.moraleFailureStreak=failed?(Math.max(0,Number(u.moraleFailureStreak)|| (priorFailing.has(u.id)?1:0))+1):0;
  u.failedMorale=failed;
  if(failed){moraleFailed.add(u.id);if(u.moraleFailureStreak>=3&&adjacentEnemy(u))surrender(u);}
 };
 const checkIds=new Set([...participants,...priorFailing]);
 for(const id of checkIds){const u=byId.get(id);if(!dead(u))checkMorale(u);}
 function applyExtra(u,amount){const n=Math.min(u.strength,Math.max(0,Math.round(amount)));u.strength-=n;u.totalCasualties+=n;u.effectiveness=clamp(u.effectiveness-.04*n,10,100);actual.set(u.id,(actual.get(u.id)||0)+n);if(u.strength<=0&&!u.destroyed){u.destroyed=true;destroyed.push({id:u.id,side:u.side,col:u.col,row:u.row,day,ti});}return n;}
 function surrender(u){if(dead(u))return;u.destroyed=true;destroyed.push({id:u.id,side:u.side,col:u.col,row:u.row,day,ti,surrender:true});if(planner)planner.get(u.id).length=0;}
 function retreatPenalty(u){failedRetreats.push(u.id);applyExtra(u,actual.get(u.id)||0);/* no second morale check this turn */}
 // Select all mandatory retreats from the SAME pre-retreat board state.
 // Resolve destination/displacement conflicts before moving any division.
 const originalOccupied=new Map(units.filter(v=>!dead(v)).map(v=>[key(v),v]));
 const cityStates=global.ARMAGEDDON_CITY_STATE||[];
 const cityAt=n=>cityStates.find(c=>c.city&&distance({col:c.city.c,row:c.city.r},n)<3&&terrainAt(n.col,n.row)==='Urban');
 const legal=n=>terrainAt(n.col,n.row)!=='Lake'&&!((cityAt(n)?.pacification||0)>0);
 const candidates=u=>{
  const enemyZoc=zoc[Z().enemySide(u.side)];
  const friendlyCities=cityStates.filter(c=>c.pacification===0&&c.owner===u.side).map(c=>({col:c.city.c,row:c.city.r}));
  const nearest=n=>friendlyCities.length?Math.min(...friendlyCities.map(c=>distance(c,n))):Infinity;
  const options=[];
  for(const n of Z().neighbors(u,scenario)){
   if(!legal(n))continue;
   const occupant=originalOccupied.get(key(n));
   if(occupant&&occupant.side!==u.side)continue;
   const zone=enemyZoc.has(key(n));
   let displacementOptions=[];
   if(occupant){
    // A simultaneous retreating occupant will vacate; no displacement required.
    if(!moraleFailed.has(occupant.id)){
     displacementOptions=Z().neighbors(occupant,scenario).filter(x=>!originalOccupied.has(key(x))&&!enemyZoc.has(key(x))&&legal(x)&&key(x)!==key(u));
     displacementOptions.sort((a,b)=>nearest(a)-nearest(b));
     if(!displacementOptions.length)continue;
    }
   }
   options.push({n,zone,occupant,displacementOptions,priority:zone?(occupant?3:2):(occupant?1:0),cityDistance:nearest(n),tie:Math.random()});
  }
  return options.sort((a,b)=>a.priority-b.priority||a.cityDistance-b.cityDistance||a.tie-b.tie);
 };
 const selected=new Map(),reserved=new Set();
 const retreating=units.filter(u=>moraleFailed.has(u.id)&&!dead(u));
 // Resolve competing destinations deterministically by initiative where present.
 retreating.sort((a,b)=>(Number(b.initiative)||0)-(Number(a.initiative)||0)||a.id.localeCompare(b.id));
 for(const u of retreating){
  for(const option of candidates(u)){
   if(reserved.has(key(option.n)))continue;
   const occupant=option.occupant;
   if(occupant&&moraleFailed.has(occupant.id)&&!dead(occupant)){
    // Avoid depending on a retreat that has not yet been assigned.
    if(!selected.has(occupant.id))continue;
    if(key(selected.get(occupant.id).n)===key(u))continue;
   }
   const displacement=option.displacementOptions.find(x=>!reserved.has(key(x))&&key(x)!==key(option.n));
   if(occupant&&!moraleFailed.has(occupant.id)&&!displacement)continue;
   selected.set(u.id,{...option,displacement});reserved.add(key(option.n));
   if(displacement)reserved.add(key(displacement));
   break;
  }
 }
 // Compute all movement and costs, then commit as one batch.
 const moves=[];
 for(const u of retreating){
  const choice=selected.get(u.id);
  if(!choice){retreatPenalty(u);if(planner)planner.get(u.id).length=0;u.tis=0;continue;}
  if(choice.displacement){const v=choice.occupant,to=choice.displacement;
   moves.push({unit:v,from:{col:v.col,row:v.row},to,displaced:true});
  }
  moves.push({unit:u,from:{col:u.col,row:u.row},to:choice.n,enemyZoc:choice.zone});
 }
 for(const m of moves){
  const u=m.unit,cost=global.ARMAGEDDON_MOVEMENT.cost(u,terrainAt(m.to.col,m.to.row),u,m.to,terrainAt);
  u.tis=(u.tis||0)-cost;
  if(!m.displaced&&m.enemyZoc)retreatPenalty(u);
  if(!m.displaced&&planner)planner.get(u.id).length=0;
 }
 for(const m of moves){m.unit.col=m.to.col;m.unit.row=m.to.row;retreats.push({id:m.unit.id,from:m.from,to:m.to,displaced:!!m.displaced,enemyZoc:!!m.enemyZoc});}
 // A failed attacker cannot advance; any survivor can advance only if its
 // opponent's original hex is now empty. Advance orders end at that hex.
 const advanced=new Set();
 const tryAdvance=(unit,dest)=>{
  if(dead(unit)||!dest||advanced.has(unit.id)||moraleFailed.has(unit.id))return;
  if(distance(unit,dest)!==1)return;
  if(units.some(v=>v.id!==unit.id&&!dead(v)&&key(v)===key(dest)))return;
  if(terrainAt(dest.col,dest.row)==='Lake')return;
  const from={col:unit.col,row:unit.row};unit.col=dest.col;unit.row=dest.row;
  if(planner)planner.get(unit.id).length=0;
  unit.tis=0;retreats.push({id:unit.id,from,to:dest,advance:true});advanced.add(unit.id);
 };
 for(const b of dailyBattles){
  const a=byId.get(b.attacker),d=byId.get(b.defender);
  if(!a||!d)continue;
  if(moraleFailed.has(a.id))failedAttackers.push(a.id);
  if((moraleFailed.has(d.id)||dead(d))&&!moraleFailed.has(a.id))tryAdvance(a,b.meeting?(b.meetingTarget||b.defenderFrom):b.defenderFrom);
  // Defenders never advance into an attacking division's vacated hex.
 }
 // M5.76: Following all morale checks, simultaneous retreats, and permitted
 // attacker advances, every division involved in combat loses its plotted
 // orders and has both positive TI progress and negative TI debt reset to zero.
 // Apply to all participants, including supporters, not only primary units.
 for(const id of participants){
  const u=byId.get(id);
  if(!u)continue;
  if(planner)planner.get(id).length=0;
  u.tis=0;
 }
 dailyBattles.length=0;
 return {retreats,destroyed,failedRetreats,failedAttackers,checked:[...participants]};
}

global.ARMAGEDDON_COMBAT={resolve,endTurn,distance,reset,ATTACK:A,DEFENSE:D};
})(window);
