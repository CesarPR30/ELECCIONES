/* Perú 2026 · Segunda Vuelta — tema claro, mapa + burbujas (d3) + scrollytelling */
if('scrollRestoration' in history) history.scrollRestoration='manual';   // evita el salto al refrescar
const FP = 8, JP = 10;
const C = {jp:'#5fba51', fp:'#f26d35', jpD:'#3f9b34', fpD:'#d8521c'};
const tintJP = d3.interpolateRgb('#e3f1de', '#2f8a25');
const tintFP = d3.interpolateRgb('#fbe0d2', '#c8470f');
const fmt = n => d3.format(",")(Math.round(n)).replace(/,/g,' ');
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

let NAT, PROV, DEP, EXT, LIMA, WORLD, projection, path, rScale, maxEmit, vsSim=null;
const W=720, H=800;
const svg = d3.select('#map');
const gProv = svg.append('g'), gDep = svg.append('g'), gBub = svg.append('g'), gAnno = svg.append('g');
const tip = d3.select('#tooltip');

const winColor = p => p.winner===JP ? C.jp : C.fp;
const choro = p => (p.winner===JP?tintJP:tintFP)(clamp(p.margin/45,0,1)*0.82+0.18);

// ---------- tooltip ----------
function showTip(ev,p){
  tip.html(`
    <h4>${p.prov||p.pais||p.dist} <small>· ${p.dep||p.continente||(p.dist?'Lima':'')}</small></h4>
    <div class="tt-bar"><i style="width:${p.pct_jp}%;background:${C.jp}"></i><i style="width:${p.pct_fp}%;background:${C.fp}"></i></div>
    <div class="row"><span>Sánchez</span><b style="color:${C.jpD}">${p.pct_jp}%</b></div>
    <div class="row"><span>Fujimori</span><b style="color:${C.fpD}">${p.pct_fp}%</b></div>
    ${p.votos_emitidos!=null?`<div class="row"><span>Votos emitidos</span><b>${fmt(p.votos_emitidos)}</b></div>`:''}
    ${p.emitidos!=null?`<div class="row"><span>Votos emitidos</span><b>${fmt(p.emitidos)}</b></div>`:''}
    ${p.participacion!=null?`<div class="row"><span>Participación</span><b>${p.participacion}%</b></div>`:''}
    ${p.actas_pend!=null&&p.actas_total?`<div class="row"><span>Actas</span><b>${fmt(p.actas_total-p.actas_pend)}/${fmt(p.actas_total)}</b></div>`:''}`)
    .style('left',Math.min(ev.clientX+14,innerWidth-260)+'px')
    .style('top',(ev.clientY+14)+'px').attr('hidden',null);
}
const hideTip = ()=>tip.attr('hidden',true);
// tooltip para países sin votos peruanos registrados
function showNoData(ev,name){
  tip.html(`<h4>${name||'—'}</h4><div class="row"><span>Sin votos peruanos registrados</span></div>`)
    .style('left',Math.min(ev.clientX+14,innerWidth-260)+'px')
    .style('top',(ev.clientY+14)+'px').attr('hidden',null);
}
// tooltip enfocado a un solo partido (al pasar por su tramo de barra)
function showPartyTip(ev,party,p){
  const j=party==='jp';
  const name=j?'Roberto Sánchez':'Keiko Fujimori', sub=j?'Juntos por el Perú':'Fuerza Popular';
  const col=j?C.jpD:C.fpD, pct=j?p.pct_jp:p.pct_fp;
  const votos=j?(p.votos_jp??p.jp):(p.votos_fp??p.fp);
  tip.html(`<h4 style="color:${col}">${name} <small>· ${sub}</small></h4>
    <div class="row"><span>Porcentaje</span><b style="color:${col}">${(+pct).toFixed(2)}%</b></div>
    ${votos!=null?`<div class="row"><span>Votos</span><b>${fmt(votos)}</b></div>`:''}`)
    .style('left',Math.min(ev.clientX+14,innerWidth-260)+'px')
    .style('top',(ev.clientY+14)+'px').attr('hidden',null);
}

// ---------- mapa base ----------
function drawMap(){
  projection = d3.geoMercator().fitSize([W,H], PROV);
  path = d3.geoPath(projection);
  maxEmit = d3.max(PROV.features, f=>f.properties.votos_emitidos);
  rScale = d3.scaleSqrt().domain([0,maxEmit]).range([2,50]);

  gProv.selectAll('path').data(PROV.features).join('path')
    .attr('class','prov').attr('d',path).attr('fill','#eef1f5')
    .on('mousemove',(e,d)=>showTip(e,d.properties)).on('mouseleave',hideTip);

  gDep.selectAll('path').data(DEP.features).join('path')
    .attr('class','dep-line').attr('d',path);

  gBub.selectAll('circle').data(PROV.features.filter(f=>f.geometry)).join('circle')
    .attr('class','bub')
    .attr('cx',d=>path.centroid(d)[0]).attr('cy',d=>path.centroid(d)[1])
    .attr('r',0).attr('fill',d=>winColor(d.properties)).attr('fill-opacity',.82)
    .on('mousemove',(e,d)=>showTip(e,d.properties)).on('mouseleave',hideTip);
}

// ---------- escenas ----------
const mapwrap = document.getElementById('mapwrap');
const panelEl = document.getElementById('panel');
function useMap(on){ if(vsSim){vsSim.stop();} if(bubSim){bubSim.stop();} mapwrap.hidden=!on; panelEl.hidden=on; }

function setLegend(html){ d3.select('#legend').html(html).style('display',html?'block':'none'); }
const legWinner = `<div class="ttl">Ganó la provincia</div>
  <div class="row"><span class="sw" style="background:${C.jp}"></span>Roberto Sánchez (Juntos por el Perú)</div>
  <div class="row"><span class="sw" style="background:${C.fp}"></span>Keiko Fujimori (Fuerza Popular)</div>`;
// leyenda única: barra de degradé verde→naranja con los extremos rotulados
const legGradient = `<div class="leg-grad">
  <span class="lg-end" style="color:${C.jpD}">Sánchez</span>
  <div class="lg-bar"></div>
  <span class="lg-end" style="color:${C.fpD}">Fujimori</span>
</div>`;

function annoLima(text){
  gAnno.selectAll('*').remove();
  const lima = PROV.features.find(f=>f.properties.prov==='LIMA'&&f.properties.dep==='LIMA');
  if(!lima||!text) return;
  const [x,y]=path.centroid(lima);
  gAnno.append('text').attr('class','maplabel').attr('x',x+rScale(lima.properties.votos_emitidos)+6).attr('y',y).text('Lima');
}

let cur=null;
const SCENES = {
  nacional(){ useMap(false); panelResultados(); },
  mapa(){ useMap(true);
    gProv.selectAll('path').transition().duration(700).attr('fill',d=>choro(d.properties));
    gDep.style('display','none');
    gBub.selectAll('circle').transition().duration(500).attr('r',0);
    gAnno.selectAll('*').remove();
    setLegend(legGradient);
  },
  territorio(){ bubbles(null); annoLima('Lima'); setLegend(legGradient); },
  sanchez(){ bubbles(JP); setLegend(legGradient); },
  fujimori(){ bubbles(FP); setLegend(legGradient); },
  lima(){ useMap(false); panelLima(); },
  limaburbujas(){ useMap(false); panelLimaBurbujas(); },
  extranjero(){ useMap(false); panelExtranjero(); },
  extranjeroburbujas(){ useMap(false); panelExtranjeroBurbujas(); },
  ranking(){ useMap(false); panelRanking(); },
  explorar(){ useMap(false); panelCierre(); },
};
function bubbles(highlight){
  useMap(true);
  gDep.style('display',null);
  gProv.selectAll('path').transition().duration(600).attr('fill','#eef1f5');
  gBub.selectAll('circle').classed('pend',false)
    .attr('fill',d=>winColor(d.properties))
    .transition().duration(700)
    .attr('r',d=>rScale(d.properties.votos_emitidos))
    .attr('fill-opacity',d=> highlight==null?.82 : (d.properties.winner===highlight?.9:.08))
    .attr('fill',d=> (highlight!=null && d.properties.winner!==highlight)?'#c4cad6':winColor(d.properties));
}

// ---------- paneles ----------
function candRow(name,party,pct,votos,color){
  return `<div class="cand-row">
    <div class="cand-top"><div class="cand-name">${name} <small>· ${party}</small></div>
      <div class="cand-pct" style="color:${color}">${pct.toFixed(2)}%</div></div>
    <div class="cand-bar"><i style="width:${pct}%;background:${color}"></i></div>
    <div class="cand-votes">${fmt(votos)} votos válidos</div></div>`;
}
const metric=(v,l,c)=>`<div class="metric"><b style="color:${c||'#0f1622'}">${v}</b><span>${l}</span></div>`;
function leanColor(l){               // l = pct_fp - pct_jp  (+ Fujimori, − Sánchez)
  const t=clamp(l/38,-1,1);
  if(Math.abs(t)<0.06) return '#d2d7e0';
  return t<0 ? d3.interpolateRgb('#d2d7e0',C.jp)(-t) : d3.interpolateRgb('#d2d7e0',C.fp)(t);
}
function panelResultados(){
  panelEl.style.overflow='hidden';
  const emit = NAT.jp.votos+NAT.fp.votos+NAT.nulos+NAT.blancos;
  panelEl.innerHTML = `<div class="panel-card hero">
    <div class="vs-stage">
      <svg id="vssvg" viewBox="0 0 760 380" preserveAspectRatio="xMidYMid meet"></svg>
      <img class="logo logo-l" src="img/juntos.svg" alt="Juntos por el Perú">
      <img class="logo logo-r" src="img/fuerza.svg" alt="Fuerza Popular">
      <div class="logo-name logo-name-l" style="color:${C.jpD}">JUNTOS POR EL PERÚ</div>
      <div class="logo-name logo-name-r" style="color:${C.fpD}">FUERZA POPULAR</div>
      <div class="vs-badge">VS</div>
    </div>
    <div class="hero-score">
      <div class="hs-row">
        <span class="hs-pct" style="color:${C.jpD}">${NAT.jp.pct.toFixed(2)}%</span>
        <span class="hs-pct" style="color:${C.fpD}">${NAT.fp.pct.toFixed(2)}%</span>
      </div>
      <div class="tugbar"><i style="width:${NAT.jp.pct}%;background:${C.jp}"></i><i style="width:${NAT.fp.pct}%;background:${C.fp}"></i></div>
      <div class="hs-row hs-names">
        <span><b>${NAT.jp.candidato}</b><small>${fmt(NAT.jp.votos)} votos</small></span>
        <span class="nm-r"><b>${NAT.fp.candidato}</b><small>${fmt(NAT.fp.votos)} votos</small></span>
      </div>
    </div>
    <div class="metrics">
      ${metric(fmt(emit),'votos emitidos')}
      ${metric(NAT.participacion.toFixed(1)+'%','participación')}
      ${metric(fmt(NAT.nulos),'votos nulos')}
    </div>
  </div>`;
  drawVsCloud();
  setLegend('');
}
function drawVsCloud(){
  if(vsSim) vsSim.stop();
  const W=760,H=380,cx=W/2,cy=H/2;
  const svg=d3.select('#vssvg'); svg.selectAll('*').remove();
  // interlínea central con "0%" inferior
  svg.append('line').attr('x1',cx).attr('x2',cx).attr('y1',14).attr('y2',H-26)
     .attr('stroke','#b8bfca').attr('stroke-width',1.4).attr('stroke-dasharray','3,5');
  svg.append('text').attr('x',cx).attr('y',H-8).attr('text-anchor','middle')
     .attr('fill','#9aa3b2').attr('font-size','13').attr('font-weight',600).text('0%');
  // nodos: atracción al centro, sublineal según margen
  const off=d3.scaleSqrt().domain([0,45]).range([0,205]);
  const r=d3.scaleSqrt().domain([0,maxEmit]).range([2.5,23]);
  const lean=d=>d.p.pct_fp-d.p.pct_jp;             // + Fujimori (derecha) / − Sánchez (izquierda)
  const nodes=PROV.features.map(f=>({p:f.properties}));
  nodes.forEach(d=>{const l=clamp(lean(d),-45,45);
    d.r=r(d.p.votos_emitidos);
    d.tx=cx+Math.sign(l)*off(Math.abs(l));
    d.x=cx+(Math.random()-0.5)*24; d.y=cy+(Math.random()-0.5)*24;});
  const circ=svg.append('g').selectAll('circle').data(nodes).join('circle')
    .attr('r',d=>d.r).attr('cx',d=>d.x).attr('cy',d=>d.y)
    .attr('fill',d=>leanColor(lean(d))).attr('stroke','#fff').attr('stroke-width',.6).attr('fill-opacity',.95)
    .on('mousemove',(e,d)=>showTip(e,d.p)).on('mouseleave',hideTip);
  vsSim=d3.forceSimulation(nodes)
    .force('x',d3.forceX(d=>d.tx).strength(.12))   // jala a su lado…
    .force('cen',d3.forceX(cx).strength(.02))      // …pero todos atraídos al cero
    .force('y',d3.forceY(cy).strength(.09))
    .force('c',d3.forceCollide(d=>d.r+1).iterations(3))
    .alpha(0.95).alphaDecay(0.018)
    .on('tick',()=>{
      nodes.forEach(d=>{d.x=clamp(d.x,108,W-108); d.y=clamp(d.y,d.r+2,H-24-d.r);});
      circ.attr('cx',d=>d.x).attr('cy',d=>d.y);
    });
}
function extTotals(){
  return {winner:EXT.winner, pct_fp:EXT.pct_fp, pct_jp:EXT.pct_jp,
    votos_fp:EXT.fp_total, votos_jp:EXT.jp_total};
}
const legExt = `<div class="ttl">Quién ganó el país</div>
  <div class="row"><span class="sw" style="background:${C.jp}"></span>Sánchez</div>
  <div class="row"><span class="sw" style="background:#d2d7e0"></span>Muy reñido</div>
  <div class="row"><span class="sw" style="background:${C.fp}"></span>Fujimori</div>
  <div class="row"><span class="sw" style="background:#eef1f5;border:1px solid var(--line)"></span>Sin peruanos / sin datos</div>`;
function panelExtranjero(){
  panelEl.style.overflow='hidden';
  panelEl.innerHTML = `<div class="panel-card" style="justify-content:flex-start;gap:4px;position:relative">
    ${geoHeaderHTML('EXTRANJERO')}
    <div class="map-box">
      <svg id="extsvg" viewBox="0 0 680 400" style="width:100%;height:100%;display:block"></svg>
      <div class="map-zoom">
        <button id="zIn" title="Acercar">+</button>
        <button id="zOut" title="Alejar">−</button>
        <button id="zRst" title="Vista mundial">⤢</button>
      </div>
    </div></div>`;
  renderGeoBar('EXTRANJERO',extTotals());
  const byIso=new Map(EXT.paises.filter(p=>p.iso3).map(p=>[p.iso3,p]));
  const s=d3.select('#extsvg');
  const feats=WORLD.features.filter(f=>f.id!=='ATA');     // sin Antártida
  const proj=(d3.geoNaturalEarth1?d3.geoNaturalEarth1():d3.geoMercator())
    .fitSize([680,400],{type:'FeatureCollection',features:feats});
  const pth=d3.geoPath(proj);
  const g=s.append('g');
  s.on('click',()=>renderGeoBar('EXTRANJERO',extTotals()));
  const node=g.selectAll('path').data(feats).join('path')
    .attr('d',pth).attr('stroke','#cdd3de').attr('stroke-width',.6).attr('vector-effect','non-scaling-stroke')
    .style('cursor','pointer')
    .attr('fill',d=>{const p=byIso.get(d.id); return p?leanColor(p.pct_fp-p.pct_jp):'#ffffff';})
    .on('mousemove',(e,d)=>{const p=byIso.get(d.id);
        p ? showTip(e,p) : showNoData(e,d.properties.name);})
    .on('mouseleave',hideTip)
    .on('click',(e,d)=>{const p=byIso.get(d.id); if(p){e.stopPropagation();renderGeoBar('EXTRANJERO',p);}});
  // países con datos: traerlos al frente (que nunca queden tapados) y animar su entrada
  node.filter(d=>byIso.get(d.id)).raise().attr('fill-opacity',0)
    .transition().delay((d,i)=>i*20).duration(450).attr('fill-opacity',1);
  // ---- zoom / paneo ----
  const zoom=d3.zoom().scaleExtent([1,12]).translateExtent([[0,0],[680,400]])
    .on('zoom',ev=>g.attr('transform',ev.transform));
  s.call(zoom).on('dblclick.zoom',null);
  d3.select('#zIn').on('click',()=>s.transition().duration(300).call(zoom.scaleBy,1.6));
  d3.select('#zOut').on('click',()=>s.transition().duration(300).call(zoom.scaleBy,1/1.6));
  d3.select('#zRst').on('click',()=>s.transition().duration(450).call(zoom.transform,d3.zoomIdentity));
  setLegend('');
}
const legLean = `<div class="ttl">Quién se inclinó</div>
  <div class="row"><span class="sw" style="background:${C.jp}"></span>Sánchez</div>
  <div class="row"><span class="sw" style="background:#d2d7e0"></span>Muy reñido</div>
  <div class="row"><span class="sw" style="background:${C.fp}"></span>Fujimori</div>`;
function limaTotals(){
  const fp=d3.sum(LIMA.features,f=>f.properties.votos_fp);
  const jp=d3.sum(LIMA.features,f=>f.properties.votos_jp);
  const emit=d3.sum(LIMA.features,f=>f.properties.votos_emitidos);
  const elec=d3.sum(LIMA.features,f=>f.properties.electores);
  const tot=fp+jp;
  return {prov:'LIMA', dep:'Metropolitana', votos_fp:fp, votos_jp:jp,
    pct_fp:+(fp/tot*100).toFixed(2), pct_jp:+(jp/tot*100).toFixed(2),
    votos_emitidos:emit, participacion:elec?+(emit/elec*100).toFixed(2):null};
}
// cabecera reutilizable: "RAÍZ" o "RAÍZ · (NOMBRE)" + barra continua con tooltip por partido
const geoHeaderHTML = root => `<div class="res-h lima-h" id="geoTitle">${root}</div>
    <div class="lima-bar" id="geoBar"></div>`;
function renderGeoBar(root,p){
  const ti=document.getElementById('geoTitle'); if(!ti) return;
  const child=p.dist||p.pais;
  ti.innerHTML = child ? `${root} · <span style="color:${p.winner===JP?C.jpD:C.fpD}">${child}</span>` : root;
  const bar=d3.select('#geoBar');
  bar.html(`<i class="bj" style="width:${p.pct_jp}%"></i><i class="bf" style="width:${p.pct_fp}%"></i>
    <span class="bl bl-l">${(+p.pct_jp).toFixed(2)}%</span><span class="bl bl-r">${(+p.pct_fp).toFixed(2)}%</span>`);
  bar.select('.bj').on('mousemove',e=>showPartyTip(e,'jp',p)).on('mouseleave',hideTip);
  bar.select('.bf').on('mousemove',e=>showPartyTip(e,'fp',p)).on('mouseleave',hideTip);
}
// ajusta el nombre dentro de la burbuja: baja palabras a varias líneas y reduce la fuente;
// devuelve false si no entra ni en el tamaño mínimo legible (círculo muy chico)
function fitLabel(sel,name,r){
  if(r<13) return false;
  const words=name.split(' ');
  const maxW=r*1.78, maxH=r*1.7, longest=Math.max(...words.map(w=>w.length));
  let fs=clamp(r/2.6,7,15);
  fs=Math.min(fs, maxW/(longest*0.62), maxH/(words.length*1.04));
  if(fs<6.6) return false;
  const lh=fs*1.02, n=words.length;
  sel.style('font-size',fs.toFixed(1)+'px').selectAll('tspan').data(words).join('tspan')
    .attr('x',0).attr('dy',(d,i)=> i===0 ? -((n-1)/2)*lh : lh).text(d=>d);
  return true;
}
function panelLima(){
  panelEl.style.overflow='hidden';
  panelEl.innerHTML = `<div class="panel-card" style="justify-content:flex-start;gap:4px">
    ${geoHeaderHTML('LIMA')}
    <svg id="limasvg" viewBox="0 0 680 560" style="width:100%;flex:1"></svg>
    ${legGradient}</div>`;
  renderGeoBar('LIMA',limaTotals());
  const s=d3.select('#limasvg');
  const proj=d3.geoMercator().fitSize([680,540],LIMA);
  const pth=d3.geoPath(proj);
  s.on('click',()=>renderGeoBar('LIMA',limaTotals()));
  const node=s.selectAll('path').data(LIMA.features).join('path')
    .attr('d',pth).attr('stroke','#fff').attr('stroke-width',.7).style('cursor','pointer')
    .attr('fill',d=>leanColor(d.properties.pct_fp-d.properties.pct_jp)).attr('fill-opacity',0)
    .on('mousemove',(e,d)=>showTip(e,d.properties)).on('mouseleave',hideTip)
    .on('click',(e,d)=>{e.stopPropagation();renderGeoBar('LIMA',d.properties);});
  node.transition().delay((d,i)=>i*16).duration(550).attr('fill-opacity',1);
  setLegend(legLean);
}
// gráfico genérico de burbujas con fuerza al centro, color por inclinación, tamaño por votos
// y botón para ordenar (beeswarm de menor a mayor tamaño). Reutilizado por Lima y el extranjero.
let bubSim=null;
function panelBurbujas({root, props, getSize, totals, legend, sizeLabel}){
  panelEl.style.overflow='hidden';
  panelEl.innerHTML = `<div class="panel-card" style="justify-content:flex-start;gap:4px">
    ${geoHeaderHTML(root)}
    <div class="lima-ctrl"><button id="bubSortBtn" class="sort-btn">Ordenar por tamaño →</button></div>
    <svg id="bubsvg" viewBox="0 0 680 560" style="width:100%;flex:1"></svg>
    ${legGradient}</div>`;
  renderGeoBar(root,totals);
  if(bubSim) bubSim.stop();
  const W=680,H=560,cx=W/2,cy=H/2;
  const svg=d3.select('#bubsvg');
  svg.on('click',()=>renderGeoBar(root,totals));
  const smax=d3.max(props,p=>getSize(p));
  const r=d3.scaleSqrt().domain([0,smax]).range([6,58]);
  const xv=d3.scaleSqrt().domain([0,smax]).range([72,W-92]);   // posición x = tamaño (menor→mayor)
  const nodes=props.map(p=>({p, r:r(getSize(p)), sx:xv(getSize(p)),
    x:cx+(Math.random()-0.5)*40, y:cy+(Math.random()-0.5)*40}));
  const circ=svg.append('g').selectAll('circle').data(nodes).join('circle')
    .attr('r',0).attr('cx',d=>d.x).attr('cy',d=>d.y).style('cursor','pointer')
    .attr('fill',d=>leanColor(d.p.pct_fp-d.p.pct_jp)).attr('stroke','#fff').attr('stroke-width',.8)
    .on('mousemove',(e,d)=>showTip(e,d.p)).on('mouseleave',hideTip)
    .on('click',(e,d)=>{e.stopPropagation();renderGeoBar(root,d.p);});
  circ.transition().delay((d,i)=>i*16).duration(550).ease(d3.easeBackOut.overshoot(1.3)).attr('r',d=>d.r);
  // etiquetas: nombre dentro de la burbuja (multi-línea si hace falta), omitidas si el círculo es muy chico
  const lblG=svg.append('g'), named=[];
  nodes.forEach(d=>{
    const t=lblG.append('text').attr('text-anchor','middle').attr('dominant-baseline','central')
      .attr('fill','#fff').style('font-family','"Archivo",sans-serif').style('font-weight',700)
      .style('pointer-events','none').attr('opacity',0);
    if(fitLabel(t,d.p.dist||d.p.pais,d.r)){ d._t=t; named.push(d); } else t.remove();
  });
  named.forEach((d,i)=>d._t.transition().delay(i*16+400).duration(400).attr('opacity',1));
  // eje inferior (solo visible al ordenar)
  const axis=svg.append('g').attr('opacity',0);
  axis.append('text').attr('x',72).attr('y',H-6).attr('font-size',11).attr('fill','#6b7280').text('← '+sizeLabel[0]);
  axis.append('text').attr('x',W-92).attr('y',H-6).attr('text-anchor','end').attr('font-size',11).attr('fill','#6b7280').text(sizeLabel[1]+' →');
  bubSim=d3.forceSimulation(nodes)
    .force('x',d3.forceX(cx).strength(.05))
    .force('y',d3.forceY(cy).strength(.05))
    .force('c',d3.forceCollide(d=>d.r+1.5).iterations(3))
    .alpha(0.9).alphaDecay(0.02)
    .on('tick',()=>{
      nodes.forEach(d=>{d.x=clamp(d.x,d.r+2,W-d.r-2); d.y=clamp(d.y,d.r+2,H-d.r-2);});
      circ.attr('cx',d=>d.x).attr('cy',d=>d.y);
      named.forEach(d=>d._t.attr('transform',`translate(${d.x},${d.y})`));
    });
  let sorted=false;
  d3.select('#bubSortBtn').on('click',function(){
    sorted=!sorted; this.textContent = sorted?'Agrupar al centro':'Ordenar por tamaño →';
    axis.transition().duration(300).attr('opacity',sorted?1:0);
    if(sorted) bubSim.force('x',d3.forceX(d=>d.sx).strength(.32)).force('y',d3.forceY(cy*1.05).strength(.07));
    else       bubSim.force('x',d3.forceX(cx).strength(.05)).force('y',d3.forceY(cy).strength(.05));
    bubSim.alpha(0.9).restart();
  });
  setLegend(legend);
}
function panelLimaBurbujas(){
  panelBurbujas({root:'LIMA', props:LIMA.features.map(f=>f.properties),
    getSize:p=>p.votos_emitidos, totals:limaTotals(), legend:legLean,
    sizeLabel:['menos votantes','más votantes']});
}
function panelExtranjeroBurbujas(){
  panelBurbujas({root:'EXTRANJERO', props:EXT.paises,
    getSize:p=>p.fp+p.jp, totals:extTotals(), legend:legExt,
    sizeLabel:['menos votantes','más votantes']});
}
function panelRanking(){
  panelEl.style.overflow='auto';
  const data = NAT.departamentos.slice().sort((a,b)=>a.pct_jp-b.pct_jp);
  const w=760, rh=22, mL=104, h=data.length*rh+30;
  panelEl.innerHTML = `<div class="panel-card" style="justify-content:flex-start">
    <div class="res-h">Resultado por departamento</div>
    <svg id="rksvg" viewBox="0 0 ${w} ${h}" style="width:100%"></svg></div>`;
  const s = d3.select('#rksvg');
  const x = d3.scaleLinear().domain([18,86]).range([mL,w-70]);   // x = % de Sánchez (JP)
  s.append('line').attr('x1',x(50)).attr('x2',x(50)).attr('y1',6).attr('y2',h-22)
    .attr('stroke','#c9cfdb').attr('stroke-dasharray','3,3');
  s.append('text').attr('x',x(50)).attr('y',h-8).attr('text-anchor','middle').attr('font-size','10').attr('fill','#6b7280').text('50%');
  s.append('text').attr('x',mL).attr('y',h-8).attr('font-size','10').attr('fill',C.fpD).text('← gana Fujimori');
  s.append('text').attr('x',w-12).attr('y',h-8).attr('text-anchor','end').attr('font-size','10').attr('fill',C.jpD).text('gana Sánchez →');
  const g = s.selectAll('g.r').data(data).join('g').attr('transform',(d,i)=>`translate(0,${i*rh+12})`);
  g.append('text').attr('x',mL-8).attr('y',5).attr('text-anchor','end').attr('font-size','11').attr('fill','#3a4150').text(d=>d.dep);
  g.append('line').attr('x1',x(50)).attr('y1',1).attr('y2',1).attr('x2',x(50))
    .attr('stroke',d=>d.winner===JP?C.jp:C.fp).attr('stroke-width',2.5)
    .transition().delay((d,i)=>i*30).duration(650).ease(d3.easeCubicOut).attr('x2',d=>x(d.pct_jp));
  g.append('circle').attr('cy',1).attr('r',4.5).attr('cx',x(50)).attr('fill',d=>d.winner===JP?C.jp:C.fp)
    .transition().delay((d,i)=>i*30).duration(650).ease(d3.easeCubicOut).attr('cx',d=>x(d.pct_jp));
  g.append('text').attr('y',5).attr('font-size','10').attr('fill','#6b7280')
    .attr('x',d=>x(d.pct_jp)+(d.winner===JP?8:-8)).attr('text-anchor',d=>d.winner===JP?'start':'end')
    .text(d=>(d.winner===JP?d.pct_jp:d.pct_fp).toFixed(1)+'%');
  setLegend('');
}
// ---------- cierre: la cifra que definió la elección ----------
function panelCierre(){
  panelEl.style.overflow='hidden';
  const dif = Math.abs(NAT.fp.votos - NAT.jp.votos);
  const difPct = Math.abs(NAT.fp.pct - NAT.jp.pct).toFixed(2);
  const validos = NAT.fp.votos + NAT.jp.votos;
  const nulosX = Math.round(NAT.nulos / dif);
  const winD = NAT.fp.votos >= NAT.jp.votos ? C.fpD : C.jpD;
  panelEl.innerHTML = `<div class="panel-card cierre">
    <p class="cierre-kicker">El desenlace</p>
    <div class="cierre-hero">
      <span class="cierre-num" id="cierreNum" style="color:${winD}">0</span>
      <span class="cierre-unit">votos de diferencia</span>
    </div>
    <div class="cierre-tug"><i class="ct-jp"></i><i class="ct-fp"></i></div>
    <div class="cierre-ends">
      <span><b style="color:${C.jpD}">Sánchez</b> · ${NAT.jp.pct.toFixed(2)}%</span>
      <span>${NAT.fp.pct.toFixed(2)}% · <b style="color:${C.fpD}">Fujimori</b></span>
    </div>
    <p class="cierre-lead">De <b>${fmt(validos)}</b> votos válidos, apenas <b>${difPct} puntos</b> definieron quién gobierna el Perú.</p>
    <div class="metrics cierre-metrics">
      ${metric(difPct+'%','del total válido')}
      ${metric(fmt(NAT.nulos),'votos nulos')}
      ${metric(nulosX+'×','nulos vs. la diferencia',winD)}
    </div>
  </div>`;
  const el = document.getElementById('cierreNum');
  d3.select(el).transition().duration(1700).ease(d3.easeCubicOut)
    .tween('n',()=>{const i=d3.interpolateNumber(0,dif); return t=>{el.textContent=fmt(i(t));};});
  d3.select('.cierre-tug .ct-jp').style('width','50%').transition().duration(1400).ease(d3.easeCubicOut).style('width',NAT.jp.pct+'%');
  d3.select('.cierre-tug .ct-fp').style('width','50%').transition().duration(1400).ease(d3.easeCubicOut).style('width',NAT.fp.pct+'%');
  setLegend('');
}

// ---------- texto dinámico ----------
function fillStatic(){
  document.getElementById('pctActas').textContent = NAT.actas_pct.toFixed(1)+'%';
  const dif = Math.abs(NAT.fp.votos-NAT.jp.votos);
  document.getElementById('difVotos').textContent = fmt(dif);
  document.getElementById('difPct').textContent = Math.abs(NAT.fp.pct-NAT.jp.pct).toFixed(2);
  document.getElementById('cierreDifH').textContent = fmt(dif);
  document.getElementById('cierreDifPct').textContent = Math.abs(NAT.fp.pct-NAT.jp.pct).toFixed(2)+'%';
  document.getElementById('cierreNulosX').textContent = Math.round(NAT.nulos/dif);
}

// ---------- init ----------
Promise.all([
  fetch('data/national.json').then(r=>r.json()),
  fetch('data/provincias.geojson').then(r=>r.json()),
  fetch('data/departamentos.geojson').then(r=>r.json()),
  fetch('data/extranjero.json').then(r=>r.json()),
  fetch('data/lima_distritos.geojson').then(r=>r.json()),
  fetch('data/world.geojson').then(r=>r.json()),
]).then(([nat,prov,dep,ext,lima,world])=>{
  NAT=nat; PROV=prov; DEP=dep; EXT=ext; LIMA=lima; WORLD=world;
  fillStatic(); drawMap();
  SCENES.nacional();

  const scroller = scrollama();
  scroller.setup({step:'.step',offset:0.55}).onStepEnter(({element})=>{
    document.querySelectorAll('.step').forEach(s=>s.classList.remove('is-active'));
    element.classList.add('is-active');
    const name = element.dataset.step;
    if(name!==cur){ cur=name; (SCENES[name]||(()=>{}))(); }
  });
  window.addEventListener('resize',()=>scroller.resize());

  // deep-link opcional a una escena: index.html?scene=extranjero
  const sc = new URLSearchParams(location.search).get('scene');
  if(!sc) window.scrollTo(0,0);            // siempre arranca arriba
  if(sc && SCENES[sc]){ cur=sc; SCENES[sc]();
    const el=document.querySelector(`.step[data-step="${sc}"]`);
    if(el){ document.documentElement.style.scrollBehavior='auto';
      el.scrollIntoView({block:'center'}); cur=sc; SCENES[sc](); } }
}).catch(e=>{
  document.body.insertAdjacentHTML('beforeend','<p style="padding:30px;color:#c00">Error cargando datos: '+e.message+'</p>');
  console.error(e);
});
