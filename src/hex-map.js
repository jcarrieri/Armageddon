/* Pointy-top axial hex geometry and canvas map renderer. */
(function(global){
  const SQRT3=Math.sqrt(3);
  function axialToPixel(q,r,size){return {x:size*SQRT3*(q+r/2),y:size*1.5*r};}
  function pixelToAxial(x,y,size){
    const qf=(SQRT3/3*x-y/3)/size, rf=(2/3*y)/size;
    return axialRound(qf,rf);
  }
  function axialRound(q,r){
    const x=q,z=r,y=-x-z;let rx=Math.round(x),ry=Math.round(y),rz=Math.round(z);
    const dx=Math.abs(rx-x),dy=Math.abs(ry-y),dz=Math.abs(rz-z);
    if(dx>dy&&dx>dz)rx=-ry-rz;else if(dy>dz)ry=-rx-rz;else rz=-rx-ry;
    return {q:rx,r:rz};
  }
  function hexPoints(cx,cy,size){const pts=[];for(let i=0;i<6;i++){const a=(Math.PI/180)*(60*i-90);pts.push({x:cx+size*Math.cos(a),y:cy+size*Math.sin(a)});}return pts;}
  function drawHex(ctx,cx,cy,size,fill,stroke,lineWidth){const pts=hexPoints(cx,cy,size);ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.lineWidth=lineWidth;ctx.strokeStyle=stroke;ctx.stroke();return pts;}
  function hexKey(col,row){return `${col},${row}`;}
  function axialFromOffset(col,row){return {q:col-Math.floor(row/2),r:row};}
  function offsetFromAxial(q,r){return {col:q+Math.floor(r/2),row:r};}
  function terrainStyle(name){return ({Plains:{fill:"#778e63",detail:"#91a777"},Forest:{fill:"#496c4c",detail:"#67865b"},Hills:{fill:"#938765",detail:"#b3a47c"},River:{fill:"#507e91",detail:"#7db0c0"}})[name]||{fill:"#778e63",detail:"#91a777"};}
  class HexMapRenderer{
    constructor(canvas,scenario,terrainAt){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.scenario=scenario;this.terrainAt=terrainAt;this.baseSize=35;this.zoom=1;this.pan={x:0,y:0};this.selectedId=null;this.unitSymbolStyle='nato';this.unitArt={};for(const side of ['blue','red'])for(const type of ['infantry','motorized','mechanized','armored']){const key=side+'_'+type,img=new Image();img.onload=()=>this.render();img.src='src/unit_'+key+'.png';this.unitArt[key]=img;}this.hoverCell=null;this.routes=null;this.showZoc=false;this.showControl=false;this.showCities=false;this.showSupply=false;this.cityStates=null;this.showTerrainTypes=false;this.showWaterCrossings=false;this.playtest=false;this.visualPositions=new Map();this.satelliteLayer=null;this.cityTexture=null;this.forestTexture=null;this.lakeTexture=null;this.extraTextures={};this.hillHexes=[];this.approvedTerrain={};for(const name of ['rough','swamp','mountains','forest','city']){const image=new Image();image.onload=()=>{this.satelliteLayer=null;this.render();};image.src='src/'+name+'_approved.jpg';this.approvedTerrain[name]=image;}
      const cityImage=new Image();cityImage.onload=()=>{this.cityTexture=cityImage;this.satelliteLayer=null;this.render();};
      cityImage.src='src/city_texture.png';
      const forestImage=new Image();forestImage.onload=()=>{this.forestTexture=forestImage;this.satelliteLayer=null;this.render();};
      forestImage.src='src/forest_texture.png';
      const lakeImage=new Image();lakeImage.onload=()=>{this.lakeTexture=lakeImage;this.satelliteLayer=null;this.render();};lakeImage.src='src/lake_hex.png';const clearHexImage=new Image();clearHexImage.onload=()=>{this.clearHexImage=clearHexImage;this.satelliteLayer=null;this.render();};clearHexImage.src='src/clear_hex.png';this.approvedClear=new Image();this.approvedClear.onload=()=>{this.satelliteLayer=null;this.render();};this.approvedClear.src='src/clear_approved.jpg';this.clearVariants=[];for(let i=0;i<4;i++){const variant=new Image();variant.onload=()=>{this.satelliteLayer=null;this.render();};variant.src='src/clear_variant_'+(i+1)+'.jpg';this.clearVariants.push(variant);}for(const type of ['plains','hills','mountains','swamp']){const im=new Image();im.onload=()=>{this.extraTextures[type]=im;this.satelliteLayer=null;this.render();};im.src='src/'+type+'_texture.jpg';}for(let i=0;i<2;i++){const im=new Image();im.onload=()=>{this.hillHexes[i]=im;this.satelliteLayer=null;this.render();};im.src='src/hill_hex_'+(i?'b':'a')+'.png';}this.onSelect=()=>{};this.dpr=1;this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();}
    resize(){const rect=this.canvas.getBoundingClientRect();this.dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));this.canvas.width=Math.max(1,Math.floor(rect.width*this.dpr));this.canvas.height=Math.max(1,Math.floor(rect.height*this.dpr));this.clampPan();this.render();}
    get size(){return this.baseSize*this.zoom;}
    get dims(){return {w:this.canvas.width/this.dpr,h:this.canvas.height/this.dpr};}
    // Exact map bounds, including the hex radius. Never expose more off-map area than necessary.
    mapBounds(){
      const r=this.size, cols=this.scenario.cols, rows=this.scenario.rows;
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(const row of [0,rows-1])for(const col of [0,cols-1]){
        const a=axialFromOffset(col,row),p=axialToPixel(a.q,a.r,r);
        minX=Math.min(minX,p.x-r*SQRT3/2);maxX=Math.max(maxX,p.x+r*SQRT3/2);
        minY=Math.min(minY,p.y-r);maxY=Math.max(maxY,p.y+r);
      }
      return {minX,maxX,minY,maxY};
    }
    clampPan(){
      const b=this.mapBounds(),{w,h}=this.dims;
      const width=b.maxX-b.minX,height=b.maxY-b.minY;
      if(width<=w)this.pan.x=(w-width)/2-b.minX;
      else this.pan.x=Math.max(w-b.maxX,Math.min(-b.minX,this.pan.x));
      if(height<=h)this.pan.y=(h-height)/2-b.minY;
      else this.pan.y=Math.max(h-b.maxY,Math.min(-b.minY,this.pan.y));
    }
    centerMap(){const b=this.mapBounds(),{w,h}=this.dims;this.pan={x:w/2-(b.minX+b.maxX)/2,y:h/2-(b.minY+b.maxY)/2};this.clampPan();this.render();}
    centerOnHex(col,row){const p=this.worldPixel(col,row);this.pan.x+=this.dims.w/2-p.x;this.pan.y+=this.dims.h/2-p.y;this.clampPan();this.render();}
    targetNeedsTracking(col,row){const p=this.worldPixel(col,row),{w,h}=this.dims;return p.x<w*.10||p.x>w*.90||p.y<h*.10||p.y>h*.90;}
    resetView(){this.zoom=1;this.centerMap();}
    worldPixel(col,row){const a=axialFromOffset(col,row),p=axialToPixel(a.q,a.r,this.size);return {x:p.x+this.pan.x,y:p.y+this.pan.y};}
    screenToWorld(x,y){return {x:(x-this.pan.x)/this.size,y:(y-this.pan.y)/this.size};}
    hitTest(x,y){const w=this.screenToWorld(x,y),a=pixelToAxial(w.x,w.y,1),o=offsetFromAxial(a.q,a.r);if(o.col<0||o.row<0||o.col>=this.scenario.cols||o.row>=this.scenario.rows)return null;return o;}
    screenPointToHex(x,y){const w=this.screenToWorld(x,y),a=pixelToAxial(w.x,w.y,1),o=offsetFromAxial(a.q,a.r);return o.col>=0&&o.row>=0&&o.col<this.scenario.cols&&o.row<this.scenario.rows?o:null;}
    zoomAt(factor,x,y){const old=this.zoom,next=Math.max(.30,Math.min(1.8,old*factor));if(next===old)return;const worldX=(x-this.pan.x)/old,worldY=(y-this.pan.y)/old;this.zoom=next;this.pan.x=x-worldX*next;this.pan.y=y-worldY*next;this.clampPan();this.render();}
    setSelection(id){this.selectedId=id;this.render();}
    // M4.19: three-hex elevation-aware line of sight. Adjacent enemies are always spotted.
    // Cube-coordinate interpolation samples all intervening hexes, including hex-edge
    // ambiguities (both sides of an exact boundary) so obstruction cannot be bypassed.
    terrainElevation(col,row){
      const t=String(this.terrainAt(col,row)||'').toLowerCase();
      return t.includes('mountain')?3:(t.includes('hill')||t.includes('rough'))?2:1;
    }
    lineOfSight(observer,target){
      const hex=global.ARMAGEDDON_HEX;
      const a=hex.axialFromOffset(observer.col,observer.row),b=hex.axialFromOffset(target.col,target.row);
      const dx=b.q-a.q,dz=b.r-a.r,dy=-dx-dz;
      const range=Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz));
      if(range>3)return false;
      if(range<=1)return true;
      const e1=this.terrainElevation(observer.col,observer.row),e2=this.terrainElevation(target.col,target.row);
      if(e1===3||e2===3)return true;
      const blocks=(c,r)=>{
        if(c<0||r<0||c>=this.scenario.cols||r>=this.scenario.rows)return false;
        const t=String(this.terrainAt(c,r)||'').toLowerCase();
        if(e1===1&&e2===1)return t.includes('wood')||t.includes('forest')||t.includes('swamp')||t.includes('hill')||t.includes('rough')||t.includes('mountain');
        return t.includes('mountain');
      };
      for(let step=1;step<range;step++){
        const t=step/range;
        // Small cube-coordinate nudges resolve exact edge crossings conservatively.
        for(const epsilon of [-1e-6,1e-6]){
          const x=a.q+dx*t+epsilon,z=a.r+dz*t+epsilon,y=-x-z;
          let rx=Math.round(x),ry=Math.round(y),rz=Math.round(z);
          const ex=Math.abs(rx-x),ey=Math.abs(ry-y),ez=Math.abs(rz-z);
          if(ex>ey&&ex>ez)rx=-ry-rz;else if(ey>ez)ry=-rx-rz;else rz=-rx-ry;
          const cell=hex.offsetFromAxial?hex.offsetFromAxial(rx,rz):null;
          if(cell&&blocks(cell.col,cell.row))return false;
        }
      }
      return true;
    }
    // M5.22: normal single-player (None) always uses the player's intelligence.
    // All counter drawing, hit-testing and detail panels share this predicate.
    spottingDistance(a,b){
      const x=axialFromOffset(a.col,a.row),y=axialFromOffset(b.col,b.row);
      const dq=x.q-y.q,dr=x.r-y.r;
      return Math.max(Math.abs(dq),Math.abs(dr),Math.abs(dq+dr));
    }
    spottingTerrain(d){
      return String(this.terrainAt(d.col,d.row)||'').trim().toLowerCase();
    }
    visibilityInfo(d){
      if(!d||d.destroyed||d.strength<=0)return {visible:false,reason:'inactive'};
      const mode=window.ARMAGEDDON_VIEW_MODE||'None';
      if(mode==='Both')return {visible:true,reason:'both-playtest'};
      const side=mode==='Red'?'Red':mode==='Blue'?'Blue':(window.ARMAGEDDON_SETUP?.playerSide||'Blue');
      if(d.side===side)return {visible:true,reason:'friendly',side};
      const terrain=this.spottingTerrain(d);
      // Actual urban terrain is authoritative; also check the city's explicit
      // footprint if provided by the city controller (not just the city label).
      const urban=terrain==='urban'||terrain==='city'||Boolean(this.cityForHex?.(d.col,d.row));
      const concealed=urban||/forest|wood|swamp|mountain/.test(terrain);
      const maxRange=concealed?1:3;
      let nearest=Infinity;
      for(const f of this.scenario.divisions){
        if(f.side!==side||f.destroyed||f.strength<=0)continue;
        const distance=this.spottingDistance(f,d);
        nearest=Math.min(nearest,distance);
        if(distance<=maxRange)return {visible:true,reason:'spotted',terrain,urban,maxRange,nearest:distance,side};
      }
      return {visible:false,reason:'out-of-range',terrain,urban,maxRange,nearest,side};
    }
    visibleDivision(d){return this.visibilityInfo(d).visible;}
    // Sovereignty persists where neither army currently projects control.
    // Occupation overrides all ZOCs; opposing adjacent ZOCs make an empty hex contested.
    refreshHexControl(){
      const cols=this.scenario.cols,rows=this.scenario.rows;
      if(!this.hexOwners || this.hexOwners.length!==cols*rows){
        this.hexOwners=Array.from({length:cols*rows},(_,i)=>{
          const col=i%cols,row=Math.floor(i/cols),border=window.ARMAGEDDON_BORDER;
          return border&&border[col]!==undefined?(row<border[col]?'Red':'Blue'):(row<rows/2?'Red':'Blue');
        });
      }
      const occupied=new Map(),zocs={Blue:new Set(),Red:new Set()};
      const zocApi=global.ARMAGEDDON_ZOC;
      for(const d of this.scenario.divisions){
        if(d.destroyed||d.strength<=0||!['Blue','Red'].includes(d.side))continue;
        occupied.set(`${d.col},${d.row}`,d.side);
        if(zocApi)for(const n of zocApi.neighbors(d,this.scenario))zocs[d.side].add(`${n.col},${n.row}`);
      }
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const k=`${col},${row}`,i=row*cols+col;
        if(occupied.has(k)){this.hexOwners[i]=occupied.get(k);continue;}
        const blue=zocs.Blue.has(k),red=zocs.Red.has(k);
        if(blue&&red)this.hexOwners[i]='Contested';
        else if(blue)this.hexOwners[i]='Blue';
        else if(red)this.hexOwners[i]='Red';
        // No ZOC: retain prior territorial status.
      }
    }
    controlAt(col,row){
      if(!this.hexOwners)this.refreshHexControl();
      return this.hexOwners[row*this.scenario.cols+col];
    }
    render(){if(!this.ctx||!this.canvas.width)return;const ctx=this.ctx,{w,h}=this.dims;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle="#334a3a";ctx.fillRect(0,0,w,h);
      // M3.16: continuous satellite-inspired raster landscape with the hex grid drawn above it.
      if(!this.satelliteLayer)this.buildSatelliteLayer();
      if(this.satelliteLayer){const layer=this.satelliteLayer;ctx.drawImage(layer.canvas,layer.minX*this.zoom+this.pan.x,layer.minY*this.zoom+this.pan.y,layer.width*this.zoom,layer.height*this.zoom);}
      // Always-visible, prominent hex boundaries. Terrain is underneath, not hex-shaped tiles.
      ctx.save();ctx.lineWidth=Math.max(.65,.85*this.zoom);ctx.strokeStyle="rgba(17,34,29,.36)";
      for(let row=0;row<this.scenario.rows;row++)for(let col=0;col<this.scenario.cols;col++){
        const c=this.worldPixel(col,row);const pts=hexPoints(c.x,c.y,this.size);
        ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.closePath();ctx.stroke();
      }ctx.restore();
      // M5.09 diagnostic: visualize the exact hexsides charged as crossings.
      // This uses the SAME canonical keys read by movement.js, not river proximity.
      if(this.showWaterCrossings){
        ctx.save();ctx.lineWidth=Math.max(3,4*this.zoom);ctx.lineCap='round';
        for(const [keys,color] of [[window.ARMAGEDDON_RIVER_KEYS,'#ff4e43'],[window.ARMAGEDDON_STREAM_KEYS,'#f7dc42']]){
          if(!keys)continue;ctx.strokeStyle=color;
          for(const edge of keys){
            const parts=edge.split('|');if(parts.length!==2)continue;
            const [ac,ar]=parts[0].split(',').map(Number),[bc,br]=parts[1].split(',').map(Number);
            const a=this.worldPixel(ac,ar),b=this.worldPixel(bc,br);
            const va=hexPoints(a.x,a.y,this.size),vb=hexPoints(b.x,b.y,this.size);
            const shared=[];for(const v of va)for(const w of vb)if(Math.hypot(v.x-w.x,v.y-w.y)<.2)shared.push(v);
            if(shared.length!==2)continue;
            ctx.beginPath();ctx.moveTo(shared[0].x,shared[0].y);ctx.lineTo(shared[1].x,shared[1].y);ctx.stroke();
          }
        }
        ctx.restore();
      }
      // Labels are deliberately subdued so the grid stays prominent.
      for(let row=0;row<this.scenario.rows;row++)for(let col=0;col<this.scenario.cols;col++){const c=this.worldPixel(col,row);ctx.fillStyle="#e0e7cf99";ctx.font=`${Math.max(7,8*this.zoom)}px ui-monospace,monospace`;ctx.textAlign="center";ctx.textBaseline="middle";if(this.zoom>.68)ctx.fillText(`${col},${row}`,c.x,c.y+this.size*.54);}
      if(this.showZoc&&global.ARMAGEDDON_ZOC){
        const areas=global.ARMAGEDDON_ZOC.visualAreas({...this.scenario,divisions:this.scenario.divisions.filter(d=>this.visibleDivision(d))},1);
        for(let row=0;row<this.scenario.rows;row++)for(let col=0;col<this.scenario.cols;col++){
          const k=`${col},${row}`,bd=areas.Blue.get(k),rd=areas.Red.get(k);
          if(bd===undefined&&rd===undefined)continue;
          const c=this.worldPixel(col,row),both=bd!==undefined&&rd!==undefined;
          const near=Math.min(bd===undefined?2:bd,rd===undefined?2:rd);
          ctx.save();ctx.beginPath();const pts=hexPoints(c.x,c.y,this.size*.93);
          ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.closePath();
          ctx.fillStyle=both?`rgba(198,93,228,${.38+(1-near)*.11})`:bd!==undefined?`rgba(37,147,255,${.38+(1-near)*.11})`:`rgba(255,71,77,${.38+(1-near)*.11})`;
          ctx.fill();
          ctx.strokeStyle=both?'#ecb4ff':bd!==undefined?'#67baff':'#ff9292';
          ctx.lineWidth=Math.max(1.3,this.zoom*1.65);ctx.stroke();ctx.restore();
        }
      }
      // Dynamic ownership: refresh on every render, including movement and retreats.
      this.refreshHexControl();
      // High-contrast ownership overlay, with underlying terrain still legible.
      if(this.showControl){
        for(let row=0;row<this.scenario.rows;row++)for(let col=0;col<this.scenario.cols;col++){
          const side=this.controlAt(col,row),c=this.worldPixel(col,row),pts=hexPoints(c.x,c.y,this.size*.965);
          ctx.save();ctx.beginPath();pts.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();
          ctx.fillStyle=side==='Blue'?'rgba(22,93,248,.43)':side==='Red'?'rgba(239,33,48,.43)':'rgba(45,45,49,.76)';ctx.fill();
          ctx.lineWidth=Math.max(.8,this.zoom);ctx.strokeStyle=side==='Blue'?'rgba(140,206,255,.85)':side==='Red'?'rgba(255,170,174,.85)':'rgba(150,155,162,.95)';ctx.stroke();ctx.restore();
        }
      }
      // Optional terrain identification overlay; drawn above art, below orders and counters.
      if(this.showTerrainTypes){
        const icons={Plains:'·',Forest:'♠',Hills:'⌃',Mountains:'▲',Urban:'▦',Lake:'≈',Swamp:'♣',River:'≈'};
        for(let row=0;row<this.scenario.rows;row++)for(let col=0;col<this.scenario.cols;col++){
          const c=this.worldPixel(col,row),type=this.terrainAt(col,row);
          ctx.save();ctx.font=`bold ${Math.max(12,this.size*.37)}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.lineWidth=2.8;ctx.strokeStyle='rgba(0,0,0,.85)';ctx.fillStyle='#fff8d9';
          ctx.strokeText(icons[type]||'·',c.x,c.y);ctx.fillText(icons[type]||'·',c.x,c.y);ctx.restore();
        }
      }
      // Draw national frontier on exact shared hex sides, not through hex centers.
      // Alternating magenta frontier dashes leave waterway blue visible on shared hex sides.
      // The dark magenta halo keeps the frontier legible across both land and water.
      ctx.save();ctx.strokeStyle='#a735e8';ctx.lineWidth=Math.max(3,4*this.zoom);ctx.setLineDash([Math.max(9,12*this.zoom),Math.max(5,7*this.zoom)]);
      const borders=window.ARMAGEDDON_BORDER||[];
      const edgeIndex=new Set();
      for(let row=0;row<this.scenario.rows;row++)for(let col=0;col<this.scenario.cols;col++){
        const here=row<(borders[col]??this.scenario.rows/2)?'Red':'Blue';
        const c=this.worldPixel(col,row),points=hexPoints(c.x,c.y,this.size);
        for(let j=0;j<6;j++){
          const v=points[j],w=points[(j+1)%6];
          // Neighbor center is across the midpoint of this hex side.
          const mx=(v.x+w.x)/2,my=(v.y+w.y)/2;
          const nx=c.x+2*(mx-c.x),ny=c.y+2*(my-c.y);
          const cell=this.hitTest(nx,ny);
          if(!cell||cell.col===col&&cell.row===row)continue;
          const there=cell.row<(borders[cell.col]??this.scenario.rows/2)?'Red':'Blue';
          if(here===there)continue;
          const edge=[`${v.x.toFixed(2)},${v.y.toFixed(2)}`,`${w.x.toFixed(2)},${w.y.toFixed(2)}`].sort().join('|');
          if(edgeIndex.has(edge))continue;edgeIndex.add(edge);
          ctx.beginPath();ctx.moveTo(v.x,v.y);ctx.lineTo(w.x,w.y);ctx.stroke();
        }
      }
      ctx.restore();
      // City production overlay: center markers remain readable over terrain.
      if(this.showCities&&this.cityStates){
        ctx.save();
        for(const entry of this.cityStates){
          // M5.32: enemy city production/pacification is not public intelligence.
          // In normal single-player (None), use the player's side, as for unit spotting.
          const viewMode=window.ARMAGEDDON_VIEW_MODE||'None';
          const observer=viewMode==='Red'?'Red':viewMode==='Blue'?'Blue':(window.ARMAGEDDON_SETUP?.playerSide||window.ARMAGEDDON_PLAYER_SIDE||'Blue');
          if(viewMode!=='Both' && entry.owner!==observer)continue;
          const city=entry.city,pt=this.worldPixel(city.c,city.r);
          const pacifying=!!entry.occupier&&entry.occupier!==entry.owner;
          const producing=!!entry.production;
          const color=pacifying?'#e879f9':producing?'#20e38b':'#ffbf48';
          // Production status covers the entire city hex, not a center circle.
          const verts=hexPoints(pt.x,pt.y,this.size*.995);
          ctx.beginPath();verts.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();
          ctx.fillStyle=pacifying?'rgba(165,65,216,.65)':producing?'rgba(18,180,49,.56)':'rgba(246,133,15,.59)';ctx.fill();
          ctx.strokeStyle=color;ctx.lineWidth=Math.max(2,2.6*this.zoom);ctx.stroke();
        }
        ctx.restore();
      }
      // City names identify settlements and capitals without hiding unit counters.
      ctx.save();ctx.font=`bold ${Math.max(10,11*this.zoom)}px Arial`;ctx.textAlign='center';ctx.textBaseline='bottom';
      for(const city of (window.ARMAGEDDON_CITIES||[])){
        const pt=this.worldPixel(city.c,city.r);
        if(city.isCapital){
          // Gold star identifies the one three-hex capital of each nation.
          const x=pt.x,y=pt.y-this.size*.94,r=Math.max(13,this.size*.43);
          ctx.save();ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.46:r;ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}ctx.closePath();ctx.fillStyle='#ffe747';ctx.strokeStyle='#0a1018';ctx.lineWidth=4;ctx.fill();ctx.stroke();ctx.restore();
        }
        ctx.lineWidth=3;ctx.strokeStyle='#111b1e';ctx.fillStyle=city.side==='Blue'?'#a8d9ff':'#ffd1cb';ctx.strokeText(city.name+(city.isCapital?' ★':''),pt.x,pt.y-this.size*.46);ctx.fillText(city.name+(city.isCapital?' ★':''),pt.x,pt.y-this.size*.46);
      }ctx.restore();
      if(this.showReplacements&&this.replacementPackets){
        ctx.save();
        for(const packet of this.replacementPackets){
          if(window.ARMAGEDDON_VIEW_MODE!=='Both'&&packet.side!==(window.ARMAGEDDON_PLAYER_SIDE||'Blue'))continue;
          const p=this.worldPixel(packet.col,packet.row);
          const target=this.scenario.divisions.find(d=>d.id===packet.targetId);
          if(target&&!target.destroyed){
            const q=this.worldPixel(target.col,target.row);
            ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
            ctx.strokeStyle='#ffffffb8';ctx.lineWidth=Math.max(1.5,this.zoom*1.5);
            ctx.setLineDash([6,5]);ctx.stroke();ctx.setLineDash([]);
          }
          const type=(target?.type||'Infantry').toLowerCase();
          // White silhouettes: infantry soldier, motorized truck, mechanized halftrack, armored tank.
          const k=Math.max(0.55,this.size/35);
          ctx.save();ctx.translate(p.x,p.y);ctx.scale(k,k);
          ctx.shadowColor='#07121a';ctx.shadowBlur=5;ctx.shadowOffsetY=1;
          ctx.fillStyle='#ffffff';ctx.strokeStyle='#ffffff';ctx.lineWidth=2.6;ctx.lineCap='round';ctx.lineJoin='round';
          this.drawUnitSilhouette(ctx,type);
          ctx.restore();
        }
        ctx.restore();
      }
      if(this.showEndPositions)this.drawEndPositions(ctx);
      for(const d of this.scenario.divisions)if(this.visibleDivision(d))this.drawDivision(ctx,d);
      // Route markers and arrows must appear ABOVE all unit counters.
      this.drawRoutes(ctx);
      if(this.hoverCell){const c=this.worldPixel(this.hoverCell.col,this.hoverCell.row);drawHex(ctx,c.x,c.y,this.size,"#ffffff08","#fff8",2);}
    }
    buildSatelliteLayer(){
      const S=this.baseSize, cols=this.scenario.cols, rows=this.scenario.rows;
      const points=[];let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const a=axialFromOffset(c,r),p=axialToPixel(a.q,a.r,S);
        points.push({c,r,x:p.x,y:p.y,t:this.terrainAt(c,r)});
        minX=Math.min(minX,p.x-S);maxX=Math.max(maxX,p.x+S);
        minY=Math.min(minY,p.y-S);maxY=Math.max(maxY,p.y+S);
      }
      const scale=.85,W=Math.ceil((maxX-minX)*scale),H=Math.ceil((maxY-minY)*scale);
      const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
      const g=canvas.getContext('2d');g.scale(scale,scale);g.translate(-minX,-minY);
      const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7+18.91)*43758.5453;return n-Math.floor(n);};
      const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;};
      const colors={Plains:'#9eaa71',Forest:'#3b6542',Hills:'#88915c',Mountains:'#77766c',Urban:'#a7a59b',River:'#508aa5',Lake:'#427f9f',Swamp:'#387d83'};
      // Regions share edges but have coherent landforms rather than randomized tile types.
      for(const p of points){const verts=hexPoints(p.x,p.y,S+1);g.beginPath();verts.forEach((v,i)=>i?g.lineTo(v.x,v.y):g.moveTo(v.x,v.y));g.closePath();g.fillStyle=colors[p.t==='River'?'Plains':p.t]||colors.Plains;g.fill();}
      // Fine aerial texture and elevation shading, confined to each hex's true terrain type.
      for(const p of points){
        g.save();g.beginPath();hexPoints(p.x,p.y,S).forEach((v,i)=>i?g.lineTo(v.x,v.y):g.moveTo(v.x,v.y));g.closePath();g.clip();
        if(p.t==='Plains'||p.t==='River'){
          const shades=['#b9bb83','#a3b47a','#bfc08b','#a6b784'];
          for(let j=0;j<5;j++){const x=p.x+(hash(p.c*8+j,p.r)-.5)*S*2,y=p.y+(hash(p.c,p.r*9+j)-.5)*S*2;g.fillStyle=shades[Math.floor(hash(j+p.c,p.r)*4)];g.globalAlpha=.45;g.fillRect(x-S*.6,y-S*.3,S*1.2,S*.55);}
          g.globalAlpha=.3;g.strokeStyle='#4f6943';g.lineWidth=1.1;g.beginPath();g.moveTo(p.x-S,p.y-S*.22);g.lineTo(p.x+S,p.y+S*.25);g.stroke();
        }else if(p.t==='Forest'){
          for(let j=0;j<55;j++){const x=p.x+(hash(p.c*101+j,p.r)-.5)*S*2,y=p.y+(hash(p.c,p.r*89+j)-.5)*S*2,r=2+hash(j,p.c+p.r)*4;g.fillStyle=j%3===0?'#234b30':j%3===1?'#557b49':'#315c38';g.globalAlpha=.65;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();}
        }else if(p.t==='Hills'){
          for(let j=0;j<7;j++){const y=p.y+(j-3)*S*.19;g.beginPath();g.moveTo(p.x-S,y+6);g.bezierCurveTo(p.x-S*.4,y-12,p.x+S*.3,y+11,p.x+S,y-5);g.strokeStyle=j%2?'#d5c58a':'#586f4c';g.globalAlpha=.55;g.lineWidth=2.3;g.stroke();}
        }else if(p.t==='Mountains'){
          g.fillStyle='#4d4e4c';g.globalAlpha=.85;g.beginPath();g.moveTo(p.x-S,p.y+S);g.lineTo(p.x-S*.2,p.y-S*.7);g.lineTo(p.x+S*.1,p.y-S*.3);g.lineTo(p.x+S*.6,p.y-S);g.lineTo(p.x+S,p.y+S);g.fill();
          g.fillStyle='#c2c1b5';g.globalAlpha=.8;g.beginPath();g.moveTo(p.x-S*.2,p.y-S*.7);g.lineTo(p.x+S*.1,p.y-S*.3);g.lineTo(p.x-S*.02,p.y+S*.45);g.fill();
          g.strokeStyle='#d4d2c7';g.lineWidth=2;g.beginPath();g.moveTo(p.x-S*.2,p.y-S*.7);g.lineTo(p.x+S*.1,p.y-S*.3);g.lineTo(p.x+S*.6,p.y-S);g.stroke();
        }else if(p.t==='Swamp'){
          for(let j=0;j<14;j++){const x=p.x+(hash(p.c+j,p.r)-.5)*S*1.6,y=p.y+(hash(p.c,p.r+j)-.5)*S*1.6;g.fillStyle=j%2?'#1e7f9c':'#3a9963';g.globalAlpha=.7;g.beginPath();g.ellipse(x,y,4+hash(j,p.c)*8,2+hash(j,p.r)*3,0,0,Math.PI*2);g.fill();}
        }else if(p.t==='Lake'){
          for(let j=0;j<5;j++){g.strokeStyle='#a1c9d1';g.globalAlpha=.3;g.lineWidth=1;g.beginPath();g.moveTo(p.x-S*.7,p.y+(j-2)*7);g.quadraticCurveTo(p.x,p.y+(j-2)*7-4,p.x+S*.7,p.y+(j-2)*7);g.stroke();}
        }
        g.restore();
      }
      // Each clear hex displays the complete user-supplied hex artwork independently.
      // Do not use a continuous landscape texture or crop random farmland patches.
      for(const p of points){
        if(p.t==='Plains'||p.t==='River'){
          const variantIndex=Math.floor(hash(p.c+137,p.r+271)*4);
          const variant=this.clearVariants&&this.clearVariants[variantIndex];
          const im=this.approvedClear?.complete&&this.approvedClear.naturalWidth?this.approvedClear:(variant&&variant.complete&&variant.naturalWidth?variant:this.clearHexImage);
          if(!im||!im.complete||!im.naturalWidth)continue;
          g.save();g.beginPath();hexPoints(p.x,p.y,S+.25).forEach((v,i)=>i?g.lineTo(v.x,v.y):g.moveTo(v.x,v.y));g.closePath();g.clip();
          const halfW=S*Math.sqrt(3)/2;
          g.drawImage(im,p.x-halfW,p.y-S,halfW*2,S*2);
          g.restore();
          continue;
        }
        const name=({Hills:'rough',Mountains:'mountains',Swamp:'swamp',Forest:'forest',Urban:'city'})[p.t];
        // City art is drawn after roads, below. All other approved terrain is drawn here.
        if(!name||name==='city')continue;
        const im=this.approvedTerrain[name];if(!im||!im.complete||!im.naturalWidth)continue;
        g.save();g.beginPath();hexPoints(p.x,p.y,S+.35).forEach((v,i)=>i?g.lineTo(v.x,v.y):g.moveTo(v.x,v.y));g.closePath();g.clip();
        const halfW=S*Math.sqrt(3)/2;
        g.drawImage(im,p.x-halfW,p.y-S,halfW*2,S*2);
        g.restore();
      }
      // M4.68: feather differing land terrain across shared hexsides.
      // The hex outline is drawn separately at render time and remains sharp.
      // This is a visual effect only; terrainAt and movement/combat are untouched.
      const blendColors={Plains:'#87a653',River:'#87a653',Forest:'#365c34',Hills:'#a18c62',Mountains:'#c2c8ca',Swamp:'#266c70'};
      const byCoord=new Map(points.map(p=>[hexKey(p.c,p.r),p]));
      for(const p of points){
        if(!blendColors[p.t])continue;
        const verts=hexPoints(p.x,p.y,S);
        for(let i=0;i<6;i++){
          const a=verts[i],b=verts[(i+1)%6];
          const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
          const nx=(mx-p.x)/Math.hypot(mx-p.x,my-p.y),ny=(my-p.y)/Math.hypot(mx-p.x,my-p.y);
          const across=pixelToAxial(mx+nx*S*.65,my+ny*S*.65,S);
          const off=offsetFromAxial(across.q,across.r);
          const other=byCoord.get(hexKey(off.col,off.row));
          if(!other||other.t===p.t||!blendColors[other.t]||p.r>other.r||(p.r===other.r&&p.c>other.c))continue;
          const width=S*.38;
          const grad=g.createLinearGradient(mx-nx*width/2,my-ny*width/2,mx+nx*width/2,my+ny*width/2);
          grad.addColorStop(0,blendColors[p.t]);grad.addColorStop(.5,blendColors[p.t]);
          grad.addColorStop(.501,blendColors[other.t]);grad.addColorStop(1,blendColors[other.t]);
          // A translucent softening strip over both neighboring aerial textures.
          g.save();g.globalAlpha=.30;g.strokeStyle=grad;g.lineWidth=width;
          g.lineCap='butt';g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();g.restore();
        }
      }
      // Pure blue lake fill; no embedded shorelines or vegetation.
      for(const p of points.filter(p=>p.t==='Lake')){
        g.save();g.beginPath();hexPoints(p.x,p.y,S+.4).forEach((v,i)=>i?g.lineTo(v.x,v.y):g.moveTo(v.x,v.y));g.closePath();
        g.fillStyle='#126da4';g.fill();g.restore();
      }
      // Draw smooth connected waterways and roads. Previously this helper was missing,
      // causing a ReferenceError midway through map generation (the all-green screen).
      const strokePath=(points,width,color)=>{
        if(!points||points.length<2)return;
        g.save();g.beginPath();g.moveTo(points[0].x,points[0].y);
        for(let i=1;i<points.length;i++)g.lineTo(points[i].x,points[i].y);
        g.strokeStyle=color;g.lineWidth=width;g.lineCap='round';g.lineJoin='round';g.stroke();g.restore();
      };
      // Multiple seeded rivers, ending at map boundaries; streams run on hex sides.
      const riverDensity=(window.ARMAGEDDON_DENSITY||{}).rivers||'normal';
      const riverWidth={low:7,normal:9,high:11}[riverDensity]||9;
      // Major rivers use actual hex sides, just like streams.
      for(const [a,b] of (window.ARMAGEDDON_RIVER_EDGES||[])){
        const pa={x:a.x*S,y:a.y*S},pb={x:b.x*S,y:b.y*S};
        strokePath([pa,pb],riverWidth+3,'#234d67');strokePath([pa,pb],riverWidth,'#277ba9');
        strokePath([pa,pb],1.3,'#7fd2ee');
      }
      // Stream coordinates are shared hex vertices in normalized hex units.
      // The entire polyline consists of actual hex sides; no center fragments.
      for(const [a,b] of (window.ARMAGEDDON_STREAM_EDGES||[])){
        const pa={x:a.x*S,y:a.y*S},pb={x:b.x*S,y:b.y*S};
        strokePath([pa,pb],5.2,'#103b59');strokePath([pa,pb],3.2,'#05aee5');strokePath([pa,pb],1.15,'#c6f7ff');
      }
      // Roads connect city centers, including bridges over the river.
      const cityCenters=(window.ARMAGEDDON_CITIES||[]).map(c=>[c.c,c.r]);
      const center=(c,r)=>{const a=axialFromOffset(c,r);return axialToPixel(a.q,a.r,S);};
      // Logical road graph: connect all cities with a minimum-spanning backbone,
      // then add short local connections. Avoid a spiderweb of long crossing roads.
      const sites=cityCenters.map(([c,r])=>center(c,r));
      const distance=(i,j)=>Math.hypot(sites[i].x-sites[j].x,sites[i].y-sites[j].y);
      const edgeSet=new Set(),edges=[];
      const addEdge=(i,j)=>{if(i===j)return;const k=[Math.min(i,j),Math.max(i,j)].join(':');if(!edgeSet.has(k)){edgeSet.add(k);edges.push([i,j]);}};
      if(sites.length){
        const connected=new Set([0]);
        while(connected.size<sites.length){let best=null;
          for(const i of connected)for(let j=0;j<sites.length;j++)if(!connected.has(j)){
            const d=distance(i,j);if(!best||d<best.d)best={i,j,d};
          }
          if(!best)break;addEdge(best.i,best.j);connected.add(best.j);
        }
        // Additional regional highways: join towns across longer distances,
        // including links between different local road clusters. Cap links to
        // avoid a dense spiderweb on large maps.
        const longLinks=Math.max(2,Math.round(sites.length/11));
        const candidates=[];
        for(let i=0;i<sites.length;i++){
          const ordered=sites.map((_,j)=>({j,d:distance(i,j)})).filter(v=>v.j!==i).sort((a,b)=>a.d-b.d);
          const near=ordered[0]?.d||1;
          for(const v of ordered.slice(3,Math.min(ordered.length,12))){
            if(i<v.j && v.d>near*2.0)candidates.push({i,j:v.j,d:v.d});
          }
        }
        candidates.sort((a,b)=>a.d-b.d);
        const degree=new Map();let added=0;
        for(const e of candidates){
          if(added>=longLinks)break;
          if((degree.get(e.i)||0)>=2||(degree.get(e.j)||0)>=2)continue;
          const key=[e.i,e.j].join(':');if(edgeSet.has(key))continue;
          addEdge(e.i,e.j);degree.set(e.i,(degree.get(e.i)||0)+1);
          degree.set(e.j,(degree.get(e.j)||0)+1);added++;
        }
        // A secondary connection for most towns, prioritizing nearby neighbors.
        for(let i=0;i<sites.length;i++){
          const near=sites.map((_,j)=>({j,d:distance(i,j)})).filter(v=>v.j!==i).sort((a,b)=>a.d-b.d);
          if(near.length){addEdge(i,near[0].j);if(near.length>1&&hash(i,51)>.32)addEdge(i,near[1].j);}
        }
      }
      // Roads are sequences of adjacent hex CENTERS, never arbitrary splines.
      const offsetNeighbors=(c,r)=>((r&1)?[[1,0],[-1,0],[0,-1],[1,-1],[0,1],[1,1]]:[[1,0],[-1,0],[-1,-1],[0,-1],[-1,1],[0,1]]).map(([dc,dr])=>[c+dc,r+dr]).filter(([x,y])=>x>=0&&y>=0&&x<cols&&y<rows);
      const axialDist=(c,r,x,y)=>{const a=axialFromOffset(c,r),b=axialFromOffset(x,y),dq=a.q-b.q,dr=a.r-b.r;return Math.max(Math.abs(dq),Math.abs(dr),Math.abs(dq+dr));};
      const routeRoad=(a,b)=>{const k=(c,r)=>c+','+r, start=k(...a),goal=k(...b),queue=[a],seen=new Set([start]),prev=new Map();
        while(queue.length){const [c,r]=queue.shift();if(k(c,r)===goal)break;const ns=offsetNeighbors(c,r).sort((u,v)=>axialDist(...u,...b)-axialDist(...v,...b));for(const [x,y] of ns){const key=k(x,y);if(seen.has(key)||this.terrainAt(x,y)==='Lake')continue;seen.add(key);prev.set(key,[c,r]);queue.push([x,y]);}}
        if(!seen.has(goal))return [];let cur=b,path=[cur];while(k(...cur)!==start){cur=prev.get(k(...cur));if(!cur)return [];path.push(cur);}return path.reverse().map(([c,r])=>center(c,r));};
      // Publish the exact road hex-to-hex connections for movement and route ETA.
      const roadKeys=new Set();
      for(const [i,j] of edges){
        const pts=routeRoad(cityCenters[i],cityCenters[j]);
        if(pts.length){
          for(let k=1;k<pts.length;k++){
            const a=pts[k-1],b=pts[k];
            const ca=window.ARMAGEDDON_HEX.offsetFromPixel?.(a.x,a.y,S);
            // Road graph uses the same center coordinates as the drawn line.
            const centerKey=p=>{
              const row=Math.round(p.y/(1.5*S));
              const col=Math.round(p.x/(Math.sqrt(3)*S)-(row%2)*.5);
              return `${col},${row}`;
            };
            roadKeys.add([centerKey(a),centerKey(b)].sort().join('|'));
          }
          // Curved road appearance: each connection still follows the exact
          // passable hex-center route; gentle bends never alter the road graph.
          const curvedRoad=(width,color)=>{
            g.save();g.beginPath();g.moveTo(pts[0].x,pts[0].y);
            for(let n=1;n<pts.length;n++){
              const a=pts[n-1],b=pts[n],dx=b.x-a.x,dy=b.y-a.y;
              const len=Math.hypot(dx,dy)||1;
              const wiggle=(hash(i*131+j*17+n,83)-.5)*Math.min(25,len*.62);
              const mx=(a.x+b.x)/2-dy/len*wiggle,my=(a.y+b.y)/2+dx/len*wiggle;
              g.quadraticCurveTo(mx,my,b.x,b.y);
            }
            g.lineWidth=width;g.strokeStyle=color;g.lineJoin='round';g.lineCap='round';g.stroke();g.restore();
          };
          curvedRoad(7,'#101214');curvedRoad(1.1,'#616669');
        }
      }
      window.ARMAGEDDON_ROAD_KEYS=roadKeys;
      // User-supplied aerial city art, masked to Urban hexes. Hex borders are drawn later.
      // Each urban hex remains an independent terrain cell; the graphic does not alter rules.
      for(const p of points.filter(p=>p.t==='Urban')){
        g.save();g.beginPath();hexPoints(p.x,p.y,S+0.4).forEach((v,i)=>i?g.lineTo(v.x,v.y):g.moveTo(v.x,v.y));g.closePath();g.clip();
        if(this.cityTexture||this.approvedTerrain.city?.naturalWidth){
          const im=this.approvedTerrain.city?.complete&&this.approvedTerrain.city.naturalWidth?this.approvedTerrain.city:this.cityTexture;
          const halfW=S*Math.sqrt(3)/2;g.drawImage(im,p.x-halfW,p.y-S,halfW*2,S*2);
        }else{
          g.fillStyle='#77736e';g.fillRect(p.x-S,p.y-S,2*S,2*S);
          g.strokeStyle='#303135';g.lineWidth=4;
          for(let i=-1;i<=1;i++){g.beginPath();g.moveTo(p.x+i*18,p.y-S);g.lineTo(p.x+i*18,p.y+S);g.stroke();}
        }
        g.restore();
      }
      this.satelliteLayer={canvas,minX,minY,width:W/scale,height:H/scale};
    }
    drawEndPositions(ctx){
      // One-turn (10 TI) read-only projection, with enemy destinations permitted.
      // A projected assault stops at the occupied hex; it does not assume victory.
      const movement=window.ARMAGEDDON_MOVEMENT;
      const terrainAt=window.ARMAGEDDON_DATA.terrainAt;
      const predicted=new Map();
      const divisions=this.scenario.divisions.filter(d=>!d.destroyed&&d.strength>0);
      const occupied=new Map(divisions.map(d=>[`${d.col},${d.row}`,d]));
      for(const d of divisions){
        const route=this.routes?.get(d.id)||[];
        // Preview only the current day's 10 execution hours, never the
        // complete plotted route. Carry forward accrued TIs for the first leg.
        let credit=Math.max(0,Number(d.tis)||0);
        let hours=10;
        let waiting=Math.max(0,Number(d.pauseTIs)||0);
        let from={col:d.col,row:d.row};
        for(const p of route){
          if(hours<=0)break;
          const occupant=occupied.get(`${p.col},${p.row}`);
          if(occupant&&occupant.id!==d.id&&occupant.side===d.side)break;
          const c=movement.cost(d,terrainAt(p.col,p.row),from,p,terrainAt,
            Boolean(occupant&&occupant.side!==d.side));
          if(!Number.isFinite(c))break;
          // Simulate hours accumulating movement TIs, including scheduled pauses.
          while(hours>0&&credit+1e-9<c){
            hours--;credit++;
            if(waiting>0)waiting--;
          }
          if(waiting>0){const n=Math.min(waiting,hours);hours-=n;waiting-=n;credit+=n;}
          if(credit+1e-9<c)break;
          // A funded entry is executed within this day's available hours.
          // A hostile destination represents an assault, not assumed capture.
          credit=Math.max(0,credit-c);
          occupied.delete(`${from.col},${from.row}`);
          if(!occupant)occupied.set(`${p.col},${p.row}`,d);
          from={col:p.col,row:p.row};
          if(occupant&&occupant.side!==d.side)break;
          waiting+=(p.pauseCount||0)+(p.pause?1:0);
        }
        predicted.set(d.id,from);
      }
      // When opposing divisions share a projected destination, offset both
      // counters horizontally to keep both visible.
      const groups=new Map();
      for(const d of divisions){const p=predicted.get(d.id)||d,k=`${p.col},${p.row}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(d);}
      for(const group of groups.values()){
        if(group.length<2||new Set(group.map(d=>d.side)).size<2)continue;
        const base=predicted.get(group[0].id);
        const pixel=this.worldPixel(base.col,base.row);
        for(const d of group){const p=predicted.get(d.id);predicted.set(d.id,{...p,previewOffsetX:d.side==='Blue'?-this.size*.33:this.size*.33});}
      }
      this.previewPositions=predicted;
      ctx.save();ctx.fillStyle='#061f2bdc';ctx.fillRect(8,8,360,30);
      ctx.fillStyle='#ffffff';ctx.font='bold 13px Arial';ctx.fillText('PROJECTED END OF CURRENT DAY — READ ONLY',17,28);ctx.restore();
    }
    drawRoutes(ctx){
      if(!this.routes || window.ARMAGEDDON_EXECUTION_HIDE_ROUTES)return;
      // Paint the selected gold route last, above every red route.
      const routeDrawOrder=[...this.scenario.divisions].sort((a,b)=>(a.id===this.selectedId?1:0)-(b.id===this.selectedId?1:0));
      for(const d of routeDrawOrder){
        if(d.destroyed||d.strength<=0)continue;
        if(d.side!==(window.ARMAGEDDON_PLAYER_SIDE||"Blue")&&window.ARMAGEDDON_VIEW_MODE!=="Both")continue;
        const route=this.routes.get(d.id);
        if((d.pauseTIs||0)>0){
          const p=this.worldPixel(d.col,d.row);
          ctx.save();ctx.font='bold 15px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillStyle='#ffffff';ctx.strokeStyle='#182536';ctx.lineWidth=4;
          const label='Ⅱ'+d.pauseTIs;
          ctx.strokeText(label,p.x+this.size*.45,p.y-this.size*.5);
          ctx.fillText(label,p.x+this.size*.45,p.y-this.size*.5);ctx.restore();
        }
        if(!route.length)continue;
        const selected=!window.ARMAGEDDON_ROUTES_FROZEN&&(d.id===this.selectedId||d.id===window.ARMAGEDDON_READY_GOLD_ROUTE);
        ctx.save();
        ctx.strokeStyle=selected?"#ffdf55":"#f14b55";
        ctx.lineWidth=selected?4:3;
        ctx.lineCap="round";ctx.lineJoin="round";
        ctx.setLineDash([Math.max(7,11*this.zoom),Math.max(5,8*this.zoom)]);
        ctx.beginPath();
        const start=this.worldPixel(d.col,d.row);
        ctx.moveTo(start.x,start.y);
        for(const point of route){const p=this.worldPixel(point.col,point.row);ctx.lineTo(p.x,p.y);}
        ctx.stroke();ctx.setLineDash([]);
        // Estimated remaining TIs, rounded up, using the actual movement costs.
        const movement=window.ARMAGEDDON_MOVEMENT;
        const terrainAt=window.ARMAGEDDON_DATA.terrainAt;
        let total=0,previousCell={col:d.col,row:d.row};
        for(const point of route){total+=(point.pauseCount||0)+(point.pause?1:0);total+=movement.cost(d,terrainAt(point.col,point.row),previousCell,point,terrainAt);previousCell=point;}
        const eta=Math.max(0,Math.ceil(total-Math.max(0,d.tis||0)-1e-9));
        // Show only the number of hours remaining to reach each route hex.
        let elapsed=Math.max(0,d.pauseTIs||0)-Number(d.tis||0);
        // Current TIs are accumulated movement credit, not elapsed hours.
        let from={col:d.col,row:d.row};
        for(const point of route){
          const stepCost=movement.cost(d,terrainAt(point.col,point.row),from,point,terrainAt);
          elapsed+=stepCost;
          const arrivalTI=Math.max(1,Math.ceil(elapsed-1e-9)); // Hours from now, not unspent movement credit
          const frozen=window.ARMAGEDDON_ROUTES_FROZEN?window.ARMAGEDDON_FROZEN_LABELS?.get(d.id+':'+point.col+','+point.row):null;
          const p=this.worldPixel(point.col,point.row);
          const r=Math.max(10,Math.min(17,this.size*.32));
          const cx=p.x,cy=p.y-this.size*.57;
          ctx.beginPath();ctx.ellipse(cx,cy,r*1.24,r*1.24,0,0,Math.PI*2);
          ctx.fillStyle=selected?'#ffe072':'#ff7075';ctx.fill();
          ctx.strokeStyle='#172332';ctx.lineWidth=2;ctx.stroke();
          ctx.fillStyle='#111927';ctx.font=`bold ${Math.round(r*1.2)}px Arial`;
          const hour=frozen?frozen.hour:arrivalTI;
          ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(hour),cx,cy);
          elapsed+=(point.pauseCount||0)+(point.pause?1:0);
          from=point;
        }
        // Each route hex contains an arrow toward the NEXT route hex.
        // The last hex points along the incoming leg, so the endpoint is still directional.
        for(let i=0;i<route.length;i++){
          const point=route[i],p=this.worldPixel(point.col,point.row);
          const neighbor=i<route.length-1?route[i+1]:point;
          const previous=i<route.length-1?point:(i>0?route[i-1]:d);
          const a=this.worldPixel(previous.col,previous.row);
          const b=this.worldPixel(neighbor.col,neighbor.row);
          const angle=Math.atan2(b.y-a.y,b.x-a.x);
          const scale=Math.max(5,Math.min(11,this.size*.23));
          ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(scale*.95,0);
          ctx.lineTo(-scale*.55,-scale*.65);
          ctx.lineTo(-scale*.24,0);
          ctx.lineTo(-scale*.55,scale*.65);
          ctx.closePath();
          ctx.fillStyle=(point.pauseCount||point.pause)?"#ffffff":"#35e8ff";
          ctx.strokeStyle="#102b38";
          ctx.lineWidth=Math.max(1.2,this.zoom*1.4);
          ctx.fill();ctx.stroke();ctx.restore();
          // Preserve the approved pause marker, offset so it doesn't obscure direction.
          if((point.pauseCount||0)>0||point.pause){
            const count=(point.pauseCount||0)+(point.pause?1:0);
            const offset=Math.max(8,scale*.95);
            ctx.beginPath();ctx.arc(p.x+offset,p.y-offset,6,0,Math.PI*2);
            ctx.fillStyle="#ffffff";ctx.fill();ctx.strokeStyle="#252525";ctx.lineWidth=1.5;ctx.stroke();
            ctx.fillStyle="#252525";ctx.font="bold 9px Arial";
            ctx.textAlign="center";ctx.textBaseline="middle";
            ctx.fillText("Ⅱ"+count,p.x+offset,p.y-offset);
          }
        }
        ctx.restore();
      }
    }
    drawTerrainDetail(ctx,x,y,s,terrain,detail){ctx.save();ctx.globalAlpha=.45;if(terrain==="Forest"){for(const dx of [-.28,0,.28]){ctx.fillStyle="#263f30";ctx.beginPath();ctx.moveTo(x+dx*s,y-.16*s);ctx.lineTo(x+(dx-.13)*s,y+.13*s);ctx.lineTo(x+(dx+.13)*s,y+.13*s);ctx.closePath();ctx.fill();ctx.fillStyle=detail;ctx.fillRect(x+dx*s-s*.025,y+.1*s,s*.05,s*.13);}}else if(terrain==="Hills"){ctx.strokeStyle=detail;ctx.lineWidth=Math.max(1,s*.035);for(let i=0;i<2;i++){ctx.beginPath();ctx.moveTo(x-s*.4,y+s*(i*.18));ctx.quadraticCurveTo(x-s*.1,y-s*.34+s*i*.16,x+s*.4,y+s*(i*.18));ctx.stroke();}}else if(terrain==="River"){ctx.strokeStyle=detail;ctx.lineWidth=Math.max(1,s*.055);ctx.beginPath();ctx.moveTo(x-s*.35,y-s*.25);ctx.quadraticCurveTo(x-s*.05,y,x+s*.05,y-s*.05);ctx.quadraticCurveTo(x+s*.2,y-s*.1,x+s*.35,y+s*.25);ctx.stroke();}else{ctx.strokeStyle=detail;ctx.lineWidth=1;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(x-s*.25+i*s*.12,y+s*.06);ctx.lineTo(x-s*.18+i*s*.12,y-s*.02);ctx.stroke();}}ctx.restore();}
    drawUnitSilhouette(ctx,type){
      type=String(type||'Infantry').toLowerCase();
      ctx.fillStyle='#ffffff';ctx.strokeStyle='#ffffff';ctx.lineWidth=2.6;ctx.lineCap='round';ctx.lineJoin='round';
      if(type.includes('inf')){
        ctx.beginPath();ctx.arc(0,-11,3.6,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(-2,3);ctx.moveTo(-1,-2);ctx.lineTo(-8,4);ctx.moveTo(0,-2);ctx.lineTo(7,2);ctx.moveTo(-2,3);ctx.lineTo(-8,12);ctx.moveTo(-2,3);ctx.lineTo(7,11);ctx.stroke();
      }else if(type.includes('mot')){
        ctx.fillRect(-13,-6,16,10);ctx.fillRect(3,-3,7,7);ctx.fillRect(6,-7,4,4);
        ctx.fillStyle='#ffffff';for(const x of [-8,7]){ctx.beginPath();ctx.arc(x,6,3.5,0,Math.PI*2);ctx.fill();}
      }else if(type.includes('mech')){
        ctx.beginPath();ctx.moveTo(-14,-4);ctx.lineTo(10,-4);ctx.lineTo(14,3);ctx.lineTo(10,7);ctx.lineTo(-11,7);ctx.closePath();ctx.fill();
        ctx.fillRect(-7,-9,13,5);ctx.beginPath();ctx.moveTo(-7,7);ctx.lineTo(10,7);ctx.stroke();
        for(const x of [-8,-2,4,10]){ctx.beginPath();ctx.arc(x,8,2.2,0,Math.PI*2);ctx.fill();}
      }else{
        ctx.beginPath();ctx.moveTo(-15,1);ctx.lineTo(-11,-6);ctx.lineTo(9,-6);ctx.lineTo(15,1);ctx.lineTo(11,7);ctx.lineTo(-11,7);ctx.closePath();ctx.fill();
        ctx.fillRect(-5,-11,10,6);ctx.fillRect(3,-9,15,2.8);
        ctx.fillStyle='#ffffff';for(const x of [-10,-4,2,8]){ctx.beginPath();ctx.arc(x,7,2.6,0,Math.PI*2);ctx.fill();}
      }
    }
    drawDivision(ctx,d){
      // Defense in depth: no animation or alternate drawing path can reveal an unspotted unit.
      if(!this.visibleDivision(d))return;
      const position=(this.showEndPositions&&this.previewPositions?.get(d.id))||this.visualPositions.get(d.id)||d;
      const c=position.pixelX!==undefined?{x:position.pixelX*this.zoom+this.pan.x,y:position.pixelY*this.zoom+this.pan.y}:this.worldPixel(position.col,position.row);
      if(this.showEndPositions&&position.previewOffsetX)c.x+=position.previewOffsetX;
      const s=this.size,blue=d.side==='Blue';
      // M5.62: Supply shortage is indicated by a large colored S, never by
      // recoloring the unit counter. Do not disclose enemy supply under fog of war.
      const friendly=d.side===(window.ARMAGEDDON_PLAYER_SIDE||'Blue')||window.ARMAGEDDON_VIEW_MODE==='Both';
      const rating=Number.isFinite(Number(d.supply))?Number(d.supply):1;
      const fill=blue?'#174e92':'#a71e29';
      const stroke=blue?'#a5d8ff':'#ffb0b0';
      const w=Math.max(26,s*1.14),h=Math.max(27,s*.88),top=c.y-h/2;
      ctx.save();ctx.shadowColor='#000b';ctx.shadowBlur=4;ctx.fillStyle=fill;ctx.strokeStyle=stroke;
      ctx.lineWidth=this.selectedId===d.id?3:1.4;ctx.beginPath();ctx.roundRect(c.x-w/2,top,w,h,3);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
      if(this.unitSymbolStyle==='silhouettes'){
        // White silhouettes cropped from the supplied Redonia/Blue unit artwork.
        const type=String(d.type).toLowerCase();
        const art=this.unitArt[(blue?'blue_':'red_')+type];
        if(art&&art.complete&&art.naturalWidth){
          const scale=Math.min(w*.89/art.naturalWidth,h*.82/art.naturalHeight);
          const iw=art.naturalWidth*scale,ih=art.naturalHeight*scale;
          ctx.drawImage(art,c.x-iw/2,c.y-ih/2,iw,ih);
        }else{
          const k=Math.min(w/35,h/31)*0.94;
          ctx.save();ctx.translate(c.x,c.y);ctx.scale(k,k);this.drawUnitSilhouette(ctx,d.type);ctx.restore();
        }
      }else{
      // NATO APP-6 style branch symbols: infantry crossed diagonals, motorized infantry
      // with wheels, mechanized infantry with tracks, armor as a horizontal oval.
      const symY=c.y,sw=w*.86,sh=h*.76;
      ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1.2,this.zoom*1.4);ctx.lineCap='round';
      ctx.strokeRect(c.x-sw/2,symY-sh/2,sw,sh);
      const type=d.type;
      if(type==='Infantry'||type==='Motorized'||type==='Mechanized'){
        ctx.beginPath();ctx.moveTo(c.x-sw/2,symY-sh/2);ctx.lineTo(c.x+sw/2,symY+sh/2);ctx.moveTo(c.x+sw/2,symY-sh/2);ctx.lineTo(c.x-sw/2,symY+sh/2);ctx.stroke();
      }
      if(type==='Armored'||type==='Mechanized'){
        ctx.beginPath();ctx.ellipse(c.x,symY,sw*.36,sh*.34,0,0,Math.PI*2);ctx.stroke();
      }
      if(type==='Motorized'){
        // Large, high-contrast filled wheels placed clear of the NATO box.
        const wheelR=Math.max(2.2,this.zoom*2.6);
        for(const x of [c.x-sw*.30,c.x+sw*.30]){
          ctx.beginPath();ctx.arc(x,symY+sh*.43,wheelR+1.1,0,Math.PI*2);
          ctx.fillStyle='#071726';ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=Math.max(1.4,this.zoom*1.8);ctx.stroke();
          ctx.beginPath();ctx.arc(x,symY+sh*.43,Math.max(1.1,wheelR*.45),0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();
        }
      }
      }
      ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font=`bold ${Math.max(9,10*this.zoom)}px Arial`;
      // Division identification remains available in the division report; no number on counters.
      // Consecutive morale-failure retreat turns: show the count, not an X.
      const retreatCount=Math.max(0,Number(d.moraleFailureStreak)||0);
      if(retreatCount>0){
        const r=Math.max(8,Math.min(14,w*.20)),bx=c.x+w/2-1,by=top+1;
        ctx.fillStyle='#d92332';ctx.strokeStyle='#fff';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(bx,by,r,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.font=`900 ${retreatCount>=10?Math.max(9,r*.95):Math.max(12,r*1.4)}px Arial`;
        ctx.fillText(String(retreatCount),bx,by+1);
      }
      // Supply overlay: colored halo identifies independent supply-route and SR states.
      // Purple = both; cyan = out of supply only; amber = negative rating only.
      // Friendly/visible divisions only, respecting fog of war.
      if(this.showSupply&&friendly){
        const connected=this.supplyAvailability?.get(d.id);
        if(connected!==undefined){
          const out=!connected,negative=rating<0;
          const color=out&&negative?'#d26aff':out?'#36e5ed':negative?'#ffbb38':null;
          if(color){
            ctx.save();ctx.shadowBlur=8;ctx.shadowColor=color;ctx.strokeStyle=color;
            ctx.lineWidth=Math.max(3,2.8*this.zoom);ctx.setLineDash([]);
            ctx.strokeRect(c.x-w/2-4,top-4,w+8,h+8);ctx.restore();
          }
        }
      }
      // Visible on the division counter regardless of the supply overlay toggle.
      // SR 0/+1 has no marker; -1/-2 yellow, -3..-5 orange, -6 and below white.
      if(friendly&&rating<0){
        const markerColor=rating>=-2?'#ffe044':rating>=-5?'#ff922e':'#ffffff';
        const fs=Math.max(17,Math.min(30,w*.56));
        const mx=c.x-w*.34,my=top+h*.70;
        ctx.font=`900 ${fs}px Arial`;
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.lineJoin='round';ctx.lineWidth=Math.max(3,fs*.24);
        ctx.strokeStyle='#101820';ctx.strokeText('S',mx,my);
        ctx.fillStyle=markerColor;ctx.fillText('S',mx,my);
      }
      if(this.selectedId===d.id){ctx.strokeStyle='#f5d77a';ctx.lineWidth=2.5;ctx.setLineDash([4,3]);ctx.beginPath();ctx.arc(c.x,c.y,s*.7,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
      ctx.restore();
    }
  }
  global.ARMAGEDDON_HEX={HexMapRenderer,axialToPixel,pixelToAxial,axialRound,hexPoints,axialFromOffset,offsetFromAxial,hexKey};
})(window);
