/* M5.93 Strategic AI stage A/B: advisory objective scoring and mission assignment.
   Deliberately does not issue movement orders or access hidden enemy divisions. */
(function(global){
 'use strict';
 const dist=(a,b)=>{const aq=a.col-Math.floor(a.row/2),bq=b.col-Math.floor(b.row/2),dr=a.row-b.row,dq=aq-bq;return (Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2;};
 const pos=c=>({col:c.c,row:c.r});
 const live=u=>!u.destroyed&&Number(u.strength)>0;
 const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
 function plan({scenario,cityStates,side,visibleEnemyIds}){
  if(!['Blue','Red'].includes(side))throw Error('Invalid AI side');
  const friendly=scenario.divisions.filter(u=>live(u)&&u.side===side);
  const enemy=scenario.divisions.filter(u=>live(u)&&u.side!==side&&visibleEnemyIds.has(u.id));
  const cities=cityStates.map(s=>({name:s.city.name,col:s.city.c,row:s.city.r,size:s.city.size||1,isCapital:!!s.city.isCapital,owner:s.owner,occupier:s.occupier,pacification:s.pacification||0}));
  const capital=cities.find(c=>c.isCapital&&c.owner===side);
  const enemyCapital=cities.find(c=>c.isCapital&&c.owner!==side);
  const closest=(p,units)=>units.length?Math.min(...units.map(u=>dist(p,u))):Infinity;
  const capitalThreat=capital?closest(pos(capital),enemy):Infinity;
  const capitalEmergency=!!capital&&(capital.occupier&&capital.occupier!==side||capitalThreat<=1);
  const reserveTarget=Math.round(friendly.length*.20);
  const objectives=[];
  if(capital){objectives.push({type:'Capital Defense',city:capital,score:capitalEmergency?100:capitalThreat<=3?92:capitalThreat<=5?76:48,required:capitalEmergency?Math.max(2,Math.ceil(enemy.filter(u=>dist(pos(capital),u)<=3).length*1.5)):capitalThreat<=5?2:1});}
  for(const city of cities){
   if(city===capital)continue;
   const travel=closest(pos(city),friendly);
   if(!Number.isFinite(travel))continue;
   const knownDefenders=enemy.filter(u=>dist(pos(city),u)<=1).length;
   const importance=city.isCapital?30:city.size>=3?26:city.size===2?20:13;
   const urgency=city.owner===side?Math.max(0,22-closest(pos(city),enemy)*4):city.occupier===side?20:8;
   const benefit=clamp((city.size||1)*5+(city.owner!==side?3:0),0,20);
   const access=clamp(15-travel*1.5,0,15);
   const success=clamp(10-knownDefenders*3,0,10);
   const score=clamp(Math.round(importance+urgency+benefit+access+success),0,100);
   const type=city.owner===side?'City Defense':city.occupier===side?'City Pacification':'City Capture';
   objectives.push({type,city,score,required:knownDefenders?Math.max(2,Math.ceil(knownDefenders*1.5)):1,knownDefenders});
  }
  objectives.sort((a,b)=>b.score-a.score||a.city.name.localeCompare(b.city.name));
  const available=new Map(friendly.map(u=>[u.id,u]));
  const assignments=[];
  const assign=(unit,mission,target,score)=>{available.delete(unit.id);assignments.push({id:unit.id,name:unit.name,mission,target:target?.name||null,score});};
  const choose=target=>[...available.values()].sort((a,b)=>dist(a,pos(target))-dist(b,pos(target))||(Number(b.effectiveness)||0)-(Number(a.effectiveness)||0))[0];
  // Protect capital first, then establish a 20% reserve, then distribute remaining divisions.
  if(capital){const obj=objectives.find(o=>o.type==='Capital Defense');for(let i=0;i<Math.min(obj.required,available.size);i++){const u=choose(capital);if(u)assign(u,'Capital Defense',capital,obj.score);}}
  if(!capitalEmergency){
   const reserveCount=Math.min(reserveTarget,available.size);
   const center=capital||friendly[0];
   for(let i=0;i<reserveCount;i++){
    const u=[...available.values()].sort((a,b)=>dist(a,center)-dist(b,center))[0];
    if(u)assign(u,'Mobile Reserve',capital,0);
   }
  }
  for(const obj of objectives){
   if(obj.type==='Capital Defense')continue;
   if(capitalEmergency&&obj.type!=='City Defense')continue;
   // Cautious does not mean garrisoning every peaceful city. Only assign
   // defensive missions to cities with a visible nearby threat.
   if(obj.type==='City Defense' && !enemy.some(u=>dist(u,pos(obj.city))<=4))continue;
   if(obj.score<40)continue;
   for(let i=0;i<obj.required&&available.size;i++){const u=choose(obj.city);if(u)assign(u,obj.type,obj.city,obj.score);}
  }
  for(const u of available.values())assign(u,capitalEmergency?'Capital Defense':'Territorial Security',capital,0);
  return {side,policy:'Cautious',reserveTarget,capitalEmergency,capitalThreat:Number.isFinite(capitalThreat)?capitalThreat:null,objectives,assignments,visibleEnemies:enemy.length,dayPlanOnly:true,ordersIssued:0};
 }
 global.ARMAGEDDON_STRATEGIC_AI={plan};
})(window);
