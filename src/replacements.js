(function(global){
  function axial(c,r){return {q:c-Math.floor(r/2),r};}
  function distance(a,b){const x=axial(a.col??a.c,a.row??a.r),y=axial(b.col??b.c,b.row??b.r);return Math.max(Math.abs(x.q-y.q),Math.abs(x.r-y.r),Math.abs(x.q+x.r-y.q-y.r));}
  function create(scenario,cities,renderer){
    const packets=[];let serial=0,lastDay=0;const history={};
    // Deterministic but concealed initiative for each city, independent of unit initiative.
    for(let i=0;i<cities.state.length;i++){const s=cities.state[i];if(!Number.isFinite(s.replacementInitiative))s.replacementInitiative=(Math.imul(i+1,2654435761)>>>0)/4294967296;}
    function updateCounts(){for(const d of scenario.divisions)d.replacementsOnWay=packets.filter(p=>p.targetId===d.id).reduce((n,p)=>n+p.soldiers,0);}
    function startDay(day){if(lastDay===day)return history[day]||{Blue:{created:0,received:0,lost:0},Red:{created:0,received:0,lost:0}};
      const activity={Blue:{created:0,received:0,lost:0},Red:{created:0,received:0,lost:0}};
      // Reassess every in-transit packet against current friendly replacement needs.
      // Allocate packets to the nearest division with an uncovered manpower deficit.
      // Reservations prevent several packets from overfilling the same division.
      const reserved=new Map();
      for(const p of [...packets].sort((a,b)=>a.id-b.id)){
        const candidates=scenario.divisions.filter(d=>d.side===p.side&&!d.destroyed&&d.strength>0)
          .sort((a,b)=>distance(p,a)-distance(p,b)||String(a.id).localeCompare(String(b.id)));
        let chosen=null;
        for(const d of candidates){
          const recordedLoss=Math.max(0,Number(d.totalCasualties)||0,Number(d.losses)||0,Number(d.casualties)||0);
          const replaced=Math.max(0,Number(d.totalReplacementsReceived)||0);
          const deficit=Math.max(0,Math.min(10000-d.strength,recordedLoss-replaced)-(reserved.get(d.id)||0));
          if(deficit>=p.soldiers){chosen=d;break;}
        }
        if(chosen){p.targetId=chosen.id;reserved.set(chosen.id,(reserved.get(chosen.id)||0)+p.soldiers);}
        else {p.targetId=null;}
      }
      // Existing packets move up to three hexes toward their reassigned target per day.
      for(let i=packets.length-1;i>=0;i--){const p=packets[i],target=scenario.divisions.find(d=>d.id===p.targetId&&!d.destroyed&&d.strength>0);if(!target){continue;}
        let steps=3;while(steps--&&distance(p,target)>3){let best=null,bestDist=distance(p,target);for(const n of neighbors(p.col,p.row,scenario)){const dd=distance(n,target);if(dd<bestDist){best=n;bestDist=dd;}}if(!best)break;p.col=best.col;p.row=best.row;}
        if(distance(p,target)<=3){const delivered=Math.min(p.soldiers,Math.max(0,10000-target.strength));const old=target.strength;target.strength+=delivered;target.totalReplacementsReceived=(target.totalReplacementsReceived||0)+delivered;target.experience=target.strength?((Number(target.experience)||75)*old+75*delivered)/target.strength:75;activity[p.side].received+=delivered;packets.splice(i,1);}
      }
      updateCounts();
      // Allocate each needy division to its nearest eligible friendly city.
      // Every city hex may dispatch at most 100 soldiers per day.
      const sources=cities.state.filter(s=>s.pacification===0&&activity[cities.owner(s)]);
      const rates=global.ARMAGEDDON_SETUP?.replacementRates||{Blue:100,Red:100};
      const capacity=new Map(sources.map(s=>[s,Math.max(0,Math.min(100,Number(rates[cities.owner(s)] ?? 100)))*Math.max(1,cities.cityHexCount(s))]));
      const needs=scenario.divisions.filter(d=>!d.destroyed&&d.strength>0)
        .map(d=>{const recorded=Math.max(0,Number(d.totalCasualties)||0,Number(d.losses)||0,Number(d.casualties)||0);
          const replaced=Math.max(0,Number(d.totalReplacementsReceived)||0);
          return {d,need:Math.max(0,Math.min(10000-d.strength,recorded-replaced)-(d.replacementsOnWay||0))};})
        .filter(x=>x.need>0).sort((a,b)=>String(a.d.id).localeCompare(String(b.d.id)));
      for(const {d,need} of needs){let remaining=need;
        const nearby=sources.filter(s=>cities.owner(s)===d.side)
          .sort((a,b)=>distance(a.city,d)-distance(b.city,d)||String(a.city.name).localeCompare(String(b.city.name)));
        for(const s of nearby){if(remaining<=0)break;const available=capacity.get(s)||0;if(!available)continue;
          const soldiers=Math.min(remaining,available);
          packets.push({id:++serial,side:d.side,city:s.city.name,sourceCol:s.city.c,sourceRow:s.city.r,col:s.city.c,row:s.city.r,targetId:d.id,soldiers,createdDay:day});
          d.replacementsOnWay=(d.replacementsOnWay||0)+soldiers;activity[d.side].created+=soldiers;
          capacity.set(s,available-soldiers);remaining-=soldiers;
        }
      }
      lastDay=day;history[day]=activity;renderer.render();return activity;
    }
    function neighbors(col,row,scenario){const a=axial(col,row),out=[];for(const [dq,dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]){const r=a.r+dr,c=a.q+dq+Math.floor(r/2);if(c>=0&&r>=0&&c<scenario.cols&&r<scenario.rows)out.push({col:c,row:r});}return out;}
    function removeDestroyed(){let lost={Blue:0,Red:0};for(let i=packets.length-1;i>=0;i--){const p=packets[i],d=scenario.divisions.find(d=>d.id===p.targetId);if(!d||d.destroyed||d.strength<=0){p.targetId=null;}}updateCounts();return lost;}
    function restore(saved){packets.splice(0,packets.length,...(saved?.packets||[]));serial=saved?.serial||Math.max(0,...packets.map(p=>p.id));lastDay=saved?.lastDay||0;Object.assign(history,saved?.history||{});if(saved?.cityInitiatives)saved.cityInitiatives.forEach((v,i)=>{if(cities.state[i])cities.state[i].replacementInitiative=v;});updateCounts();renderer.render();}
    function snapshot(){return {packets,serial,lastDay,history,cityInitiatives:cities.state.map(s=>s.replacementInitiative)};}
    return {packets,startDay,removeDestroyed,restore,snapshot,history,distance};
  }
  global.ARMAGEDDON_REPLACEMENTS={create};
})(window);
