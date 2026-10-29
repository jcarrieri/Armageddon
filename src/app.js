(function(){
  const data=window.ARMAGEDDON_DATA,canvas=document.getElementById('battlefield');
  const renderer=new window.ARMAGEDDON_HEX.HexMapRenderer(canvas,data.scenario,data.terrainAt);
  const planner=new window.ARMAGEDDON_ROUTES.RoutePlanner(data.scenario);
  const unitSymbolsToggle=document.getElementById('unitSymbolsToggle');
  const unitSymbolSelect=document.getElementById('unitSymbolStyle');
  function setUnitSymbols(style){
    renderer.unitSymbolStyle=style==='silhouettes'?'silhouettes':'nato';
    unitSymbolSelect.value=renderer.unitSymbolStyle;
    unitSymbolsToggle.textContent='Unit Symbols: '+(renderer.unitSymbolStyle==='nato'?'NATO':'Illustrated');
    unitSymbolsToggle.setAttribute('aria-pressed',String(renderer.unitSymbolStyle==='silhouettes'));
    renderer.render();
  }
  unitSymbolsToggle.addEventListener('click',()=>setUnitSymbols(renderer.unitSymbolStyle==='nato'?'silhouettes':'nato'));
  unitSymbolSelect.addEventListener('change',()=>setUnitSymbols(unitSymbolSelect.value));
  setUnitSymbols(new URLSearchParams(location.search).get('unitSymbolStyle'));
  renderer.routes=planner;
  renderer.playtest=planner.playtest;
  const cities=window.ARMAGEDDON_CITY.create(data.scenario,data.terrainAt,renderer);
  const engine=new window.ARMAGEDDON_MOVEMENT.MovementEngine(data.scenario,data.terrainAt,planner);
  for(const d of data.scenario.divisions){d.stance='Hold';if(!Number.isFinite(d.experience))d.experience=75;}
  // Turn-start RP is credited during planning, once per day (including day one).
  cities.awardTurn();
  cities.chargeMaintenance(engine.day);
  document.getElementById("deployReinforcement").addEventListener("click",()=>{const side=planner.playtest?(window.prompt("Deploy for which side? Blue or Red",window.ARMAGEDDON_PLAYER_SIDE||"Blue")||"").trim():window.ARMAGEDDON_PLAYER_SIDE||"Blue";if(!cities.beginDeployment(side))document.getElementById("routeStatus").textContent="No ready reinforcements for "+side+".";});
  const sound=window.ARMAGEDDON_SOUND;
  const soundToggle=document.getElementById('soundToggle');
  soundToggle.addEventListener('click',()=>{sound.setEnabled(!sound.enabled);soundToggle.textContent=sound.enabled?'🔊 Sound: ON':'🔇 Sound: OFF';soundToggle.setAttribute('aria-pressed',String(sound.enabled));sound.unlock();});
  document.getElementById('retreatSoundTest').addEventListener('click',()=>sound.retreat());
  document.getElementById('surrenderSoundTest').addEventListener('click',()=>sound.surrender());

  const replacements=window.ARMAGEDDON_REPLACEMENTS.create(data.scenario,cities,renderer);
  renderer.replacementPackets=replacements.packets;
  if(!new URLSearchParams(location.search).has("loadSaved"))replacements.startDay(engine.day);
  const replacementToggle=document.getElementById('replacementToggle');
  const replacementPanel=document.createElement('div');replacementPanel.style.cssText='position:absolute;z-index:25;right:16px;top:90px;max-width:340px;max-height:65%;overflow:auto;padding:14px;background:#102735f5;color:#fff;border:2px solid #75d8ff;border-radius:8px;box-shadow:0 8px 30px #0009;pointer-events:none;white-space:pre-line;font:13px Arial';replacementPanel.hidden=true;canvas.parentElement.appendChild(replacementPanel);
  function closeReplacements(){if(!renderer.showReplacements)return;renderer.showReplacements=false;replacementPanel.hidden=true;replacementToggle.textContent='Replacements: OFF';replacementToggle.setAttribute('aria-pressed','false');renderer.render();}
  replacementToggle.addEventListener('click',e=>{e.stopPropagation();if(renderer.showReplacements){closeReplacements();return;}hidePreview();renderer.showReplacements=true;replacementPanel.hidden=true;replacementToggle.textContent='Replacements: ON';replacementToggle.setAttribute('aria-pressed','true');renderer.render();});
  canvas.addEventListener('pointerdown',e=>{if(!renderer.showReplacements)return; if(e.button!==0)return; const rect=canvas.getBoundingClientRect(),cell=renderer.hitTest(e.clientX-rect.left,e.clientY-rect.top);if(!cell){replacementPanel.hidden=true;return;}const packets=replacements.packets.filter(p=>p.col===cell.col&&p.row===cell.row&&(window.ARMAGEDDON_VIEW_MODE==='Both'||p.side===(window.ARMAGEDDON_PLAYER_SIDE||'Blue')));if(!packets.length){replacementPanel.hidden=true;return;}replacementPanel.textContent=`REPLACEMENT PACKETS — ${cell.col},${cell.row}\n\n`+packets.map(p=>{const d=byId(p.targetId);return `#${p.id} · ${p.soldiers} soldiers\nFrom: ${p.city}\nTo: ${d?.name||'Destroyed'}\nDispatched: Day ${p.createdDay}`;}).join('\n\n');replacementPanel.hidden=false;},{capture:true});
  const endPositionsToggle=document.getElementById('endPositionsToggle');
  function hidePreview(){if(!renderer.showEndPositions)return;renderer.showEndPositions=false;renderer.previewPositions=null;endPositionsToggle.textContent='End Positions: OFF';endPositionsToggle.setAttribute('aria-pressed','false');renderer.render();}
  endPositionsToggle.addEventListener('click',e=>{e.stopPropagation();renderer.showEndPositions=!renderer.showEndPositions;endPositionsToggle.textContent='End Positions: '+(renderer.showEndPositions?'ON':'OFF');endPositionsToggle.setAttribute('aria-pressed',String(!!renderer.showEndPositions));renderer.render();});
  // Any subsequent click anywhere dismisses the non-destructive projection.
  // End-position preview stays enabled until explicitly toggled off.
  // Other keys do not dismiss the preview.
  // During testing both visible toolbar controls and keyboard shortcuts call the same handlers.
  // Keyboard controls remain when the temporary test toolbar is eventually removed.
  window.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.repeat||executing)return;
    const tag=event.target?.tagName?.toLowerCase();
    if(['input','textarea','select'].includes(tag)||event.target?.isContentEditable)return;
    const shortcuts={e:'endPositionsToggle',r:'replacementToggle',z:'zocToggle',c:'citiesOverlayToggle',h:'hexControlToggle',m:'mapControlsToggle',d:'deployReinforcement',u:'unitSymbolsToggle'};
    // V: display canonical river/stream crossing sides and report selected route costs.
    if(event.key.toLowerCase()==='v'){
      event.preventDefault();renderer.showWaterCrossings=!renderer.showWaterCrossings;renderer.render();
      if(selectedId){const unit=byId(selectedId),route=planner.get(selectedId),steps=[];let from={col:unit.col,row:unit.row};
        for(const to of route){const t=data.terrainAt(to.col,to.row);
          steps.push(window.ARMAGEDDON_MOVEMENT.explainCost(unit,t,from,to,data.terrainAt));from=to;}
        console.table(steps);
      }
      status.textContent='Water crossing diagnostic '+(renderer.showWaterCrossings?'ON (red=river, yellow=stream)':'OFF')+'. Press V to toggle.';
      return;
    }
    const id=shortcuts[event.key.toLowerCase()];
    if(id){event.preventDefault();document.getElementById(id)?.click();}
    else if(event.key==='Escape'){replacementPanel.hidden=true;hidePreview();}
  });
  const zocButton=document.getElementById('zocToggle');
  renderer.cityStates=cities.state;
  const citiesOverlayButton=document.getElementById('citiesOverlayToggle');
  citiesOverlayButton.addEventListener('click',()=>{
    renderer.showCities=!renderer.showCities;
    citiesOverlayButton.textContent='Cities: '+(renderer.showCities?'ON':'OFF');
    citiesOverlayButton.setAttribute('aria-pressed',String(renderer.showCities));
    renderer.render();
  });
  const hexControlButton=document.getElementById('hexControlToggle');
  hexControlButton.addEventListener('click',()=>{
    renderer.showControl=!renderer.showControl;
    hexControlButton.textContent='Hex Control: '+(renderer.showControl?'ON':'OFF');
    hexControlButton.setAttribute('aria-pressed',String(renderer.showControl));renderer.render();
  });
  zocButton.addEventListener('click',()=>{renderer.showZoc=!renderer.showZoc;zocButton.textContent='Show ZOCs: '+(renderer.showZoc?'ON':'OFF');zocButton.setAttribute('aria-pressed',String(renderer.showZoc));renderer.render();});
  const controlsOverlay=document.getElementById('mapControlsOverlay');
  const controlsButton=document.getElementById('mapControlsToggle');
  const dayOverlay=document.getElementById('endDayOverlay');
  const reportButton=document.getElementById('dayReportButton');
  const toggleControls=()=>{controlsOverlay.hidden=!controlsOverlay.hidden;controlsButton.setAttribute('aria-pressed',String(!controlsOverlay.hidden));if(!controlsOverlay.hidden)dayOverlay.hidden=true;};
  controlsButton.addEventListener('click',toggleControls);
  const closeControls=()=>{controlsOverlay.hidden=true;controlsButton.setAttribute('aria-pressed','false');};
  controlsOverlay.addEventListener('click',closeControls);
  controlsOverlay.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();closeControls();}});
  let latestReport=null;
  function showReport(){if(!latestReport){document.getElementById('endDayBody').textContent='Complete a day with Ready to generate the first report.';}else{
    const r=latestReport;
    document.getElementById('dayReportTitle').textContent=`DAY ${r.day} — END OF DAY`;
    const body=document.getElementById('endDayBody');body.replaceChildren();
    const line=(label,value)=>{const el=document.createElement('div');el.className='report-line';const a=document.createElement('span');a.textContent=label;const b=document.createElement('strong');b.textContent=value;el.append(a,b);body.append(el);};
    line('Movement events',String(r.moves));line('Engagements (hourly)',String(r.engagements));
    line('Blue casualties',r.losses.Blue.toLocaleString());line('Red casualties',r.losses.Red.toLocaleString());
    line('Blue remaining strength',r.remaining.Blue.toLocaleString());line('Red remaining strength',r.remaining.Red.toLocaleString());
    line('Blue divisions eliminated',String(r.destroyed.Blue));line('Red divisions eliminated',String(r.destroyed.Red));
    line('Unfinished routes',String(r.routes));
    line('Blue maintenance (RP)',Number(r.maintenance?.Blue||0).toFixed(2));
    line('Red maintenance (RP)',Number(r.maintenance?.Red||0).toFixed(2));
    for(const side of ['Blue','Red']){
      const affected=r.negativeSupply?.[side]||[];
      if(!affected.length){line(side+' negative supply divisions','None');continue;}
      for(const unit of affected)line(side+' · '+unit.name, 'Supply '+unit.rating);
    }
    line('Blue replacement activity',r.replacements?.Blue||'No replacements dispatched or received');
    line('Red replacement activity',r.replacements?.Red||'No replacements dispatched or received');
    const note=document.createElement('p');note.className='report-note';note.textContent='Combat losses are provisional. Blue-only reports currently include aggregate Red casualties and strengths for playtesting; operational intelligence restrictions will be applied to the final reporting system.';body.append(note);
  }dayOverlay.hidden=false;controlsOverlay.hidden=true;controlsButton.setAttribute('aria-pressed','false');}
  reportButton.addEventListener('click',showReport);document.getElementById('sidebarReportButton').addEventListener('click',showReport);
  // Click the report itself or any visible battlefield area to dismiss it.
  dayOverlay.addEventListener('click',()=>dayOverlay.hidden=true);
  canvas.addEventListener('pointerdown',()=>{if(!dayOverlay.hidden)dayOverlay.hidden=true;});
  let executing=false;
  const byId=id=>data.scenario.divisions.find(d=>d.id===id);
  // M4.69: copyable, fixed-column Daily Situation snapshot.
  // Dam is credited proportionally to actual losses, never merely theoretical fire.
  const dsDam=new Map();let dsBattles=[];let dsFiring=new Set();let dsStart=new Map();let dsEffStart=new Map();let dsExpStart=new Map();let dsModifiers=new Map();let dsTerrain=new Map();let dsIP=new Map(); // All divisions that fired in the most recently executed day.
  const dsInt=n=>String(Math.max(0,Math.round(Number(n)||0)));
  const dsNum=n=>Number.isFinite(Number(n))?Number(n).toFixed(2):'0.00';
  function dsSnapshot(){
    const rows=[['Unit','Start','End','Firing','AtkTer','DefTer','Eff1','Eff2','Exp1','Exp2','Sup','Mod','IP','Cas','Dam']];
    for(const d of data.scenario.divisions){
      // Debug DS includes both armies, regardless of playtest viewing side.
      if(!dsFiring.has(d.id))continue; // M4.73: show only units firing this execution hour.
      rows.push([d.id,dsInt(dsStart.get(d.id)??d.strength),dsInt(d.strength),'Yes',dsTerrain.get(d.id)?.attacker?.weight?dsNum(dsTerrain.get(d.id).attacker.value):'—',dsTerrain.get(d.id)?.defender?.weight?dsNum(dsTerrain.get(d.id).defender.value):'—',dsNum(dsEffStart.get(d.id)??d.efficiency??100),dsNum(d.efficiency??100),dsNum(dsExpStart.get(d.id)??d.experience??75),dsNum(d.experience??75),dsNum(d.supply),dsNum(dsModifiers.get(d.id)?.value??1),dsNum(dsIP.get(d.id)??d.ip??0),dsInt(d.totalCasualties),dsInt(dsDam.get(d.id)||0)]);
    }
    const widths=rows[0].map((_,i)=>Math.max(...rows.map(r=>r[i].length)));
    const output=rows.map(r=>r.map((v,i)=>i===0||i===3?v.padEnd(widths[i]):v.padStart(widths[i])).join('  ')).join('\n');
    const history=dsBattles.length?'\n\nALL BATTLES THIS DAY\nHour  Attacker  Defender  Blue losses  Red losses\n'+dsBattles.map(b=>[String(b.hour).padStart(4),String(b.attacker).padEnd(8),String(b.defender).padEnd(8),String(b.blueLoss).padStart(11),String(b.redLoss).padStart(10)].join('  ')).join('\n'):'\n\nNo battles this day';
    return (rows.length===1?output+'\nNo units fired this turn':output)+history;
  }
  function refreshDS(){const el=document.getElementById('dsText');if(el)el.textContent=dsSnapshot();}
  // M4.71: Copy only the DS snapshot, never the surrounding page text.
  function copyDSText(){
    const value=dsSnapshot();
    const fallback=()=>{
      const input=document.createElement('textarea');
      input.value=value;input.setAttribute('readonly','');
      input.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;z-index:-1';
      document.body.appendChild(input);input.focus();input.select();
      let ok=false;try{ok=document.execCommand('copy');}catch(_e){}
      input.remove();
      if(!ok)window.prompt('Copy DS (Ctrl+C):',value);
    };
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(value).catch(fallback);
    else fallback();
  }
  document.getElementById('dsCopy')?.addEventListener('click',copyDSText);
  document.getElementById('dsDownload')?.addEventListener('click',()=>{
    const blob=new Blob([dsSnapshot()+'\n'],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download='ARMAGEDDON_DS.txt';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  window.ARMAGEDDON_DS={snapshot:dsSnapshot,refresh:refreshDS};
  refreshDS();

  const terrainLabel=(col,row)=>data.terrainAt(col,row);
  function updateReport(d){
    const none=document.getElementById('noSelection'),details=document.getElementById('divisionDetails');
    if(!d||d.destroyed||false){none.hidden=false;details.hidden=true;return;}
    none.hidden=true;details.hidden=false;
    document.getElementById('sideBadge').textContent=d.side.toUpperCase();document.getElementById('sideBadge').className='side-badge '+(d.side==='Blue'?'blue-badge':'red-badge');
    document.getElementById('divisionName').textContent=d.name;
    document.getElementById('divisionStrength').textContent=d.strength.toLocaleString('en-US');document.getElementById('divisionLosses').textContent=(d.totalCasualties||0).toLocaleString('en-US');
    const showSensitive=window.ARMAGEDDON_VIEW_MODE==='Both'||d.side===(window.ARMAGEDDON_PLAYER_SIDE||'Blue');
    for(const el of document.querySelectorAll('.sensitive-stat'))el.hidden=!showSensitive;
    document.getElementById('divisionEffectiveness').textContent=showSensitive?(Number.isFinite(d.effectiveness)?d.effectiveness.toFixed(1):'100.0'):'—';
    document.getElementById('divisionExperience').textContent=showSensitive?(Number.isFinite(d.experience)?d.experience.toFixed(1):'—'):'—';
    // Movement credit at the beginning of this planning turn, and projected credit
    // after all currently plotted entries (negative values are legitimate deficits).
    const startCredit=Number.isFinite(d._dayTIBudget)?d._dayTIBudget:10+Number(d.tis||0);
    let spent=0,fromCell={col:d.col,row:d.row};
    for(const wp of planner.get(d.id)){
      spent+=window.ARMAGEDDON_MOVEMENT.cost(d,data.terrainAt(wp.col,wp.row),fromCell,wp,data.terrainAt);
      spent+=(wp.pauseCount||0)+(wp.pause?1:0);fromCell=wp;
    }
    const tiFmt=x=>Number.isFinite(x)?x.toFixed(1):'—';
    document.getElementById('divisionStartTIs').textContent=tiFmt(Math.max(0,startCredit-Number(d._dayTISpent||0)));
    document.getElementById('divisionRemainingTIs').textContent=tiFmt(startCredit-Number(d._dayTISpent||0)-spent);
    document.getElementById('divisionSupply').textContent=Number.isFinite(d.supply)?(d.supply>0?'+':'')+d.supply:'+1';
    document.getElementById('divisionReplacements').textContent=showSensitive?(d.replacementsOnWay??'None'):'—';


    document.getElementById('divisionIP').textContent=showSensitive?(Number.isFinite(d.ip)?d.ip:0).toFixed(2).replace(/\.?0+$/,'')+'%':'—';document.getElementById('divisionTerrain').textContent=terrainLabel(d.col,d.row);
  }
  const floatingStance=document.createElement('div');floatingStance.id='floatingStance';floatingStance.style.cssText='position:absolute;z-index:15;display:none;background:#102735ed;color:white;padding:6px;border:1px solid #92aabd;border-radius:6px;font-size:12px;white-space:nowrap';
  canvas.parentElement.appendChild(floatingStance);
  // Stances remain an internal mechanic; all player divisions use Hold.
  function positionStance(){floatingStance.style.display='none';}
  canvas.addEventListener('wheel',()=>requestAnimationFrame(positionStance));
  canvas.addEventListener('pointerup',()=>requestAnimationFrame(positionStance));
  renderer.onSelect=id=>{updateReport(byId(id));positionStance();};
  let selectedId=null,drag=null,down=null,moved=false;
  let lastCityClick=null;

  const playtestButton=document.getElementById('playtestMode');
  // Shared-screen visibility/control; None preserves the setup side.
  const originalSide=window.ARMAGEDDON_PLAYER_SIDE||'Blue';
  window.ARMAGEDDON_VIEW_MODE='None';
  function setPlaytestSide(mode){
    if(executing)return;
    window.ARMAGEDDON_VIEW_MODE=mode;
    window.ARMAGEDDON_PLAYER_SIDE=(mode==='Blue'||mode==='Red')?mode:originalSide;
    planner.setPlaytest(mode==='Both');renderer.playtest=mode==='Both';
    playtestButton.textContent='Playtest Side: '+mode.toUpperCase();
    playtestButton.setAttribute('aria-pressed',String(mode!=='None'));
    document.querySelectorAll('input[name="playtestSide"]').forEach(r=>r.checked=r.value===mode);
    document.getElementById('playtestSideDescription').textContent=mode==='Both'?'All orders and all division information':mode==='None'?'Normal single-player: '+originalSide+' view':mode+' orders and '+mode+' intelligence only';
    if(selectedId&&!renderer.visibleDivision(byId(selectedId))){selectedId=null;renderer.setSelection(null);}
    // The detailed global combat report includes hidden enemy strengths and orders.
    // Suppress it for side-restricted views rather than leaking omniscient data.
    document.getElementById('combatLog').style.visibility=mode==='Both'?'visible':'hidden';
    refreshDS();
    syncRp();renderer.render();updateReport(selectedId?byId(selectedId):null);refreshChoices();positionStance();
  }
  document.querySelectorAll('input[name="playtestSide"]').forEach(r=>r.addEventListener('change',()=>setPlaytestSide(r.value)));
  playtestButton.style.display='none';
  setPlaytestSide('None');

  const status=document.getElementById('routeStatus');
  function localPoint(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  function divisionAt(x,y){let best=null,bestDist=Infinity;for(const d of data.scenario.divisions){if(!renderer.visibleDivision(d))continue;const p=renderer.worldPixel(d.col,d.row),dist=Math.hypot(p.x-x,p.y-y);if(dist<Math.max(20,renderer.size*.6)&&dist<bestDist){best=d;bestDist=dist;}}return best;}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;const p=localPoint(e);down=p;moved=false;drag={x:p.x,y:p.y,panX:renderer.pan.x,panY:renderer.pan.y,pointerId:e.pointerId};canvas.setPointerCapture(e.pointerId);});
  const terrainTooltip={hidden:true};
  canvas.addEventListener('pointerleave',()=>{renderer.hoverCell=null;renderer.render();});
  canvas.addEventListener('pointermove',e=>{const p=localPoint(e);
    const hover=renderer.screenPointToHex(p.x,p.y);
if(drag&&down&&Math.hypot(p.x-down.x,p.y-down.y)>4)moved=true;if(drag&&moved){renderer.pan.x=drag.panX+(p.x-drag.x);renderer.pan.y=drag.panY+(p.y-drag.y);renderer.clampPan();renderer.render();canvas.classList.add('dragging');}else{const cell=renderer.screenPointToHex(p.x,p.y);renderer.hoverCell=cell;renderer.render();}});
  canvas.addEventListener('pointerup',e=>{if(e.button!==0)return;const p=localPoint(e);if(drag&&!moved&&!executing&&!renderer.showEndPositions){const d=divisionAt(p.x,p.y);if(cities.deployment){const hex=renderer.hitTest(p.x,p.y);if(hex&&!cities.deployAt(hex.col,hex.row))status.textContent="Invalid deployment: choose an empty, friendly-controlled city hex belonging to the producing city.";drag=null;down=null;canvas.classList.remove("dragging");return;}    if(d){sound.uiCue('select');const hit=renderer.hitTest(p.x,p.y),city=hit&&cities.cityForHex(hit.col,hit.row);const now=Date.now();if(city&&lastCityClick&&lastCityClick.city===city&&now-lastCityClick.time<500){sound.uiCue('city');cities.open(city);selectedId=null;renderer.setSelection(null);updateReport(null);refreshChoices();lastCityClick=null;drag=null;down=null;canvas.classList.remove('dragging');return;}lastCityClick=city?{city,time:now}:null;cities.close();selectedId=d.id;stanceOffset=null;renderer.setSelection(selectedId);updateReport(d);refreshChoices();status.textContent=(d.side===(window.ARMAGEDDON_PLAYER_SIDE||'Blue')||planner.playtest)?'Selected '+d.name+'. Right-click a destination to plot; right-click a route hex or the division to add a 1-TI pause.':'Red division selected. Enable Playtest Mode to give Red orders.';}else{const hit=renderer.hitTest(p.x,p.y),city=hit&&cities.cityForHex(hit.col,hit.row);if(city){sound.uiCue('city');cities.open(city);selectedId=null;renderer.setSelection(null);updateReport(null);refreshChoices();}else{sound.uiCue('open');cities.close();selectedId=null;renderer.setSelection(null);updateReport(null);status.textContent='Selection cleared.';}}}drag=null;down=null;canvas.classList.remove('dragging');});
  canvas.addEventListener('pointercancel',()=>{drag=null;down=null;canvas.classList.remove('dragging');});
  function plotAt(e){
    e.preventDefault();
    if(executing)return;
    if(renderer.showEndPositions){status.textContent='End Positions preview is read-only. Turn it off to issue orders.';return;}
    if(!selectedId){cities.close();updateReport(null);status.textContent='Select a division first (enable Playtest Mode for Red).';return;}
    const p=localPoint(e),cell=renderer.screenPointToHex(p.x,p.y);
    const unit=byId(selectedId);
    const onRoute=cell&&planner.get(selectedId).some(p=>p.col===cell.col&&p.row===cell.row);
    const onUnit=cell&&unit&&unit.col===cell.col&&unit.row===cell.row;
    const result=(onRoute||onUnit)?planner.addPause(selectedId,cell):planner.plotTo(selectedId,cell);
    if(result.ok)sound.uiCue('destination');
    status.textContent=result.ok?(result.count?`Pause added: ${result.count} TI(s) at ${result.location}.`:`Route extended to ${planner.get(selectedId).length} hex(es).`):result.reason;
    renderer.render();updateReport(byId(selectedId));if(typeof refreshChoices==='function')refreshChoices();
  }
  // Only the contextmenu event plots a route. Previously pointerdown and
  // contextmenu could both plot the SAME physical right-click, so the second
  // call reported "Destination is already the end of the route".
  // Never reset a deduplication flag on pointerup: browsers fire contextmenu
  // in different orders relative to pointerup.
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();plotAt(e);});
  canvas.addEventListener('wheel',e=>{e.preventDefault();const p=localPoint(e);renderer.zoomAt(e.deltaY<0?1.1:1/1.1,p.x,p.y);},{passive:false});
  window.addEventListener('keydown',e=>{if(!executing&&!renderer.showEndPositions&&e.key==='Escape'&&selectedId){planner.undo(selectedId);renderer.render();updateReport(byId(selectedId));if(typeof refreshChoices==='function')refreshChoices();}});

  // Route plotting uses right-click directly; diagnostic fallback UI removed.
  function refreshChoices(){}

  const combatAudit=[]; // Preserved across days; no automatic clearing.
  // M3: resolve each hourly movement TI first, then present its completed events.
  // Persistent on-screen execution diagnostics, also mirrored to browser console.
  const debugPanel=document.getElementById('movementDebugPanel');
  const debugText=document.getElementById('movementDebugText');
  const debugEntries=[];
  if(debugPanel)debugPanel.style.display='none'; // Diagnostics retained internally, not displayed.
  if(debugPanel)debugPanel.style.pointerEvents='auto';
  function debugLog(message,extra){
    const stamp=new Date().toLocaleTimeString();
    let detail='';try{if(extra!==undefined)detail=' '+JSON.stringify(extra);}catch(e){detail=' [unserializable]';}
    const line=`[${stamp}] ${message}${detail}`;
    debugEntries.push(line);if(debugEntries.length>400)debugEntries.shift();
    if(debugText){debugText.textContent=debugEntries.slice(-120).join('\n');debugText.scrollTop=debugText.scrollHeight;}
    console.log('[ARMAGEDDON DEBUG]',line);
  }
  document.getElementById('debugToggle')?.addEventListener('click',()=>{debugPanel.style.display='block';if(debugPanel.style.display!=='none')debugText.textContent=debugEntries.slice(-120).join('\n');});
  document.getElementById('debugClose')?.addEventListener('click',()=>{debugPanel.style.display='none';});
  document.getElementById('debugClear')?.addEventListener('click',()=>{debugEntries.length=0;debugText.textContent='';});
  document.getElementById('debugCopy')?.addEventListener('click',()=>{navigator.clipboard?.writeText(debugEntries.join('\n')).catch(()=>window.prompt('Copy log:',debugEntries.join('\n')));});
  window.ARMAGEDDON_DEBUG={log:debugLog,entries:debugEntries};
  window.addEventListener('error',e=>debugLog('GLOBAL ERROR',{message:e.message,stack:e.error?.stack}));
  window.addEventListener('unhandledrejection',e=>debugLog('UNHANDLED REJECTION',{reason:String(e.reason),stack:e.reason?.stack}));
  // Single-player only. The controlling nation is chosen at game setup.
  window.ARMAGEDDON_PLAYER_SIDE=new URLSearchParams(location.search).get('playerSide')||'Blue';
  function syncRp(){const blue=document.getElementById('blueRpGroup'),red=document.getElementById('redRpGroup');blue.hidden=!planner.playtest&&window.ARMAGEDDON_PLAYER_SIDE!=='Blue';red.hidden=!planner.playtest&&window.ARMAGEDDON_PLAYER_SIDE!=='Red';}
  function syncMp(){syncRp();renderer.render();refreshChoices();}
  const readyButton=document.getElementById('readyButton');
  const tiLabel=document.getElementById('tiLabel');
  const gameClock=document.getElementById('gameClock');
  const gameParams=new URLSearchParams(location.search);
  // Legacy game URLs without a startDate also get one fixed random date.
  if(!/^\d{4}-\d{2}-\d{2}$/.test(gameParams.get('startDate')||'')){
    const first=Date.UTC(1939,0,1),last=Date.UTC(1947,11,31),day=86400000;
    const offset=Math.floor(Math.random()*((last-first)/day+1));
    gameParams.set('startDate',new Date(first+offset*day).toISOString().slice(0,10));
    history.replaceState(null,'',location.pathname+'?'+gameParams.toString()+location.hash);
  }
  const campaignStartDate=gameParams.get('startDate');
  function updateGameClock(){
    // Each execution increment is one game hour; each planning day begins at 7 AM.
    const hour=7+Math.max(0,Math.min(10,Number(engine.ti)||0));
    const displayHour=hour%12||12;
    // Day 1 begins on the campaign's randomized historical start date.
    const configured=campaignStartDate;
    const parsed=configured&&/^\d{4}-\d{2}-\d{2}$/.test(configured)?configured:null;
    const initial=parsed?new Date(parsed+'T12:00:00'):new Date();
    const date=new Date(initial.getFullYear(),initial.getMonth(),initial.getDate()+Math.max(0,engine.day-1));
    const dateText=date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    gameClock.textContent=`${dateText} · ${displayHour}:00 ${hour<12?'AM':'PM'}`;
  }
  updateGameClock();
  const phaseLabel=document.getElementById('phaseLabel');
  syncRp();
  // Animation-only playback speed. Does not affect game hours or TI accounting.
  let animationRate=1;
  const speedButton=document.getElementById('gameSpeedButton');
  const speedMenu=document.getElementById('gameSpeedMenu');
  const speedNames={'0.5':'Slow 50%','1':'Normal 100%','2':'Fast 200%'};
  speedButton.addEventListener('click',()=>{speedMenu.hidden=!speedMenu.hidden;speedButton.setAttribute('aria-expanded',String(!speedMenu.hidden));});
  document.querySelectorAll('input[name="animationSpeed"]').forEach(radio=>{
    radio.addEventListener('change',()=>{if(radio.checked){animationRate=Number(radio.value)||1;speedButton.textContent='Speed: '+speedNames[radio.value]+' ▾';speedMenu.hidden=true;speedButton.setAttribute('aria-expanded','false');}});
  });
  const animationDuration=ms=>ms/animationRate;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function frame(){return new Promise(resolve=>requestAnimationFrame(resolve));}
  // Track individual acting-unit events without zooming; the player may still pan or zoom.
  let manualCameraEpoch=0;
  canvas.addEventListener('pointerdown',e=>{if(executing&&e.button===0)manualCameraEpoch++;});
  canvas.addEventListener('wheel',()=>{if(executing)manualCameraEpoch++;},{passive:true});
  async function trackCamera(col,row,force=false){
    if(!force&&!renderer.targetNeedsTracking(col,row))return;
    const p=renderer.worldPixel(col,row), dx=renderer.dims.w/2-p.x,dy=renderer.dims.h/2-p.y;
    const origin={...renderer.pan};
    renderer.pan.x=origin.x+dx;renderer.pan.y=origin.y+dy;renderer.clampPan();
    const target={...renderer.pan};renderer.pan={...origin};
    const travelX=target.x-origin.x,travelY=target.y-origin.y;
    if(Math.hypot(travelX,travelY)<0.5)return;
    const duration=animationDuration(Math.max(300,Math.min(1500,300+Math.hypot(travelX,travelY)*.45)));
    const start=performance.now(),epoch=manualCameraEpoch;
    while(true){
      if(epoch!==manualCameraEpoch)break;
      const t=Math.min(1,(performance.now()-start)/duration),ease=t*t*(3-2*t);
      renderer.pan.x=origin.x+travelX*ease;renderer.pan.y=origin.y+travelY*ease;
      renderer.render();if(t>=1)break;await frame();
    }
  }
  // Interpolate in Cartesian map coordinates, never fractional offset hex columns.
  // Fractional offset coordinates change row parity and cause a one-hex jump.
  function visualTween(from,to,t){
    const a=renderer.worldPixel(from.col,from.row),b=renderer.worldPixel(to.col,to.row);
    return {pixelX:(a.x+(b.x-a.x)*t-renderer.pan.x)/renderer.zoom,
            pixelY:(a.y+(b.y-a.y)*t-renderer.pan.y)/renderer.zoom};
  }
  async function animateMove(event){
    const d=byId(event.id);
    const from={...event.from},to={...event.to};
    await trackCamera(from.col,from.row);
    sound.movement(d?.type||'Infantry',{duration:1.5});
    const duration=animationDuration(1500),start=performance.now();
    // Logical state has already been resolved; the renderer uses separate visual coordinates.
    for(;;){
      const t=Math.min(1,(performance.now()-start)/duration);
      renderer.visualPositions.set(d.id,visualTween(from,to,t));
      renderer.render();
      if(t>=1)break;
      await frame();
    }
    renderer.visualPositions.delete(d.id);
    renderer.render();
  }
  async function animateGroup(group){
    // Moves are resolved simultaneously by the engine, but shown one by one so
    // the camera visits EVERY moving division, including those across the map.
    // Preserve all starting visual positions until each move is presented.
    for(const e of group){
      const start=renderer.worldPixel(e.from.col,e.from.row);
      renderer.visualPositions.set(e.id,{pixelX:(start.x-renderer.pan.x)/renderer.zoom,pixelY:(start.y-renderer.pan.y)/renderer.zoom});
    }
    for(const e of group){
      // Finish camera travel before any unit motion or movement sound.
      await trackCamera(e.from.col,e.from.row);
      const unit=byId(e.id);
      sound.movement(unit?.type||'Infantry',{duration:1.5});
      const duration=animationDuration(1500),startTime=performance.now();
      // A friendly-occupied pass-through may legally cover multiple adjacent
      // hexes in one logical commit. Animate the actual route, not a direct hop.
      const path=Array.isArray(e.path)&&e.path.length>1?e.path:[e.from,e.to];
      for(let step=1;step<path.length;step++){
        const legStart=performance.now();
        for(;;){
          const t=Math.min(1,(performance.now()-legStart)/duration);
          const ease=t*t*(3-2*t);
          renderer.visualPositions.set(e.id,visualTween(path[step-1],path[step],ease));
          renderer.render();
          if(t>=1)break;
          await frame();
        }
      }
      renderer.visualPositions.delete(e.id);
      renderer.render();
    }
  }
  // M3.13: purely visual combat presentation; does not alter casualties or TI rules.
  // Draw after each map render so flashes, smoke and tracers stay attached to map hexes.
  async function animateCombat(engagement){
    // Animate every directed exchange, including primary and support fire.
    // These are visual-only: casualties have already been computed simultaneously.
    const pairs=(engagement.firePairs||[]).map(p=>({from:byId(p.source),to:byId(p.target),role:p.role})).filter(p=>p.from&&p.to);
    if(pairs.length){
      await trackCamera(pairs[0].from.col,pairs[0].from.row);
      sound.combat(pairs[0].from.type||'mixed');
      const start=performance.now(),duration=animationDuration(3000);
      while(true){
        const t=Math.min(1,(performance.now()-start)/duration);
        renderer.render();const ctx=renderer.ctx;
        ctx.save();
        for(const [i,p] of pairs.entries()){
          const a=renderer.worldPixel(p.from.col,p.from.row),b=renderer.worldPixel(p.to.col,p.to.row);
          const phase=(t*2+i/Math.max(1,pairs.length))%1;
          const x=a.x+(b.x-a.x)*phase,y=a.y+(b.y-a.y)*phase;
          ctx.strokeStyle=p.from.side==='Blue'?'rgba(255,220,112,.95)':'rgba(255,115,80,.95)';
          ctx.lineWidth=Math.max(1.5,renderer.zoom*2.6);
          ctx.beginPath();ctx.moveTo(x-(b.x-a.x)*.12,y-(b.y-a.y)*.12);ctx.lineTo(x,y);ctx.stroke();
          // Impact flashes and lingering smoke for each individual exchange.
          const burst=(t*3+i*.37)%1;
          if(burst<.50){const radius=renderer.size*(.12+burst*.65);const glow=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,radius);glow.addColorStop(0,`rgba(255,250,198,${.80-burst})`);glow.addColorStop(.45,`rgba(255,127,24,${.60-burst})`);glow.addColorStop(1,'rgba(60,45,45,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(b.x,b.y,radius,0,Math.PI*2);ctx.fill();}
          ctx.fillStyle=`rgba(38,43,42,${.12*Math.sin(Math.PI*t)})`;ctx.beginPath();ctx.arc(b.x+Math.sin(i*7)*renderer.size*.22,b.y-renderer.size*t*.40,renderer.size*(.20+t*.20),0,Math.PI*2);ctx.fill();
          if(t<.25){ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(a.x,a.y,Math.max(2,renderer.zoom*4),0,Math.PI*2);ctx.fill();}
        }
        ctx.restore();
        if(t>=1)break;
        await new Promise(resolve=>requestAnimationFrame(resolve));
      }
      renderer.render();return;
    }
    // Additional engagements from the same TI have already been shown in
    // the shared simultaneous volley; do not replay only the primary pair.
    if(Array.isArray(engagement.firePairs))return;
    const blue=byId(engagement.blue),red=byId(engagement.red);
    await trackCamera((blue||red).col,(blue||red).row);
    sound.combat(blue?.type||red?.type||'mixed');
    if(!blue||!red)return;
    const midpoint={col:(blue.col+red.col)/2,row:(blue.row+red.row)/2};
    await trackCamera(blue.col,blue.row);
    const duration=animationDuration(3000),start=performance.now();
    const seed=engagement.blue.length*31+engagement.red.length*17+engagement.ti*13;
    while(true){
      const t=Math.min(1,(performance.now()-start)/duration);
      renderer.render();
      const ctx=renderer.ctx, bp=renderer.worldPixel(blue.col,blue.row),rp=renderer.worldPixel(red.col,red.row);
      const mx=(bp.x+rp.x)/2,my=(bp.y+rp.y)/2;
      ctx.save();
      // Directional tracer streaks, alternating from each side.
      for(let i=0;i<12;i++){
        const phase=(t*4+i/10)%1,forward=i%2===0;
        const a=forward?bp:rp,b=forward?rp:bp;
        const wobble=Math.sin(i*17.3+seed)*renderer.size*.26;
        const x=a.x+(b.x-a.x)*phase,y=a.y+(b.y-a.y)*phase+wobble;
        ctx.strokeStyle=forward?'rgba(255,226,132,.95)':'rgba(255,119,75,.95)';
        ctx.lineWidth=Math.max(1.5,renderer.zoom*2.6);ctx.shadowColor='#ffd36a';ctx.shadowBlur=10;
        ctx.beginPath();ctx.moveTo(x-(b.x-a.x)*.13,y-(b.y-a.y)*.13);ctx.lineTo(x,y);ctx.stroke();
      }
      ctx.shadowBlur=0;
      // Expanding orange-white shell bursts with deterministic sparks.
      for(let j=0;j<3;j++){
        const burst=(t*2.1+j*.38)%1,fade=Math.pow(1-burst,1.35);
        const cx=mx+Math.sin(seed+j*5.3)*renderer.size*.36;
        const cy=my+Math.cos(seed+j*4.7)*renderer.size*.31;
        const radius=renderer.size*(.18+burst*.92);
        const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,radius);
        glow.addColorStop(0,`rgba(255,255,210,${fade*.9})`);
        glow.addColorStop(.28,`rgba(255,180,48,${fade*.7})`);
        glow.addColorStop(.65,`rgba(255,70,25,${fade*.4})`);
        glow.addColorStop(1,'rgba(60,50,50,0)');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=`rgba(255,210,100,${fade*.9})`;ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(cx,cy,radius*.75,0,Math.PI*2);ctx.stroke();
        for(let k=0;k<9;k++){
          const angle=k*Math.PI*2/9+j*1.2;
          const dist=radius*(.8+(k%3)*.23);
          ctx.fillStyle=`rgba(255,210,110,${fade})`;
          ctx.beginPath();ctx.arc(cx+Math.cos(angle)*dist,cy+Math.sin(angle)*dist,Math.max(1,renderer.zoom*2),0,Math.PI*2);ctx.fill();
        }
      }
      // Dark smoke columns linger after the initial explosions.
      for(let i=0;i<7;i++){
        const rise=Math.max(0,t-.12),x=mx+Math.sin(i*4.3+seed)*renderer.size*.43;
        const y=my-Math.pow(rise,.7)*renderer.size*(.8+i*.12);
        ctx.fillStyle=`rgba(34,38,37,${Math.sin(Math.PI*t)*.24})`;
        ctx.beginPath();ctx.arc(x,y,renderer.size*(.23+rise*.28),0,Math.PI*2);ctx.fill();
      }
      // Casualty figures rise above each counter, clearly attributed by side.
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3;
      ctx.font=`bold ${Math.max(13,15*renderer.zoom)}px Arial`;
      for(const [p,loss,color] of [[bp,engagement.blueLoss,'#a9dcff'],[rp,engagement.redLoss,'#ffb4a8']]){
        const y=p.y-renderer.size*.85-t*24;
        ctx.globalAlpha=Math.min(1,t*7)*(1-Math.max(0,t-.75)*3);
        ctx.strokeStyle='#171a1d';ctx.fillStyle=color;
        ctx.strokeText('-'+loss,p.x,y);ctx.fillText('-'+loss,p.x,y);
      }
      ctx.globalAlpha=1;
      ctx.restore();
      if(t>=1)break;
      await frame();
    }
    renderer.render();
  }
  // Show a clear blocked-unit marker and play the 2-second warning once per
  // blocked division per hour. This is cosmetic and does not alter movement.
  async function animateBlocked(ids){
    const units=[...new Set(ids)].map(byId).filter(d=>d&&!d.destroyed);
    if(!units.length)return;
    await trackCamera(units[0].col,units[0].row);
    sound.blocked();
    const start=performance.now(),duration=animationDuration(2000);
    while(performance.now()-start<duration){
      renderer.render();const ctx=renderer.ctx;ctx.save();ctx.setTransform(renderer.dpr,0,0,renderer.dpr,0,0);
      const phase=(performance.now()-start)/duration;
      for(const d of units){const p=renderer.worldPixel(d.col,d.row);
        ctx.fillStyle='#e03d31';ctx.strokeStyle='#ffffff';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(p.x,p.y-renderer.size*.95,renderer.size*.31,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${Math.max(13,renderer.size*.43)}px Arial`;
        ctx.fillText('×',p.x,p.y-renderer.size*.95);
        ctx.font=`bold ${Math.max(10,renderer.size*.19)}px Arial`;
        ctx.fillStyle=phase<.75?'#fff2b3':'#ffffff';ctx.fillText('BLOCKED',p.x,p.y-renderer.size*1.37);
      }
      ctx.restore();await frame();
    }
    renderer.render();
  }
  async function animateRetreat(retreats){sound.retreat();const started=performance.now();const duration=animationDuration(4000);const original=retreats.map(r=>({r,d:byId(r.id),from:r.from||null})).filter(x=>x.d&&!x.d.destroyed);while(performance.now()-started<duration){const f=Math.min(1,(performance.now()-started)/duration);for(const x of original){const from=x.from||x.d,to=x.r.to||x.d;renderer.visualPositions.set(x.d.id,{col:from.col+(to.col-from.col)*f,row:from.row+(to.row-from.row)*f});}renderer.render();await frame();}renderer.visualPositions.clear();renderer.render();}
  async function animateSurrender(destroyed,before){sound.surrender();const started=performance.now();const duration=animationDuration(6000);while(performance.now()-started<duration){renderer.render();const f=Math.min(1,(performance.now()-started)/duration),ctx=renderer.ctx;ctx.save();ctx.setTransform(renderer.dpr,0,0,renderer.dpr,0,0);for(const d of destroyed){const pos=before.get(d.id)||d,p=renderer.worldPixel(pos.col,pos.row);ctx.globalAlpha=1-f*.85;ctx.fillStyle='#ffe8a2';ctx.strokeStyle='#ed4d38';ctx.lineWidth=4;ctx.beginPath();ctx.arc(p.x,p.y,renderer.size*(.4+f*.7),0,Math.PI*2);ctx.stroke();ctx.font=`bold ${Math.max(13,renderer.size*.36)}px Arial`;ctx.textAlign='center';ctx.fillText('SURRENDER',p.x,p.y-renderer.size*(.7+f));}ctx.restore();await frame();}renderer.render();}
  async function runDay(){
    if(executing){debugLog('runDay rejected: already executing');return;}
    debugLog('runDay ENTER',{day:engine.day,engineHour:engine.ti});
    if(engine.ti>=10){engine.nextDay();cities.awardTurn();cities.chargeMaintenance(engine.day);replacements.startDay(engine.day);tiLabel.textContent=`Day ${engine.day} · Planning`;updateGameClock();saveGame(true);}
    // Resume from the next unprocessed TI if a prior execution was interrupted.
    // Diagnostics stay in memory; do not show a debug overlay.
    const charged=cities.getMaintenance()?.totals||{Blue:0,Red:0};
    const daySummary={day:engine.day,moves:0,engagements:0,losses:{Blue:0,Red:0},destroyed:{Blue:0,Red:0},remaining:{Blue:0,Red:0},routes:0,maintenance:{...charged},supplyProblems:{Blue:0,Red:0},negativeSupply:{Blue:[],Red:[]},replacements:{Blue:'No replacements dispatched or received',Red:'No replacements dispatched or received'}};
    dayOverlay.hidden=true;
    sound.unlock();
    // Preserve the complete planning snapshot BEFORE the first execution increment.
    // Replaying restores this exact state, including plotted routes and replacement packets.
    if(!saveTurnStart()){status.textContent='Warning: could not save turn-start replay snapshot.';}
    for(const d of data.scenario.divisions){d._dayTIBudget=10+Number(d.tis||0);d._dayTISpent=0;}
    dsDam.clear();dsBattles=[];dsFiring=new Set();dsStart=new Map(data.scenario.divisions.map(d=>[d.id,d.strength]));dsEffStart=new Map(data.scenario.divisions.map(d=>[d.id,Number.isFinite(d.efficiency)?d.efficiency:100]));dsExpStart=new Map(data.scenario.divisions.map(d=>[d.id,Number.isFinite(d.experience)?d.experience:75]));dsModifiers=new Map();dsTerrain=new Map();dsIP=new Map();refreshDS(); // New execution day: clear previous day firing history.
    executing=true;window.ARMAGEDDON_EXECUTION_HIDE_ROUTES=true;readyButton.disabled=true;playtestButton.disabled=true;
    floatingStance.style.display='none';
    phaseLabel.textContent='EXECUTING';
    const ordered=data.scenario.divisions.filter(d=>!d.destroyed&&planner.get(d.id).length).length;
    debugLog('Routes counted',{ordered,units:data.scenario.divisions.length,samples:data.scenario.divisions.filter(d=>planner.get(d.id).length).slice(0,8).map(d=>({id:d.id,pos:[d.col,d.row],route:planner.get(d.id).slice(0,3),hours:d.tis}))});
    status.textContent=ordered?`Executing orders for ${ordered} division(s)…`:'Executing 10 hours — no movement routes have been plotted.';
    try{
      // Freeze supply status at the beginning of the turn.
      const turnSupply=window.ARMAGEDDON_SUPPLY.check(data.scenario,data.terrainAt);
      // Negative supply ratings are reported after the day's supply adjustments.
      const repActivity=replacements.history[engine.day]||{Blue:{created:0,received:0,lost:0},Red:{created:0,received:0,lost:0}};
      for(const side of ['Blue','Red']){const r=repActivity[side];daySummary.replacements[side]=`${r.created} dispatched, ${r.received} arrived, ${r.lost} lost`;}
      await sleep(60);
      // TI 1 begins at the last selected division; later TIs retain the previous camera.
      // Avoid blocking the entire execution phase on a long camera animation.
      for(let ti=engine.ti+1;ti<=10;ti++){
        const before=new Map(data.scenario.divisions.map(d=>[d.id,{col:d.col,row:d.row}]));
        debugLog('Hour begin',{ti,day:engine.day});status.textContent=`Processing hour ${ti} of 10…`;await sleep(0);
        const stepStarted=performance.now();const result=engine.step();updateGameClock();
        for(const e of result.events||[]){const d=byId(e.id);if(d)d._dayTISpent=(d._dayTISpent||0)+Number(e.cost||0);}
        for(const a of result.attacks||[]){const d=byId(a.attacker);if(d)d._dayTISpent=(d._dayTISpent||0)+Number(a.entryCost||0);}
        updateReport(selectedId?byId(selectedId):null);const stepMs=Math.round(performance.now()-stepStarted);daySummary.moves+=result.events.length;
        const waitingSample=data.scenario.divisions.filter(d=>!d.destroyed&&planner.get(d.id).length).slice(0,5).map(d=>{const next=planner.get(d.id)[0];return {id:d.id,from:[d.col,d.row],to:[next.col,next.row],accumulated:+d.tis.toFixed(2),required:window.ARMAGEDDON_MOVEMENT.cost(d,data.terrainAt(next.col,next.row),d,next,data.terrainAt)};});
        debugLog('Hour resolved',{ti,stepMs,moves:result.events.length,blocked:result.blocked,zocStops:result.zocStops.length,events:result.events.slice(0,8),waitingSample});
        if(result.zocStops.length){status.textContent=`Hour ${ti}/10 · ${result.zocStops.length} move(s) held by enemy ZOC`;}
        if(!result.events.length){
          const waiting=data.scenario.divisions.filter(d=>!d.destroyed&&planner.get(d.id).length);
          if(waiting.length){const first=waiting[0],next=planner.get(first.id)[0],required=window.ARMAGEDDON_MOVEMENT.cost(first,data.terrainAt(next.col,next.row),first,next,data.terrainAt);
            status.textContent=`Hour ${ti}/10 — 0 moves. ${first.name}: ${Number(first.tis||0).toFixed(1)} / ${Number.isFinite(required)?required.toFixed(1):'∞'} movement hours accumulated for next hex.`;
          }else status.textContent=`Hour ${ti}/10 — no divisions have movement orders.`;
        }
        // Animate all simultaneous hourly moves together, preserving atomic state.
        if(result.events.length){
          status.textContent=`Hour ${ti}/10 — ${result.events.length} division(s) moving; ${daySummary.moves} moves today.`;
          debugLog('Animation start',{ti,count:result.events.length});
          await animateGroup(result.events);
          debugLog('Animation complete',{ti});
          updateReport(selectedId?byId(selectedId):null);
        }else{
          renderer.visualPositions.clear();
        }
        if(result.blockedUnits?.length)await animateBlocked(result.blockedUnits);
        await sleep(40);
        cities.updateOccupation();window.ARMAGEDDON_CITY_STATE=cities.state.map(c=>({...c,owner:cities.owner(c)}));
        const combatResult=window.ARMAGEDDON_COMBAT.resolve(data.scenario,data.terrainAt,engine.day,ti,result.attacks,planner,result.events,result.attempted);
        // M4.72: combat reporting is driven by actual firing exchanges, not
        // mere adjacency, movement, or a nominal attack event.
        const engagements=(combatResult.engagements||[]).filter(e=>
          Array.isArray(e.firePairs)&&e.firePairs.some(p=>
            p.source&&p.target&&p.source!==p.target));
        for(const id of combatResult.firingUnits||[]){dsFiring.add(id);const unit=byId(id);if(unit)dsIP.set(id,Number(unit.ip)||0);} // Record IP at latest firing hour, not a later report time.
        // Mod: damage-weighted mean of actual final combat ratings across this turn's
        // firing exchanges. A unit firing at multiple targets can have different ratings.
        for(const engagement of engagements){
          for(const f of [...(engagement.attackerFactors||[]),...(engagement.defenderFactors||[]),...(engagement.supportFactors||[])]){
            if(!(Number(f.damage)>0)||!Number.isFinite(Number(f.finalRating)))continue;
            const prev=dsModifiers.get(f.unit)||{weighted:0,weight:0};
            prev.weighted+=Number(f.finalRating)*Number(f.damage);
            prev.weight+=Number(f.damage);
            prev.value=prev.weighted/prev.weight;
            dsModifiers.set(f.unit,prev);
            // M5.04: preserve the actual terrain factor of each firing exchange,
            // separately for attacker and defender roles, weighted by damage.
            const role=f.role==='Attacker'?'attacker':'defender';
            const factors=dsTerrain.get(f.unit)||{};
            const terrainStat=factors[role]||{weighted:0,weight:0,value:1};
            const terrainValue=Number(f.terrain);
            if(Number.isFinite(terrainValue)){
              terrainStat.weighted+=terrainValue*Number(f.damage);
              terrainStat.weight+=Number(f.damage);
              terrainStat.value=terrainStat.weighted/terrainStat.weight;
              factors[role]=terrainStat;
              dsTerrain.set(f.unit,factors);
            }
          }
        }
        for(const [id,amount] of Object.entries(combatResult.damageByUnit||{}))dsDam.set(id,(dsDam.get(id)||0)+amount);
        refreshDS();
        for(const e of engagements)dsBattles.push({hour:ti,attacker:e.attacker,defender:e.defender,blueLoss:e.blueLoss,redLoss:e.redLoss});
        refreshDS();
        daySummary.engagements+=engagements.length;
        for(const e of engagements){daySummary.losses.Blue+=e.blueLoss;daySummary.losses.Red+=e.redLoss;}
        for(const d of combatResult.destroyed)daySummary.destroyed[d.side]++;
        // Show every engagement as a battlefield event before continuing to the next TI.
        for(const engagement of engagements){
          status.textContent=`Hour ${ti}/10 · Combat: ${engagement.blue} vs ${engagement.red}`;
          await animateCombat(engagement);
        }
        // Persistent combat audit: log every calculated rating and its inputs.
        const log=document.getElementById('combatLog');
        const fmt=n=>Number(n).toFixed(3);
        for(const e of engagements){
          const actualPairs=new Set(e.firePairs.map(p=>p.source+'>'+p.target));
          const actualFactors=[...(e.attackerFactors||[]),...(e.defenderFactors||[]),...(e.supportFactors||[])]
            .filter(f=>actualPairs.has(f.unit+'>'+f.target)&&Number(f.damage)>0);
          if(!actualFactors.length)continue;
          const formatFactor=f=>`${f.role} ${f.unit} → ${f.target} | Strength ${f.strength.toLocaleString()} (committed ${fmt(f.committed)}) | Effectiveness ${fmt(f.effectiveness)} vs ${fmt(f.opponentEffectiveness)} (factor ${fmt(f.effectivenessFactor)}) | Efficiency ${fmt(f.efficiency)} (${fmt(f.efficiency*100)}%) | Supply multiplier ${fmt(f.supply)} (${fmt(f.supply*100)}%) | Terrain ${f.terrainName} ×${fmt(f.terrain)} | Matchup ×${fmt(f.matchup)} | Defender IP ×${fmt(f.improvedPosition)} | Random ×${fmt(f.random)} [disabled] | FINAL RATING ×${fmt(f.finalRating)} | Expected casualties ${fmt(f.damage)}`;
          const lines=[`Day ${engine.day}, Hour ${ti} — ${e.attacker} attacks ${e.defender} (increment ${e.increment})`,
            ...actualFactors.map(f=>(f.unit===e.attacker||f.unit===e.defender?'':'SUPPORT: ')+formatFactor(f)),
            `Actual casualties: Blue ${e.blueLoss.toLocaleString()}, Red ${e.redLoss.toLocaleString()}`];
          const entry=lines.join('\n');
          combatAudit.push(entry);
          console.log('[ARMAGEDDON COMBAT]',entry);
        }
        log.textContent=combatAudit.length?combatAudit.join('\n\n'):'No combat engagements yet.';
        for(const dead of combatResult.destroyed)planner.get(dead.id).length=0;
        const lostPackets=replacements.removeDestroyed();for(const side of ["Blue","Red"]){if(lostPackets[side])daySummary.replacements[side]+=`; ${lostPackets[side]} lost with destroyed divisions`;}
        if(combatResult.retreats?.length){status.textContent=`Hour ${ti}/10 · ${combatResult.retreats.length} retreat/displacement move(s)`;await animateRetreat(combatResult.retreats);}
        if(combatResult.destroyed.length)await animateSurrender(combatResult.destroyed,before);
        if(selectedId&&byId(selectedId)?.destroyed){selectedId=null;renderer.setSelection(null);refreshChoices();}
        if(engagements.length||combatResult.destroyed.length)updateReport(selectedId?byId(selectedId):null);
        await sleep(20);
      }
      for(const d of data.scenario.divisions){
        if(d.destroyed)continue;
        d.supply=Math.max(-9,Math.min(1,(Number.isFinite(d.supply)?d.supply:1)+(turnSupply.get(d.id)?1:-1)));
        d.efficiency=Math.max(30,Math.min(100,(Number.isFinite(d.efficiency)?d.efficiency:100)+1));
        d.experience=Math.max(25,Math.min(150,(Number.isFinite(d.experience)?d.experience:75)+1));
        daySummary.remaining[d.side]+=d.strength;
      }
      for(const d of data.scenario.divisions){
        if(d.destroyed||d.strength<=0||Number(d.supply)>=0)continue;
        daySummary.negativeSupply[d.side].push({name:d.name||d.id,rating:Number(d.supply)});
        daySummary.supplyProblems[d.side]++;
      }
      for(const side of ['Blue','Red'])daySummary.negativeSupply[side].sort((a,b)=>a.name.localeCompare(b.name));
      cities.finishTurn();
      daySummary.routes=data.scenario.divisions.filter(d=>!d.destroyed&&planner.get(d.id).length>0).length;
      latestReport=daySummary;refreshDS();
      showReport();
      if(!combatAudit.length)document.getElementById('combatLog').textContent='No combat engagements yet.';
      status.textContent=`Day ${engine.day} complete — movement and combat resolved. Unfinished routes retained for next planning day.`;
      debugLog('Day complete',{day:engine.day,totalMoves:daySummary.moves});
      engine.nextDay();cities.awardTurn();cities.chargeMaintenance(engine.day);replacements.startDay(engine.day);tiLabel.textContent=`Day ${engine.day} · Planning`;updateGameClock();
      // Persist completed turn only after the next planning state is established.
      if(!saveGame(true))status.textContent+=' Warning: autosave failed; use Save Game.';
    }catch(error){debugLog('EXECUTION ERROR',{message:error.message,stack:error.stack});console.error(error);status.textContent='Execution error: '+error.message;window.alert('Movement execution failed: '+error.message);}
    finally{window.ARMAGEDDON_EXECUTION_HIDE_ROUTES=false;debugLog('runDay FINALLY',{day:engine.day,engineHour:engine.ti});renderer.visualPositions.clear();renderer.render();executing=false;readyButton.disabled=false;readyButton.textContent='Ready ▶';playtestButton.disabled=false;phaseLabel.textContent='PLANNING PHASE';window.ARMAGEDDON_ROUTES_FROZEN=false;window.ARMAGEDDON_FROZEN_LABELS=null;window.ARMAGEDDON_READY_GOLD_ROUTE=null;updateReport(selectedId?byId(selectedId):null);refreshChoices();}
  }
  // Single-player Ready: invoke the execution engine directly. Do not depend on
  // Single-player Ready: execute the 10-hour turn directly, with visible diagnostics.
  window.ARMAGEDDON_READY_BOUND=true;
  readyButton.addEventListener('click',async event=>{
    event.preventDefault();event.stopPropagation();
    if(executing){status.textContent='Turn execution is already running.';return;}
    readyButton.disabled=true;
    window.ARMAGEDDON_EXECUTION_HIDE_ROUTES=true;
    readyButton.textContent='Executing…';
    window.ARMAGEDDON_READY_GOLD_ROUTE=null; // Execution routes are red, including selected route.
    phaseLabel.textContent='STARTING EXECUTION';
    status.textContent='Ready clicked — beginning 10-hour turn…';
    try{
      hidePreview();
      // Snapshot both arrival-label values before movement starts. During
      // execution divisions consume route steps and movement credit changes;
      // neither event may alter the ETA printed on surviving route hexes.
      const labels=new Map();
      for(const d of data.scenario.divisions){
        let elapsed=Math.max(0,d.pauseTIs||0),from={col:d.col,row:d.row};
        for(const point of planner.get(d.id)){
          elapsed+=window.ARMAGEDDON_MOVEMENT.cost(d,data.terrainAt(point.col,point.row),from,point,data.terrainAt);
          const hour=Math.max(1,Math.ceil(elapsed-1e-9));
          labels.set(d.id+':'+point.col+','+point.row,{hour,turn:Math.min(9,Math.max(1,Math.floor((hour-1)/10)+1))});
          elapsed+=(point.pauseCount||0)+(point.pause?1:0);
          from=point;
        }
      }
      window.ARMAGEDDON_FROZEN_LABELS=labels;
      window.ARMAGEDDON_ROUTES_FROZEN=true;
      renderer.render();
      await runDay();
    }catch(error){
      console.error('Ready execution error',error);
      debugLog('READY EXECUTION ERROR',{message:String(error),stack:error?.stack});
      status.textContent='Execution failed: '+(error?.message||String(error));
      phaseLabel.textContent='EXECUTION ERROR';
      window.alert('Ready could not execute: '+(error?.message||String(error)));
    }finally{
      if(!executing){window.ARMAGEDDON_EXECUTION_HIDE_ROUTES=false;renderer.render();readyButton.disabled=false;readyButton.textContent='Ready ▶';}
    }
  });
  const SAVE_KEY='ARMAGEDDON_M3_SAVE';
  const TURN_START_KEY='ARMAGEDDON_M4_TURN_START';
  function saveGame(silent=false){if(executing&&!silent){alert('Save during planning, not during turn execution.');return false;}try{const snapshot={version:87,query:location.search,day:engine.day,ti:engine.ti,divisions:data.scenario.divisions,routes:[...planner.routes.entries()],playtest:planner.playtest,playtestSide:window.ARMAGEDDON_VIEW_MODE,treasury:cities.treasury,maintenanceChargedDay:engine.day,cityState:cities.state.map(x=>({pacification:x.pacification,production:x.production,owner:x.owner,occupier:x.occupier})),reserves:{Blue:cities.reserves.Blue.map(r=>({type:r.type,cityIndex:cities.state.indexOf(r.city),side:r.side,id:r.id})),Red:cities.reserves.Red.map(r=>({type:r.type,cityIndex:cities.state.indexOf(r.city),side:r.side,id:r.id}))},report:latestReport,dsDam:[...dsDam],replacementState:replacements.snapshot()};localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot));if(!silent)status.textContent='Game saved in this browser.';return true;}catch(e){if(!silent)alert('Unable to save: '+e.message);return false;}}
  function saveTurnStart(){
    // Save the same complete serializable game state as Save Game without overwriting the normal save.
    try{
      const prior=localStorage.getItem(SAVE_KEY);
      if(!saveGame(true))return false;
      const snapshot=localStorage.getItem(SAVE_KEY);
      localStorage.setItem(TURN_START_KEY,snapshot);
      if(prior===null)localStorage.removeItem(SAVE_KEY);else localStorage.setItem(SAVE_KEY,prior);
      return true;
    }catch(e){console.warn('Turn replay snapshot failed',e);return false;}
  }
  document.getElementById('saveGameButton').addEventListener('click',()=>saveGame());
  document.getElementById('replayTurnButton').addEventListener('click',()=>{
    if(executing){alert('Wait until turn execution finishes before replaying.');return;}
    const snapshot=localStorage.getItem(TURN_START_KEY);
    if(!snapshot){alert('No executed turn has been saved for replay yet.');return;}
    let parsed;try{parsed=JSON.parse(snapshot);}catch(e){alert('The turn-start snapshot is damaged.');return;}
    if(!confirm('Replay Day '+parsed.day+' from its original planning orders? Current progress since that turn began will be replaced.'))return;
    localStorage.setItem(SAVE_KEY,snapshot);
    const url=new URL(location.href);url.searchParams.set('loadSaved','1');
    url.searchParams.set('autoReplay','1');
    location.href=url.href;
  });
  function restoreSaved(){if(!new URLSearchParams(location.search).has('loadSaved'))return;let saved;try{saved=JSON.parse(localStorage.getItem(SAVE_KEY));}catch(e){}if(!saved){alert('No saved game available.');return;}try{data.scenario.divisions.splice(0,data.scenario.divisions.length,...saved.divisions);for(const d of data.scenario.divisions){d.stance='Hold';if(!Number.isFinite(d.experience))d.experience=75;}planner.routes=new Map(saved.routes||[]);setPlaytestSide(saved.playtestSide||'None');engine.day=saved.day;engine.ti=saved.ti||0;engine.lastRouteHeads=new Map(data.scenario.divisions.map(d=>[d.id,engine.head(d.id)]));Object.assign(cities.treasury,saved.treasury||{});(saved.cityState||[]).forEach((x,i)=>{if(cities.state[i]){cities.state[i].pacification=x.pacification;cities.state[i].production=x.production;cities.state[i].owner=x.owner||cities.state[i].city.side;cities.state[i].city.side=cities.state[i].owner;cities.state[i].occupier=x.occupier||null;}});for(const side of ['Blue','Red']){cities.reserves[side].length=0;for(const r of saved.reserves?.[side]||[])if(cities.state[r.cityIndex])cities.reserves[side].push({...r,city:cities.state[r.cityIndex]});}latestReport=saved.report||null;dsDam.clear();for(const [id,n] of saved.dsDam||[])dsDam.set(id,n);dsBattles=[];dsFiring=new Set();dsStart=new Map();dsEffStart=new Map();dsExpStart=new Map();dsModifiers=new Map();refreshDS();replacements.restore(saved.replacementState);if(saved.maintenanceChargedDay===engine.day)cities.setMaintenanceDay(engine.day);else cities.chargeMaintenance(engine.day);cities.render();tiLabel.textContent=`Day ${engine.day} · Planning`;updateGameClock();status.textContent='Saved game loaded.';renderer.render();}catch(e){alert('Could not restore saved game: '+e.message);}}
  restoreSaved();
  // Replay restores the entire saved turn-start state, then executes its original
  // orders automatically. Remove the one-shot flag before starting to avoid
  // repeating on refresh or subsequent navigation.
  if(new URLSearchParams(location.search).get('autoReplay')==='1'){
    const cleanUrl=new URL(location.href);
    cleanUrl.searchParams.delete('autoReplay');
    cleanUrl.searchParams.delete('loadSaved');
    history.replaceState(null,'',cleanUrl.href);
    requestAnimationFrame(()=>readyButton.click());
  }
  syncMp();
  // Make a first-turn autosave so Load Game works before the first completed turn.
  // Never overwrite an existing game merely by starting a new one.
  if(!new URLSearchParams(location.search).has('loadSaved')&&!localStorage.getItem(SAVE_KEY))saveGame(true);
  window.ARMAGEDDON_M3={engine,runDay,saveGame,get executing(){return executing;},cities};

  // Initial camera centers the map once layout dimensions are available.
  requestAnimationFrame(()=>{renderer.centerMap();renderer.render();});
  window.ARMAGEDDON_M2={planner,renderer,scenario:data.scenario,select:id=>{const d=byId(id);if(!d)throw new Error('Unknown division '+id);selectedId=id;renderer.setSelection(id);updateReport(d);refreshChoices();},clearSelection:()=>{selectedId=null;renderer.setSelection(null);updateReport(null);}};
})();
