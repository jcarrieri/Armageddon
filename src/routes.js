/* M2.7 planning routes. Each destination extends the existing route. */
(function(global){
  const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
  function adjacent(a,b){const x=global.ARMAGEDDON_HEX.axialFromOffset(a.col,a.row),y=global.ARMAGEDDON_HEX.axialFromOffset(b.col,b.row);return directions.some(([dq,dr])=>x.q+dq===y.q&&x.r+dr===y.r);}
  function same(a,b){return a.col===b.col&&a.row===b.row;}
  class RoutePlanner{
    constructor(scenario){this.scenario=scenario;this.routes=new Map();this.playtest=false;}
    setPlaytest(enabled){this.playtest=Boolean(enabled);}
    get(id){return this.routes.get(id)||[];}
    append(id,cell){const d=this.scenario.divisions.find(x=>x.id===id);if(!d||(window.ARMAGEDDON_VIEW_MODE!=='Both'&&d.side!==(window.ARMAGEDDON_PLAYER_SIDE||'Blue')))return {ok:false,reason:'Enable Playtest Mode to order Red divisions.'};
      if(!cell||cell.col<0||cell.row<0||cell.col>=this.scenario.cols||cell.row>=this.scenario.rows)return {ok:false,reason:'Destination is outside the map.'};
      const route=this.get(id),from=route.length?route[route.length-1]:d;
      if(!adjacent(from,cell))return {ok:false,reason:'Select an adjacent hex.'};
      if(['Lake'].includes(global.ARMAGEDDON_DATA.terrainAt(cell.col,cell.row)))return {ok:false,reason:'Impassable terrain.'};
      if(route.some(x=>same(x,cell))||same(d,cell))return {ok:false,reason:'Route cannot loop back on itself.'};
      route.push({col:cell.col,row:cell.row,pause:false});this.routes.set(id,route);return {ok:true};
    }
    // Plot a shortest-hex path from the division to ANY clicked destination; break equal-length ties by travel time.
    // Enemy-occupied hexes are valid explicit destinations (attack orders); neither enemy-occupied nor enemy-ZOC hexes may be intermediate waypoints.
    plotTo(id,cell){
      const d=this.scenario.divisions.find(x=>x.id===id);
      if(!d||(window.ARMAGEDDON_VIEW_MODE!=='Both'&&d.side!==(window.ARMAGEDDON_PLAYER_SIDE||'Blue')))return {ok:false,reason:'Enable Playtest Mode to order Red divisions.'};
      if(!cell||cell.col<0||cell.row<0||cell.col>=this.scenario.cols||cell.row>=this.scenario.rows)return {ok:false,reason:'Destination is outside the map.'};
      const blocked=new Set(this.scenario.divisions.filter(x=>!x.destroyed&&x.strength>0&&x.side!==d.side).map(x=>`${x.col},${x.row}`));
      // Enemy ZOC hexes are impassable as intermediate automatic-route waypoints.
      // The requested destination remains selectable even when inside enemy ZOC.
      const enemyZoc=global.ARMAGEDDON_ZOC.compute(this.scenario)[global.ARMAGEDDON_ZOC.enemySide(d.side)];
      const target=`${cell.col},${cell.row}`;
      if(!Number.isFinite(global.ARMAGEDDON_MOVEMENT.cost(d,global.ARMAGEDDON_DATA.terrainAt(cell.col,cell.row),null,cell,global.ARMAGEDDON_DATA.terrainAt)))return {ok:false,reason:'That destination terrain is impassable for this unit.'};
      const key=x=>`${x.col},${x.row}`;
      const existing=this.get(id);
      const start=existing.length?existing[existing.length-1]:{col:d.col,row:d.row};
      if(same(start,cell))return {ok:false,reason:'Destination is already the end of the route.'};
      // An explicitly clicked adjacent hex always wins over automatic routing.
      if(adjacent(start,cell)){
        if(existing.some(x=>same(x,cell))||same(d,cell))return {ok:false,reason:'Route cannot loop back on itself.'};
        this.routes.set(id,[...existing,{col:cell.col,row:cell.row,pause:false}]);return {ok:true};
      }
      // Preserve the plotted route and pause waypoints. Do not loop through
      // an earlier route hex or the division's starting hex.
      const occupiedRoute=new Set([key(d),...existing.map(key)]);
      if(occupiedRoute.has(target))return {ok:false,reason:'Destination is already on this route. Use Escape to shorten it.'};
      // Dijkstra: minimize total movement time; break equal-time ties by fewer hexes.
      const terrainAt=global.ARMAGEDDON_DATA.terrainAt;
      const moveCost=global.ARMAGEDDON_MOVEMENT.cost;
      const distances=new Map([[key(start),0]]),steps=new Map([[key(start),0]]),prev=new Map();
      const heap=[];
      const push=(node,score)=>{heap.push({node,score});let i=heap.length-1;while(i>0){const parent=(i-1)>>1;if(heap[parent].score<=score)break;heap[i]=heap[parent];i=parent;}heap[i]={node,score};};
      const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&heap[c+1].score<heap[c].score)c++;if(heap[c].score>=last.score)break;heap[i]=heap[c];i=c;}heap[i]=last;}return top;};
      push(start,0);let found=false;
      while(heap.length){
        const {node:here,score}=pop();if(score>distances.get(key(here))+1e-9)continue;
        if(key(here)===target){found=true;break;}
        const a=global.ARMAGEDDON_HEX.axialFromOffset(here.col,here.row);
        for(const [dq,dr] of directions){
          const r=a.r+dr,q=a.q+dq,next={col:q+Math.floor(r/2),row:r};
          if(next.col<0||next.row<0||next.col>=this.scenario.cols||next.row>=this.scenario.rows)continue;
          const k=key(next);if(((blocked.has(k)||enemyZoc.has(k))&&k!==target)||occupiedRoute.has(k))continue;
          const cost=moveCost(d,terrainAt(next.col,next.row),here,next,terrainAt);
          if(!Number.isFinite(cost))continue;
          const candidate=score+cost;
          const nextSteps=(steps.get(key(here))||0)+1;
          const old=distances.get(k)??Infinity;
          if(candidate<old-1e-9||(Math.abs(candidate-old)<=1e-9&&nextSteps<(steps.get(k)??Infinity))){
            distances.set(k,candidate);steps.set(k,nextSteps);prev.set(k,here);push(next,candidate);
          }
        }
      }
      if(!found)return {ok:false,reason:'No legal path to that hex.'};
      const path=[];let k=target;
      while(k!==key(start)){const [col,row]=k.split(',').map(Number);path.push({col,row,pause:false});k=key(prev.get(k));}
      path.reverse();this.routes.set(id,[...existing,...path]);return {ok:true};
    }
    addPause(id,cell){
      const d=this.scenario.divisions.find(x=>x.id===id);
      if(!d||(window.ARMAGEDDON_VIEW_MODE!=='Both'&&d.side!==(window.ARMAGEDDON_PLAYER_SIDE||'Blue')))return {ok:false,reason:'This division cannot receive orders.'};
      if(!cell)return {ok:false,reason:'Right-click the division or a hex on its plotted route to add a pause.'};
      if(same(d,cell)){
        d.pauseTIs=(d.pauseTIs||0)+1;
        return {ok:true,count:d.pauseTIs,location:'current hex'};
      }
      const point=this.get(id).find(x=>same(x,cell));
      if(!point)return {ok:false,reason:'Right-click a route hex to add a pause.'};
      point.pauseCount=(point.pauseCount||0)+1;
      delete point.pause;
      return {ok:true,count:point.pauseCount,location:'route hex'};
    }
    // Escape removes the most recently added pause, then the last route hex.
    undo(id){const route=this.get(id);if(!route.length){const d=this.scenario.divisions.find(x=>x.id===id);if(d&&d.pauseTIs>0){d.pauseTIs--;return true;}return false;}const lastPause=[...route].reverse().find(x=>(x.pauseCount||0)>0);if(lastPause){lastPause.pauseCount--;}else{route.pop();}return true;}

  }
  global.ARMAGEDDON_ROUTES={RoutePlanner,adjacent};
})(window);
