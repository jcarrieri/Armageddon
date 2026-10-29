/* ARMAGEDDON M3.75 combat: persistent three-TI battles, simultaneous fire,
   terrain/type odds, effectiveness, improved positions, morale and retreats. */
(function(global){'use strict';
const Z=()=>global.ARMAGEDDON_ZOC;
const TYPES=['Infantry','Motorized','Mechanized','Armored'];
const A={Plains:[1,1.1,1.2,1.3],Forest:[.7,.7,.7,.7],Hills:[.7,.7,.7,.7],Swamp:[.9,.8,.7,.7],Mountains:[.9,.8,.7,.7],Urban:[1.5,1.3,1.2,1.1]};
const D={Plains:[1,1.1,1.2,1.3],Forest:[1,1,1,1],Hills:[1,1,1,1],Swamp:[1.1,1.1,1.1,1.1],Mountains:[1.1,1.1,1.1,1.1],Urban:[1.5,1.3,1.2,1.1]};
const key=d=>`${d.col},${d.row}`;
const rnd=()=>1; // M3.78: deterministic combat testing; random damage multiplier disabled.
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const terrain=(matrix,name,type)=> (matrix[name]||matrix.Plains)[Math.max(0,TYPES.indexOf(type))];
function distance(a,b){const x=global.ARMAGEDDON_HEX.axialFromOffset(a.col,a.row),y=global.ARMAGEDDON_HEX.axialFromOffset(b.col,b.row);return Math.max(Math.abs(x.q-y.q),Math.abs(x.r-y.r),Math.abs(x.q+x.r-y.q-y.r));}
const battles=new Map();
const completedOrders=new Map();
const dead=d=>!d||d.destroyed||d.strength<=0;
function reset(){battles.clear();completedOrders.clear();}
function resolve(scenario,terrainAt,day,ti,attackOrders=[],planner=null,movementEvents=[],movementAttempts=[]){
 const units=scenario.divisions, byId=new Map(units.map(d=>[d.id,d]));
 // Supply status is assessed once at the start of each day in app.js.
 // No hourly supply or efficiency regeneration/consumption.
 const attempted=new Set(movementAttempts);
 // Starting an attack immediately removes the attacker's prepared position.
 // Active attackers do not rebuild IP while combat continues.
 const startingAttackers=new Set(attackOrders.map(o=>o.attacker));
 const ongoingAttackers=new Set([...battles.values()].map(b=>b.a));
 for(const id of startingAttackers){const attacker=byId.get(id);if(attacker&&!dead(attacker))attacker.ip=0;}
 for(const u of units){if(!dead(u)){u.efficiency=clamp(Number.isFinite(u.efficiency)?u.efficiency:100,30,100);u.supply=clamp(Number.isFinite(u.supply)?u.supply:1,-9,1);}}
 for(const d of units){
  if(dead(d))continue;
  d.effectiveness=clamp(Number.isFinite(d.effectiveness)?d.effectiveness:100,25,100);
  d.ip=clamp(Number.isFinite(d.ip)?d.ip:0,0,30);
  if(attempted.has(d.id)||startingAttackers.has(d.id)||ongoingAttackers.has(d.id))continue;
  // Stationary units prepare regardless of pending orders or combat activity.
  d.ip=Math.min(30,d.ip+2.0);
 }
 // Clear completed-order guards once a unit changes or cancels its route.
 if(planner)for(const [id,signature] of completedOrders){const u=byId.get(id),next=planner.get(id)[0];if(!u||!next||`${u.col},${u.row}>${next.col},${next.row}`!==signature)completedOrders.delete(id);}
 // Each funded enemy-hex entry authorizes one combat increment.
 // No automatic firing in later hours: a failed attacker must pay entry cost again.
 for(const order of attackOrders){
  const a=byId.get(order.attacker),d=byId.get(order.defender);
  if(dead(a)||dead(d)||a.side===d.side||distance(a,d)!==1)continue;
  const id=a.id+'>'+d.id;
  const signature=`${a.col},${a.row}>${d.col},${d.row}`;
  if(completedOrders.get(a.id)===signature)continue;
  if(!battles.has(id)){battles.set(id,{a:a.id,d:d.id,remaining:1,target:{col:d.col,row:d.row},started:day+':'+ti});}
 }
 const active=[...battles.entries()].filter(([id,b])=>{
  const a=byId.get(b.a),d=byId.get(b.d);
  if(dead(a)||dead(d)||distance(a,d)!==1){battles.delete(id);return false;}return true;
 });
 const primary=new Set(active.flatMap(([,b])=>[b.a,b.d]));
 // One unit can participate in several battles but cannot commit more than its manpower.
 const engagementsByUnit=new Map();
 for(const [id,b] of active)for(const unit of [b.a,b.d]){if(!engagementsByUnit.has(unit))engagementsByUnit.set(unit,[]);engagementsByUnit.get(unit).push(id);}
 const supporters=new Map();
 for(const u of units){
  if(dead(u)||primary.has(u.id)||Number(u.tis||0)<1||u.stance==='Withdraw')continue;
  const eligible=active.filter(([id,b])=>{
   const ally=byId.get(b.a),def=byId.get(b.d);
   return (u.side===ally.side&&distance(u,def)===1)||(u.side===def.side&&distance(u,ally)===1);
  }).map(([id])=>id);
  if(eligible.length){const permitted=eligible.filter(id=>!battles.get(id)?.excludedSupporters?.has(u.id));if(permitted.length){supporters.set(u.id,permitted);}}
 }
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
  const E1=source.effectiveness,E2=target.effectiveness;
  const mod=terrain(isAttacker?A:D,terrainAt(isAttacker?target.col:source.col,isAttacker?target.row:source.row),source.type);
  const matchup=1+(TYPES.indexOf(source.type)-TYPES.indexOf(target.type))*.1;
  const ip=targetIsDefending(target) ? 1-clamp(target.ip,0,30)/100 : 1; // Only primary defenders receive IP protection against attacking fire.
  const efficiency=clamp(source.efficiency,30,100)/100;
  const supply=Math.max(.5,1+Math.min(0,source.supply)*.1);
  // Water combat penalties apply only to attacking fire across the shared hex edge.
  // A road crossing that bridges either water type uses the 85% modifier.
  const crossing=[key(source),key(target)].sort().join('|');
  const river=Boolean(global.ARMAGEDDON_RIVER_KEYS?.has(crossing));
  const stream=Boolean(global.ARMAGEDDON_STREAM_KEYS?.has(crossing));
  const bridge=Boolean(global.ARMAGEDDON_ROAD_KEYS?.has(crossing));
  const waterModifier=!isAttacker?1:(river||stream)?(bridge?.85:river?.40:.70):1;
  const random=1; // deterministic casualty testing remains enabled.
  const effectivenessFactor=1+0.30*(Math.sqrt(E1/E2)-1);
  const finalRating=effectivenessFactor*efficiency*supply*mod*matchup*ip*waterModifier*random*(targetIsDefending(target)?0.70:1);
  const damage=.05*share*finalRating;
  const detail={unit:source.id,target:target.id,role:isAttacker?'Attacker':'Defender',strength:source.strength,committed:share,
    effectiveness:E1,opponentEffectiveness:E2,effectivenessFactor,efficiency,supply,terrain:mod,
    terrainName:terrainAt(isAttacker?target.col:source.col,isAttacker?target.row:source.row),
    matchup,improvedPosition:ip,defenderProtection:targetIsDefending(target)?.70:1,waterModifier,waterCrossing:river?'River':stream?'Stream':'None',bridge:bridge&&(river||stream),random,finalRating,damage};
  if(!fireDetails.has(source.id+'>'+target.id))fireDetails.set(source.id+'>'+target.id,[]);
  fireDetails.get(source.id+'>'+target.id).push(detail);
  add(incoming,target.id,damage);add(outgoing,source.id,damage);
  return damage;
 }
 // Resolve one simultaneous adjacency volley for the entire hour. Each participating
 // division commits its full pre-casualty strength, divided equally among all
 // adjacent enemy divisions (not merely enemies named in individual battles).
 const participants=new Set([...primary,...supporters.keys()]);
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
  const targets=units.filter(target=>!dead(target)&&target.side!==source.side&&distance(source,target)===1);
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
   blueLoss:0,redLoss:0,at:{col:d.col,row:d.row},attacker:a.id,defender:d.id,battleId:id,increment:1,
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
 // Effectiveness adjustments occur once per consolidated hourly volley.
 // Casualty adjustment: -0.006 percentage points per soldier lost,
 // +0.003 percentage points per credited enemy casualty (not 10x those rates).
 // Use the same exact per-source credits for effectiveness and efficiency.
 // This prevents the casualty and damage accounting systems from diverging.
 for(const u of units){if(u.destroyed)continue;u.effectiveness=clamp(u.effectiveness+.01*(credited.get(u.id)||0)-.02*(actual.get(u.id)||0),25,100);}
 for(const e of engagements){const a=byId.get(e.attacker),d=byId.get(e.defender);
  e.blueLoss=units.filter(u=>u.side==='Blue').reduce((n,u)=>n+(actual.get(u.id)||0),0);
  e.redLoss=units.filter(u=>u.side==='Red').reduce((n,u)=>n+(actual.get(u.id)||0),0);
 }
 // Casualty-based efficiency: each credited enemy casualty +0.01,
 // each friendly casualty -0.02. End-of-day +1 is handled by app.js.
 for(const u of units){
  u.efficiency=clamp((Number.isFinite(u.efficiency)?u.efficiency:100)+.005*(credited.get(u.id)||0)-.001*(actual.get(u.id)||0),30,100);
 }
 const retreats=[],failedRetreats=[],failedAttackers=[];
 const zoc=Z().compute(scenario);
 const moraleFailed=new Set();
 for(const id of new Set([...primary,...supporters.keys()])){const u=byId.get(id);if(!dead(u)&&Math.random()<Math.max(0,80-u.effectiveness)/100)moraleFailed.add(id);}
 function applyExtra(u,amount){const n=Math.min(u.strength,Math.max(0,Math.round(amount)));u.strength-=n;u.totalCasualties+=n;u.effectiveness=clamp(u.effectiveness-.02*n,25,100);u.efficiency=clamp(u.efficiency-.001*n,30,100);actual.set(u.id,(actual.get(u.id)||0)+n);if(u.strength<=0&&!u.destroyed){u.destroyed=true;destroyed.push({id:u.id,side:u.side,col:u.col,row:u.row,day,ti});}return n;}
 function surrender(u){if(dead(u))return;u.destroyed=true;destroyed.push({id:u.id,side:u.side,col:u.col,row:u.row,day,ti,surrender:true});if(planner)planner.get(u.id).length=0;}
 function moraleCheck(u){if(dead(u))return;if(u.failedMorale){surrender(u);return;}if(Math.random()<Math.max(0,80-u.effectiveness)/100){u.failedMorale=true;surrender(u);}}
 function retreatPenalty(u){failedRetreats.push(u.id);applyExtra(u,actual.get(u.id)||0);moraleCheck(u);}
 function retreat(u){
  const enemyZoc=zoc[Z().enemySide(u.side)];
  const occupied=new Map(units.filter(v=>!dead(v)).map(v=>[key(v),v]));
  const cityStates=global.ARMAGEDDON_CITY_STATE||[];
  const cityAt=n=>cityStates.find(c=>c.city&&distance({col:c.city.c,row:c.city.r},n)<3&&terrainAt(n.col,n.row)==='Urban');
  const pacifying=n=>{const c=cityAt(n);return !!c&&c.pacification>0;};
  const friendlyCities=cityStates.filter(c=>c.pacification===0&&c.owner===u.side).map(c=>({col:c.city.c,row:c.city.r}));
  const nearest=n=>friendlyCities.length?Math.min(...friendlyCities.map(c=>distance(c,n))):Infinity;
  const legal=n=>!['Lake'].includes(terrainAt(n.col,n.row))&&!pacifying(n);
  const options=[];
  for(const n of Z().neighbors(u,scenario)){
   if(!legal(n))continue;
   const occupant=occupied.get(key(n));if(occupant&&occupant.side!==u.side)continue;
   const zone=enemyZoc.has(key(n));let displaced=null;
   if(occupant){if(zone)continue;
    const empties=Z().neighbors(occupant,scenario).filter(x=>!occupied.has(key(x))&&!enemyZoc.has(key(x))&&legal(x)&&key(x)!==key(u));
    if(!empties.length)continue;
    empties.sort((a,b)=>nearest(a)-nearest(b)||Math.random()-.5);
    displaced={unit:occupant,to:empties[0]};
   }
   options.push({n,priority:zone?2:occupant?1:0,zone,displaced,cityDistance:nearest(n),tie:Math.random()});
  }
  options.sort((a,b)=>a.priority-b.priority||a.cityDistance-b.cityDistance||a.tie-b.tie);
  const chosen=options[0];
  if(!chosen){retreatPenalty(u);if(planner)planner.get(u.id).length=0;u.tis=0;return false;}
  const from={col:u.col,row:u.row};
  if(chosen.displaced){const v=chosen.displaced.unit,to=chosen.displaced.to;
   const c=global.ARMAGEDDON_MOVEMENT.cost(v,terrainAt(to.col,to.row),v,to,terrainAt);
   const vf={col:v.col,row:v.row};v.col=to.col;v.row=to.row;v.tis=(v.tis||0)-c;
   retreats.push({id:v.id,from:vf,displaced:true,to});
  }
  const cost=global.ARMAGEDDON_MOVEMENT.cost(u,terrainAt(chosen.n.col,chosen.n.row),u,chosen.n,terrainAt);
  u.col=chosen.n.col;u.row=chosen.n.row;u.tis=(u.tis||0)-cost;
  if(chosen.zone)retreatPenalty(u);
  if(planner)planner.get(u.id).length=0;
  retreats.push({id:u.id,from,to:chosen.n,enemyZoc:chosen.zone});return true;
 }

 for(const [id,b] of active){const a=byId.get(b.a),d=byId.get(b.d);
  if(dead(a)||dead(d)){
   battles.delete(id);
   if(!dead(a)&&dead(d)&&planner){
    const next=planner.get(a.id)[0];
    if(next&&next.col===b.target.col&&next.row===b.target.row&&!units.some(u=>u.id!==a.id&&!dead(u)&&u.col===next.col&&u.row===next.row)){
     a.col=next.col;a.row=next.row;planner.get(a.id).shift();
    }
   }
   continue;
  }
  if(moraleFailed.has(a.id)){if(a.failedMorale){surrender(a);battles.delete(id);continue;}a.failedMorale=true;if(planner)planner.get(a.id).length=0;failedAttackers.push(a.id);battles.delete(id);completedOrders.set(a.id,`${a.col},${a.row}>${d.col},${d.row}`);continue;}
  if(moraleFailed.has(d.id)){
   if(d.failedMorale){surrender(d);battles.delete(id);continue;}d.failedMorale=true;retreat(d);battles.delete(id);
   if(!dead(a)&&planner){
    const next=planner.get(a.id)[0];
    if(next&&next.col===b.target.col&&next.row===b.target.row&&!units.some(u=>u.id!==a.id&&!dead(u)&&u.col===next.col&&u.row===next.row)){
     a.col=next.col;a.row=next.row;planner.get(a.id).shift();
    }
   }
   continue;
  }
  if(b.remaining<=0){
   if((a.stance||'Hold')!=='Assault'){if(planner)planner.get(a.id).length=0;a.tis=0;completedOrders.set(a.id,`${a.col},${a.row}>${d.col},${d.row}`);}
   // A held defender ends this attack attempt, not the plotted movement order.
   // The next attempt requires a newly funded movement entry cost.
   battles.delete(id);
  }
 }
 // Any Hold-status unit that participated in combat loses its orders and
 // accumulated movement TIs, whether attacker, defender, or supporting unit.
 if(planner&&active.length){
  for(const id of participants){const unit=byId.get(id);
   if(unit&&!dead(unit)&&(unit.stance||'Hold')==='Hold'){
    planner.get(id).length=0;unit.tis=0;
   }
  }
 }
 // Supporters that fail morale withdraw support on subsequent combat increments.
 for(const id of moraleFailed)if(supporters.has(id)){
  for(const [bid,b] of battles) {if(!b.excludedSupporters)b.excludedSupporters=new Set();b.excludedSupporters.add(id);}
 }
 // M4.87: Each division pays 3 TIs once per hourly firing volley, regardless
 // of the number of targets or battles. Charge after Hold-order cancellation
 // so that the combat cost remains visible even when Hold resets movement TIs.
 for(const id of firingUnits){
  const unit=byId.get(id);
  if(!unit)continue;
  unit.tis=Number(unit.tis||0)-3;
  unit._dayTISpent=Number(unit._dayTISpent||0)+3;
 }
 // M4.94: Hold divisions can occupy the vacated defender hex before their
 // orders are canceled; after combat their available movement TIs are zero.
 for(const id of participants){const unit=byId.get(id);if(unit&&!dead(unit)&&(unit.stance||'Hold')==='Hold'){if(planner)planner.get(id).length=0;unit.tis=0;}}
 return {damageByUnit,firingUnits:[...firingUnits],engagements,destroyed,retreats,failedRetreats,failedAttackers,activeBattles:battles.size};
}
global.ARMAGEDDON_COMBAT={resolve,distance,reset,ATTACK:A,DEFENSE:D};
})(window);
