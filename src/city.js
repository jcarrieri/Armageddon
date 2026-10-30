(function(global){
  // Approved production costs in RP and production times in turns.
  const specs={Infantry:{cost:6,turns:3},Motorized:{cost:8,turns:4},Mechanized:{cost:10,turns:5},Armored:{cost:12,turns:6}};
  function create(scenario,terrainAt,renderer){
    const cities=global.ARMAGEDDON_CITIES||[];
    const treasury={Blue:Number(global.ARMAGEDDON_SETUP?.handicap?.Blue?.rp)||0,Red:Number(global.ARMAGEDDON_SETUP?.handicap?.Red?.rp)||0};
    const reserves={Blue:[],Red:[]};let deployment=null;let serial=0;
    const onChange=()=>{const blue=document.getElementById("rpBlueTotal"),red=document.getElementById("rpRedTotal"),count=document.getElementById("reinforcementCount");if(blue)blue.textContent=treasury.Blue.toFixed(1);if(red)red.textContent=treasury.Red.toFixed(1);if(count)count.textContent=String(reserves.Blue.length+reserves.Red.length);};
    const state=cities.map(c=>({city:c,pacification:Math.max(0,Number(c.pacification)||0),production:null,owner:c.side,occupier:null}));
    const panel=document.getElementById('cityPanel'),body=document.getElementById('cityBody'),title=document.getElementById('cityTitle');
    let active=null;
    // City sovereignty is independent of military hex control.
    const owner=s=>s.owner;
    // A city is occupied when the opposing side militarily controls its city-center
    // hex, even if the occupying division stands in an adjacent hex. The map
    // control overlay and city pacification must use the same control source.
    const occupation=s=>{
      const control=renderer.controlAt(s.city.c,s.city.r);
      return control==='Blue'||control==='Red'?control:null;
    };
    function updateOccupation(){
      for(const s of state){
        const occupying=occupation(s);
        if(occupying===s.owner){s.occupier=null;s.pacification=0;continue;}
        if(occupying!==s.occupier){s.occupier=occupying;s.pacification=0;}
        // Occupation begins immediately, but pacification advances only at day end.
        if(occupying&&s.production){s.production=null;}
      }
    }
    function advancePacification(){
      // Refresh territorial control after all moves and combat have resolved.
      renderer.refreshHexControl();
      updateOccupation();
      for(const s of state){
        if(!s.occupier||s.occupier===s.owner)continue;
        s.pacification++;
        if(s.pacification>=5){s.owner=s.occupier;s.city.side=s.owner;s.occupier=null;s.pacification=0;}
      }
      render();renderer.render();
    }
    const cityForHex=(col,row)=>{
      if(terrainAt(col,row)!=='Urban')return null;
      let found=null,dist=Infinity;
      for(const s of state){const c=s.city;const d=Math.hypot(c.c-col,c.r-row);if(d<dist){dist=d;found=s;}}
      return found&&dist<3?found:null;
    };
    function cityHexCount(s){
      // Count urban cells belonging to the nearest city center, rather than a city's center alone.
      let n=0;for(let row=0;row<scenario.rows;row++)for(let col=0;col<scenario.cols;col++)if(cityForHex(col,row)===s)n++;
      return n;
    }
    const canManage=s=>!global.ARMAGEDDON_M3?.executing && (global.ARMAGEDDON_PLAYER_SIDE===owner(s)||global.ARMAGEDDON_VIEW_MODE==='Both');
    const showEnemyProduction=s=>owner(s)===global.ARMAGEDDON_PLAYER_SIDE || global.ARMAGEDDON_VIEW_MODE==='Both';
    function el(tag,content){const e=document.createElement(tag);if(content!==undefined)e.textContent=content;return e;}
    function line(k,v){const d=el('div');d.style.cssText='display:flex;justify-content:space-between;gap:12px;margin:9px 0';const a=el('span',k),b=el('strong',v);d.append(a,b);body.append(d);}
    function button(label,fn){const b=el('button',label);b.style.cssText='display:block;width:100%;margin:7px 0;padding:9px;border:1px solid #9bb0c3;border-radius:6px;background:#294b61;color:#fff;cursor:pointer;text-align:center;box-sizing:border-box';b.onclick=fn;body.append(b);}
    function render(){onChange();if(!active||panel.hidden)return;const s=active,side=owner(s);title.textContent=s.city.name+(s.city.isCapital?' ★':'');body.replaceChildren();line('Controlled by',side);line('Pacification',s.occupier?`${s.pacification}/5 (${s.occupier} controlling)`:'None');if(canManage(s)&&!s.occupier)line('Resource Points (RP)',treasury[side].toFixed(1));line('City hexes',String(cityHexCount(s)));
      if(!showEnemyProduction(s)){line('Production','Unknown');}
      else if(s.production){if(canManage(s)){const prod=s.production;const b=el('button',prod.type+' division · '+prod.remaining+' turn'+(prod.remaining===1?'':'s')+' remaining — Cancel?');b.style.cssText='display:flex;align-items:center;justify-content:center;min-height:52px;width:100%;margin:12px 0 0;padding:10px;border:1px solid #e8b66a;border-radius:7px;background:#ed951c;color:#17202a;font-weight:700;cursor:pointer;text-align:center;box-sizing:border-box';b.onclick=()=>{if(!window.confirm('Cancel '+prod.type+' production and refund '+prod.cost+' RP?'))return;treasury[side]+=prod.cost;s.production=null;render();renderer.render();};body.append(b);}else{line('Producing',s.production.type+' division');line('Turns remaining',String(s.production.remaining));}}
      else if(canManage(s)&&!s.occupier&&s.pacification===0){const types=Object.entries(specs).filter(([t,v])=>treasury[side]>=v.cost);if(types.length){body.append(el('p','Available for production:'));for(const [type,v] of types)button(type+' — '+v.cost+' RP · '+v.turns+' turns',()=>{if(treasury[side]<v.cost)return;treasury[side]-=v.cost;s.production={type,cost:v.cost,remaining:v.turns,side};render();renderer.render();});}else body.append(el('p','Insufficient RP for any division type.'));}
      else if(s.occupier||s.pacification>0)body.append(el('p','City under pacification — production unavailable.'));
      else body.append(el('p','Production controls are available to the controlling player during planning.'));
    }
    function open(s){active=s;panel.hidden=false;render();}
    function close(){panel.hidden=true;active=null;}
    document.getElementById('cityClose').onclick=close;
    // RP upkeep per surviving division per day, charged before planning.
    // RP per soldier per game day; maintenance scales with actual manpower.
    const maintenanceRates={Infantry:0.000028,Motorized:0.000042,Mechanized:0.000056,Armored:0.000070};
    let lastMaintenance=null;
    function calculateMaintenance(){
      const totals={Blue:0,Red:0};
      for(const d of scenario.divisions){
        if(d.destroyed||d.strength<=0)continue;
        if(totals[d.side]!==undefined)totals[d.side]+=(maintenanceRates[d.type]||0)*d.strength;
      }
      // Divisions under production pay in proportion to completed turns.
      for(const s of state){
        const p=s.production;if(!p)continue;
        const spec=specs[p.type];if(!spec||totals[p.side]===undefined)continue;
        const elapsed=Math.max(0,Math.min(spec.turns,spec.turns-p.remaining));
        totals[p.side]+=(maintenanceRates[p.type]||0)*10000*elapsed/spec.turns;
      }
      return totals;
    }
    function chargeMaintenance(day){
      if(lastMaintenance&&lastMaintenance.day===day)return lastMaintenance;
      const totals=calculateMaintenance();
      for(const side of ['Blue','Red'])treasury[side]=Math.max(0,Math.round((treasury[side]-totals[side])*100)/100);
      lastMaintenance={day,totals};onChange();render();return lastMaintenance;
    }
    function awardTurn(){renderer.refreshHexControl();updateOccupation();for(const s of state){if(s.occupier||s.pacification>0)continue;const side=owner(s);if(side==='Blue'||side==='Red')treasury[side]+=cityHexCount(s);}onChange();render();}
    // Completed production deploys immediately: city, random adjacent, random open map hex.
    // Only water is impassable; mountains are valid division terrain.
    function autoDeploy(r){
      const city=r.city.city, side=r.side;
      const open=(col,row)=>col>=0&&row>=0&&col<scenario.cols&&row<scenario.rows
        &&terrainAt(col,row)!=='Lake'
        &&!scenario.divisions.some(d=>!d.destroyed&&d.strength>0&&d.col===col&&d.row===row);
      const choose=arr=>arr.length?arr[Math.floor(Math.random()*arr.length)]:null;
      let spot=open(city.c,city.r)?{col:city.c,row:city.r}:null;
      if(!spot){
        const q=city.c-Math.floor(city.r/2);
        const offsets=[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
        const adjacent=offsets.map(([dq,dr])=>{const row=city.r+dr;return {col:q+dq+Math.floor(row/2),row};})
          .filter(p=>open(p.col,p.row));
        spot=choose(adjacent);
      }
      if(!spot){
        const candidates=[];
        for(let row=0;row<scenario.rows;row++)for(let col=0;col<scenario.cols;col++)
          if(open(col,row))candidates.push({col,row});
        // Prefer a friendly-controlled open hex, but do not hold production in reserve.
        const friendly=candidates.filter(p=>renderer.controlAt(p.col,p.row)===side);
        spot=choose(friendly.length?friendly:candidates);
      }
      if(!spot){console.error('No unoccupied land hex for completed reinforcement',r);return false;}
      const n=1+scenario.divisions.filter(d=>d.side===side).length;
      const id=side[0]+'-REINF-'+(++serial);
      scenario.divisions.push({id,side,name:n+'th '+r.type,type:r.type,
        strength:10000,effectiveness:100,experience:75,supply:1,tis:0,
        col:spot.col,row:spot.row});
      const location=spot.col===city.c&&spot.row===city.r?'in the city':'at hex '+spot.col+','+spot.row;
      const message=side+' '+r.type+' division produced at '+city.name+'; automatically deployed '+location+'.';
      const status=document.getElementById('routeStatus');if(status)status.textContent=message;
      // Keep the message in the persistent scrolling notification log if available.
      const log=document.getElementById('notificationLog');
      if(log){const item=document.createElement('div');item.textContent=message;log.appendChild(item);}
      return true;
    }
    function finishTurn(){
      advancePacification();
      for(const s of state){if(!s.production)continue;
        if(s.production.remaining>0)s.production.remaining--;
        if(s.production.remaining===0){
          const completed={type:s.production.type,city:s,side:s.production.side};
          if(autoDeploy(completed))s.production=null;
        }
      }
      // Older saved games may contain reinforcements awaiting manual deployment.
      for(const side of ['Blue','Red']){
        for(const r of [...reserves[side]])if(autoDeploy(r))reserves[side].splice(reserves[side].indexOf(r),1);
      }
      onChange();render();renderer.render();
    }
    function beginDeployment(side){
      // Production deploys automatically; manual deployment is obsolete.
      return false;
      if(global.ARMAGEDDON_M3?.executing)return false;
      const list=reserves[side]||[];
      if(!list.length)return false;
      deployment=list[0];
      document.getElementById('routeStatus').textContent='Deploy '+deployment.type+' from '+deployment.city.city.name+': left-click an empty, friendly-controlled, passable hex of that city. Press Escape to cancel.';
      return true;
    }
    function deployAt(col,row){
      if(!deployment||global.ARMAGEDDON_M3?.executing)return false;
      const r=deployment,s=r.city;
      if(cityForHex(col,row)!==s||owner(s)!==r.side||s.occupier||s.pacification>0)return false;
      if(['Mountains','Lake'].includes(terrainAt(col,row)))return false;
      if(renderer.controlAt(col,row)!==r.side)return false;
      if(scenario.divisions.some(d=>!d.destroyed&&d.strength>0&&d.col===col&&d.row===row))return false;
      const n=1+scenario.divisions.filter(d=>d.side===r.side).length;
      scenario.divisions.push({id:r.side[0]+'-REINF-'+r.id,side:r.side,name:n+'th '+r.type,type:r.type,strength:10000,effectiveness:100,experience:75,supply:1,tis:0,col,row});
      reserves[r.side].splice(reserves[r.side].indexOf(r),1);
      deployment=null;onChange();render();renderer.render();
      document.getElementById('routeStatus').textContent='Reinforcement deployed. Select another unit or use Deploy Reinforcement for the next one.';
      return true;
    }
    function cancelDeployment(){deployment=null;}
    onChange();
    return {cityForHex,cityHexCount,open,close,owner,updateOccupation,advancePacification,awardTurn,chargeMaintenance,maintenanceRates,setMaintenanceDay(day,totals){lastMaintenance={day,totals:totals&&Number.isFinite(totals.Blue)&&Number.isFinite(totals.Red)?{...totals}:calculateMaintenance()};},getMaintenance(){return lastMaintenance;},finishTurn,treasury,state,render,reserves,beginDeployment,deployAt,cancelDeployment,get deployment(){return deployment;}};
  }
  global.ARMAGEDDON_CITY={create,specs};
})(window);
