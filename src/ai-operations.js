/* M5.95 AI operational planner. One plan per day; no mid-day re-planning.
   Uses only visible enemy units for threat/path/attack estimates. */
(function(global){
'use strict';
const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
const key=p=>p.col+','+p.row;
const distance=(a,b)=>{const x=global.ARMAGEDDON_HEX.axialFromOffset(a.col,a.row),y=global.ARMAGEDDON_HEX.axialFromOffset(b.col,b.row);return Math.max(Math.abs(x.q-y.q),Math.abs(x.r-y.r),Math.abs(x.q+x.r-y.q-y.r));};
const neighbors=(p,s)=>{const a=global.ARMAGEDDON_HEX.axialFromOffset(p.col,p.row);return dirs.map(([q,r])=>({col:a.q+q+Math.floor((a.r+r)/2),row:a.r+r})).filter(x=>x.col>=0&&x.row>=0&&x.col<s.cols&&x.row<s.rows);};
function findPath(unit,target,scenario,terrainAt,knownEnemies,occupiedFriendly,allowEnemyTarget){
 const start={col:unit.col,row:unit.row},startKey=key(start),targetKey=key(target);
 if(startKey===targetKey)return {path:[],cost:0};
 const blocked=new Set(knownEnemies.map(key));const dist=new Map([[startKey,0]]),previous=new Map(),pending=[{p:start,cost:0}];
 const maxNodes=scenario.cols*scenario.rows;
 let count=0;
 while(pending.length&&count++<maxNodes){
  pending.sort((a,b)=>a.cost-b.cost);const {p,cost:current}=pending.shift();if(current>dist.get(key(p))+1e-8)continue;
  if(key(p)===targetKey){const path=[];let k=targetKey;while(k!==startKey){const [col,row]=k.split(',').map(Number);path.push({col,row,pause:false});k=previous.get(k);if(!k)return null;}path.reverse();return {path,cost:current};}
  for(const n of neighbors(p,scenario)){
   const nk=key(n),final=nk===targetKey;
   if((blocked.has(nk)&&!(final&&allowEnemyTarget))||occupiedFriendly.has(nk))continue;
   // Do not route through known enemy zones of control except the final hex.
   if(!final&&knownEnemies.some(e=>distance(e,n)<=1))continue;
   const entry=global.ARMAGEDDON_MOVEMENT.cost(unit,terrainAt(n.col,n.row),p,n,terrainAt,final&&blocked.has(nk));
   if(!Number.isFinite(entry))continue;
   const total=current+entry;if(total+1e-8<(dist.get(nk)??Infinity)){dist.set(nk,total);previous.set(nk,key(p));pending.push({p:n,cost:total});}
  }
 }
 return null;
}
function estimate(unit,enemy,terrainAt){
 // Conservative surrogate until full combat calculator is exposed as a pure estimator.
 // This is NOT the combat engine's casualty prediction.
 const strength=Math.max(1,Number(unit.strength)||1),effect=Math.sqrt(Math.max(.25,Number(unit.effectiveness??100)/100));
 const supply=Math.max(.5,1+Math.min(0,Number(unit.supply??1))*.1);
 return strength*effect*supply;
}
function generate({scenario,terrainAt,strategic,visibleEnemyIds,cityStates}){
 const side=strategic.side,units=new Map(scenario.divisions.filter(d=>!d.destroyed&&d.strength>0).map(d=>[d.id,d]));
 const knownEnemies=[...units.values()].filter(d=>d.side!==side&&visibleEnemyIds.has(d.id));
 const friendlies=[...units.values()].filter(d=>d.side===side);
 const occupiedFriendly=new Set(friendlies.map(key));
 const cityByName=new Map(cityStates.map(s=>[s.city.name,s]));
 const assignments=strategic.assignments;
 const groups=new Map();for(const a of assignments){if(a.target&&a.mission==='City Capture'){if(!groups.has(a.target))groups.set(a.target,[]);groups.get(a.target).push(a);}}
 const plans=[],reserved=new Set(),plannedDestinations=new Set(),notes=[],diagnostics=[];
 const report=(u,mission,status,reason)=>diagnostics.push({id:u.id,name:u.name,mission,status,reason});
 const queue=(u,destination,mission,allowAttack=false)=>{
  if(!u||!destination||reserved.has(u.id))return false;
  if(plannedDestinations.has(key(destination))&&key(destination)!==key(u)){reserved.add(u.id);report(u,mission,'BLOCKED','Destination already assigned to another division');return false;}
  const result=findPath(u,destination,scenario,terrainAt,knownEnemies,occupiedFriendly,allowAttack);
  if(!result){notes.push(`${u.name}: no known legal route for ${mission}`);report(u,mission,'BLOCKED','No legal route through known obstacles');return false;}
  if(!result.path.length){reserved.add(u.id);report(u,mission,'HOLD','Already at assigned destination');return true;}
  reserved.add(u.id);plannedDestinations.add(key(destination));report(u,mission,'MOVE',`${result.path.length} hexes, ${result.cost.toFixed(1)} TI estimated`);plans.push({id:u.id,name:u.name,mission,destination:{col:destination.col,row:destination.row},path:result.path,estimatedTIs:result.cost});return true;
 };
 // Defended cities: stage all assigned divisions; do not send one into the defender prematurely.
 for(const [name,group] of groups){
  const city=cityByName.get(name)?.city;if(!city){report(u,a.mission,'BLOCKED','Assigned objective missing from city list');continue;}
  const target={col:city.c,row:city.r};const defenders=knownEnemies.filter(e=>distance(e,target)<=1);
  if(!defenders.length)continue;
  const attacking=group.map(a=>units.get(a.id)).filter(Boolean);
  const attackingPower=attacking.reduce((n,u)=>n+estimate(u,null,terrainAt),0);
  const defendingPower=defenders.reduce((n,u)=>n+estimate(u,null,terrainAt),0);
  const ratio=attackingPower/Math.max(1,defendingPower);
  const authorized=ratio>=1.5||strategic.capitalEmergency&&city.isCapital;
  const usedStaging=new Set();
  // Attack only when the whole group is already staged adjacent to the city.
  // Additional known enemy units in supporting range count against the ratio.
  const allStaged=attacking.length>0&&attacking.every(u=>distance(u,target)===1);
  if(authorized&&allStaged){
    const primary=attacking.filter(u=>!u.firedToday).sort((a,b)=>estimate(b,null,terrainAt)-estimate(a,null,terrainAt))[0];
    if(primary){
      queue(primary,target,'Coordinated attack: '+name,true);
      notes.push(`${name}: attack ordered by ${primary.name} (${ratio.toFixed(2)}:1 estimated strength)`);
    }
    for(const u of attacking){if(!reserved.has(u.id)){reserved.add(u.id);report(u,'Coordinated support: '+name,'HOLD','Staged to support primary attack');}}
    continue;
  }
  for(const u of attacking){
   const options=neighbors(target,scenario).filter(p=>!knownEnemies.some(e=>key(e)===key(p))&&!usedStaging.has(key(p))&&!plannedDestinations.has(key(p))&&(!occupiedFriendly.has(key(p))||key(p)===key(u))).map(p=>({p,path:findPath(u,p,scenario,terrainAt,knownEnemies,occupiedFriendly,false)})).filter(x=>x.path).sort((a,b)=>a.path.cost-b.path.cost);
   const best=options[0];if(best){usedStaging.add(key(best.p));queue(u,best.p,'Concentrate: '+name);}else{reserved.add(u.id);report(u,'Concentrate: '+name,'BLOCKED','No reachable empty staging hex');}
  }
  // The next day's plan may authorize the attack after concentration. Do not
  // prematurely append a combat destination to every division's staging route.
  notes.push(`${name}: staging ${attacking.length} division(s), estimated power ${ratio.toFixed(2)}:1; ${authorized?'threshold met':'reinforcements needed'}. Attack awaits assembled positions.`);
 }
 for(const a of assignments){const u=units.get(a.id);if(!u||reserved.has(a.id))continue;
  const city=cityByName.get(a.target)?.city;
  if(a.mission==='Mobile Reserve'){report(u,a.mission,'HOLD','Preserve 20% mobile reserve');continue;}
  if(a.mission==='Territorial Security'){
   // Give uncommitted divisions an actual territorial objective, rather than
   // parking every unassigned division indefinitely. Avoid duplicating targets.
   const candidates=cityStates.filter(cs=>cs.owner!==side&&cs.occupier!==side)
    .map(cs=>({city:cs.city,dist:distance(u,{col:cs.city.c,row:cs.city.r})}))
    .sort((x,y)=>x.dist-y.dist);
   let assigned=false;
   for(const c of candidates){const target={col:c.city.c,row:c.city.r};
    if(plannedDestinations.has(key(target)))continue;
    const enemy=knownEnemies.find(e=>key(e)===key(target));
    if(enemy)continue; // Do not bypass the coordinated attack threshold.
    if(occupiedFriendly.has(key(target)))continue;
    const path=findPath(u,target,scenario,terrainAt,knownEnemies,occupiedFriendly,false);
    if(path&&path.path.length&&queue(u,target,'Territorial advance: '+c.city.name)){assigned=true;break;}
   }
   if(!assigned&&!diagnostics.some(d=>d.id===u.id))report(u,a.mission,'HOLD','No reachable unclaimed city objective');
   continue;
  }
  if(!city){report(u,a.mission,'BLOCKED','Assigned objective missing from city list');continue;}
  const target={col:city.c,row:city.r};
  const occupant=[...units.values()].find(d=>key(d)===key(target)&&d.side!==side);
  if(occupant&&!visibleEnemyIds.has(occupant.id)){
   // Hidden enemy occupancy must not be consulted by the AI; collision handled by engine.
  }
  const knownDefender=knownEnemies.find(d=>key(d)===key(target));
  if(knownDefender){
   const options=neighbors(target,scenario).filter(p=>!knownEnemies.some(e=>key(e)===key(p))&&(!occupiedFriendly.has(key(p))||key(p)===key(u))).map(p=>({p,path:findPath(u,p,scenario,terrainAt,knownEnemies,occupiedFriendly,false)})).filter(x=>x.path).sort((a,b)=>a.path.cost-b.path.cost);
   if(options.length)queue(u,options[0].p,'Hold near '+city.name);
   continue;
  }
  // Friendly occupied objectives cannot be entered: guard from a neighboring hex.
  // Pacification needs the occupying unit to remain in place.
  if(a.mission==='City Pacification'&&key(u)===key(target)){
   reserved.add(u.id);report(u,a.mission,'HOLD','Remain in city to pacify');continue;
  }
  const friendlyOccupant=friendlies.find(f=>f.id!==u.id&&key(f)===key(target));
  if(a.mission==='City Defense'||a.mission==='Capital Defense'){
   if(distance(u,target)<=1){reserved.add(u.id);report(u,a.mission,'HOLD','Already guarding objective');continue;}
  }
  if(friendlyOccupant){
   const options=neighbors(target,scenario).filter(p=>!occupiedFriendly.has(key(p))&&!plannedDestinations.has(key(p))&&!knownEnemies.some(e=>key(e)===key(p)))
    .map(p=>({p,route:findPath(u,p,scenario,terrainAt,knownEnemies,occupiedFriendly,false)}))
    .filter(x=>x.route).sort((a,b)=>a.route.cost-b.route.cost);
   if(options.length){queue(u,options[0].p,a.mission+' (adjacent to '+city.name+')');}
   else {reserved.add(u.id);report(u,a.mission,'HOLD','Objective occupied by friendly division; no open staging hex');}
   continue;
  }
  queue(u,target,a.mission,false);
 }
 for(const u of friendlies)if(!diagnostics.some(d=>d.id===u.id))report(u,assignments.find(a=>a.id===u.id)?.mission||'Unassigned','HOLD','No executable movement assignment');
 return {side,plans,notes,diagnostics,visibleEnemies:knownEnemies.length,attackThreshold:1.5,ordersIssued:0,summary:{move:diagnostics.filter(d=>d.status==='MOVE').length,hold:diagnostics.filter(d=>d.status==='HOLD').length,blocked:diagnostics.filter(d=>d.status==='BLOCKED').length}};
}
function apply(operations,planner){
 let issued=0;for(const order of operations.plans){
  if(!order.path.length)continue;
  // Directly set a validated AI-generated path; RoutePlanner UI permission
  // is intentionally not changed to expose Red units to the human player.
  planner.routes.set(order.id,order.path.map(p=>({...p})));
  const d=planner.scenario.divisions.find(x=>x.id===order.id);if(d)d.stance='Move';
  issued++;
 }
 operations.ordersIssued=issued;return issued;
}
global.ARMAGEDDON_AI_OPERATIONS={generate,apply,findPath};
})(window);
