import {machiningText} from '../core/spatial-machining.js';
import {checkDetail} from './spatial-advanced.js';
import {connectedMembers3,transformMembers3,node3,members3} from '../core/spatial.js';
import {setSquareEnds,setButtEnd,setMiterJoint,setAutoButtEnd} from '../core/spatial-fabrication.js';
import {bindSpatialNode} from '../core/spatial-bindings.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(id,label,value=0)=>`<label class="s3-field">${label}<input id="${id}" value="${value}" inputmode="decimal"></label>`;
const round=n=>Math.round(n*100)/100;
export function fabricationDetail(part){
  const f=part?.fabrication;if(!f?.ready)return '';
  return `${(part.machining||[]).length?'<h3>Obrábění profilu</h3><p>Souřadnice podél osy jsou od jejího počátečního bodu, ne od hrany polotovaru. Příčná souřadnice: stěna U ve směru +V, stěna V ve směru −U.</p><ul>'+part.machining.map(o=>'<li>'+esc(machiningText(o))+'</li>').join('')+'</ul>':''}${Object.entries(part.checks||{}).filter(([kind])=>['beam','weld'].includes(kind)).map(([kind,values])=>kind==='beam'&&!part.beamCheckApplicable?'<p>Výpočet nosníku neplatí: profil je oslaben obráběním nebo nemá podporovaný průřez.</p>':checkDetail(kind,kind==='beam'?{...values,width:part.profileWidth,height:part.profileDepth,t:part.wallThickness,span:part.centerLength}:values)).join('')}<h3>${esc(part.name)} · ${esc(part.objectId)} · řezy 3D</h3><p>Polotovar ${round(f.stockSpan)} mm · nejdelší hrana ${round(f.longEdge)} mm · průřez ${part.profileWidth} × ${part.profileDepth} mm.</p><p>Rohy průřezu v pořadí (−U,−V), (+U,−V), (+U,+V), (−U,+V). Hodnoty jsou vzdálenosti v mm podél osy od začátku polotovaru. U a V jsou osy natočeného průřezu; nejde o nastavení úhlů pily.</p><p>Směry v modelu (X,Y,Z): U = ${[f.u.x,f.u.y,f.u.z].map(round).join(", ")}; V = ${[f.v.x,f.v.y,f.v.z].map(round).join(", ")}. Osa vede od (${[part.axis3d.a.x,part.axis3d.a.y,part.axis3d.a.z].map(round).join(", ")}) do (${[part.axis3d.b.x,part.axis3d.b.y,part.axis3d.b.z].map(round).join(", ")}).</p><table><thead><tr><th>Konec</th><th>−U −V</th><th>+U −V</th><th>+U +V</th><th>−U +V</th></tr></thead><tbody><tr><th>Začátek</th>${f.cornersStart.map(v=>`<td>${round(v)}</td>`).join('')}</tr><tr><th>Konec</th>${f.cornersEnd.map(v=>`<td>${round(v)}</td>`).join('')}</tr></tbody></table>`;
}
export class SpatialWorkshop {
  constructor(editor){this.e=editor;this.s=editor.store;}
  html(){
    const sel=this.e.selected();if(!sel.length)return '';
    const profiles=sel.every(o=>o.type==='member3d');
    const parts=this.s.derived.parts.filter(p=>sel.some(m=>m.id===p.objectId));
    return `<div class="ins-section"><h3>Konstrukce a spoje</h3><p>${parts.filter(p=>p.productionReady).length} / ${sel.length} dílů je připravených k výstupu.</p><div class="simple-actions"><button class="btn" data-s3="connected">Vybrat propojenou konstrukci</button><button class="btn" data-s3="transform">Posunout / otočit</button>${profiles?'<button class="btn" data-s3="square">Oba konce kolmé a volné</button><button class="btn" data-s3="baseplates">Přidat patky</button>':''}${profiles&&sel.length===2?'<button class="btn" data-s3="miter">Spojit pokosem</button>':''}${profiles&&sel.length===1?'<button class="btn" data-s3="joint">Konec na ploše jeklu</button><button class="btn" data-s3="binding">Navázat bod na nosník</button><button class="btn" data-s3="cutdetail">Detail řezů</button>':''}</div><p class="s3-caption">Kolmé konce potvrď jen u volných konců. Pokos: vyber dva shodné jekly se společným bodem pomocí Shift+klik. Napojení na plochu vyžaduje konec na ose opěrného jeklu.</p>${parts.flatMap(p=>(p.fabrication?.issues||[]).map(x=>`<p class="s3-caption">${esc(p.name)}: ${esc(x)}</p>`)).join('')}</div>`;
  }
  action(action){
    if(!['connected','transform','square','miter','joint','binding','cutdetail'].includes(action))return false;
    const e=this.e,s=this.s,sel=e.selected(),ids=sel.map(m=>m.id),m=sel[0];if(!m)throw Error('Vyber alespoň jeden profil.');
    if(action==='connected')s.select(connectedMembers3(s.project,ids));
    if(action==='square')s.commit('Kolmé volné konce',p=>setSquareEnds(p,ids));
    if(action==='miter')s.commit('Pokosový spoj',p=>setMiterJoint(p,ids[0],ids[1],s.library));
    if(action==='transform')e.dialog('Posun a otočení konstrukce',`<p>Nejdřív vyber celou propojenou konstrukci. Otočení proběhne kolem zadaného bodu, pak se přičte posun.</p><div class="s3-form-grid">${num('wDx','Posun X')}${num('wDy','Posun Y')}${num('wDz','Posun Z')}${num('wPx','Střed otáčení X')}${num('wPy','Střed otáčení Y')}${num('wPz','Střed otáčení Z')}${num('wAngle','Otočení · °')}</div><label class="s3-field">Osa otáčení<select id="wAxis"><option value="y">Y · svisle</option><option value="x">X</option><option value="z">Z</option></select></label>`,()=>{const axis={x:0,y:0,z:0};axis[document.getElementById('wAxis').value]=1;s.commit('Posun a otočení 3D',p=>transformMembers3(p,ids,{offset:{x:e.value('wDx'),y:e.value('wDy'),z:e.value('wDz')},pivot:{x:e.value('wPx'),y:e.value('wPy'),z:e.value('wPz')},angle:e.value('wAngle'),axis}));e.view.fit();});
    if(action==='cutdetail'){
      const part=s.derived.parts.find(p=>p.objectId===m.id);
      e.app.modal.open({title:'Geometrie koncových řezů',body:fabricationDetail(part)||'<p>Nejdříve vyřeš oba konce profilu. Nevyřešený profil zůstává mimo nářez.</p>',buttons:[{label:'Zavřít'}]});
    }
    if(action==='joint'||action==='binding'){
      const targets=members3(s.project).filter(t=>t.id!==m.id);
      const endSelect='<label class="s3-field">Konec vybraného profilu<select id="wEnd"><option value="start">Začátek</option><option value="end">Konec</option></select></label>';
      const targetSelect=`<label class="s3-field">Opěrný profil<select id="wTarget">${targets.map(t=>`<option value="${esc(t.id)}">${esc(t.name)} · ${esc(t.id)}</option>`).join('')}</select></label>`;
      if(action==='joint')e.dialog('Ukončit na ploše opěrného jeklu',`<p>Konec musí ležet na ose opěrného profilu. Pokud ještě neleží, nejprve použij „Navázat bod na nosník“. Mezírka je vzdálenost kolmo od plochy.</p>${endSelect}${targetSelect}<label class="s3-field">Plocha průřezu opory<select id="wFace"><option value="auto">Automaticky podle směru profilu</option><option value="v+">V+ (horní při běžném vodorovném nosníku)</option><option value="v-">V−</option><option value="u+">U+</option><option value="u-">U−</option></select></label>${num('wGap','Mezera pro svaření · mm',1)}`,()=>{const end=document.getElementById('wEnd').value,target=document.getElementById('wTarget').value,face=document.getElementById('wFace').value,gap=e.value('wGap');s.commit('Spoj na plochu',p=>face==='auto'?setAutoButtEnd(p,m.id,end,target,gap,s.library):setButtEnd(p,m.id,end,target,face[0],face[1]==='+'?1:-1,gap,s.library));});
      else e.dialog('Vazba bodu na nosník',`<p>Navázaný bod se bude pohybovat s nosníkem. Vazba platí pro všechny profily sdílející tento bod. 0 % = začátek nosníku, 100 % = konec.</p>${endSelect}${targetSelect}${num('wPercent','Poloha na nosníku · %',50)}<label><input id="wDetach" type="checkbox"> Uvolnit stávající vazbu a zachovat polohu</label>`,()=>{const end=document.getElementById('wEnd').value,target=document.getElementById('wTarget').value,t=e.value('wPercent')/100,detach=document.getElementById('wDetach').checked;s.commit('Vazba 3D bodu',p=>{if(detach){if(m.locked)throw Error('Profil je zamčený.');delete node3(p,m[end]).binding;}else bindSpatialNode(p,m[end],target,t);});});
    }
    return true;
  }
}
