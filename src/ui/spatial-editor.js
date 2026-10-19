import {SpatialMoveGizmo} from './spatial-gizmo.js';
import {SpatialSolids} from './spatial-solids.js';
import {spatialObjects} from '../core/spatial-plates.js';
import {createWeldedPergola3} from '../core/spatial-assemblies.js';
import * as THREE from '../vendor/three.module.js';
import {SpatialWorkshop} from './spatial-workshop.js';
import {addMember3,createPergola3,members3,node3,endpoints3,moveNode3,resizeMember3,repeatMembers3,distance3} from '../core/spatial.js';
import {categoryKind} from '../core/materials.js';
import {parseLength} from '../core/units.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round=n=>Math.round(n*10)/10;
const field=(id,label,value)=>`<label class="s3-field"><span>${label}</span><input id="${id}" value="${esc(value)}" inputmode="decimal" autocomplete="off"></label>`;

/** Editing controller. View3D owns rendering; core/spatial owns all mutations. */
export class SpatialEditor {
  constructor(app){
    this.app=app;this.store=app.store;this.view=app.view3d;this.tool='select';this.plane='xz';this.level=0;this.step=100;this.height=2400;this.materialId='m_jekl_40_40_2';this.pending=null;
    this.rail=document.createElement('div');this.rail.className='spatial-tools';
    this.rail.innerHTML=`<span class="rail-caption">MODELOVÁNÍ 3D</span><button data-s3="select" class="s3-tool active">↖ Vybrat / otočit</button><button data-s3="move" class="s3-tool">↔ Posunout šipkami</button><button data-s3="post" class="s3-tool">↥ Sloup</button><button data-s3="beam" class="s3-tool">╱ Spojit dva body</button><button data-s3="numeric" class="s3-tool">＋ Profil podle bodů</button><button data-s3="pergola" class="s3-tool s3-accent">▦ Vytvořit pergolu</button><button data-s3="plate3d" class="s3-tool">▱ Plech v prostoru</button><button data-s3="measure" class="s3-tool">↔ Změřit vzdálenost</button><button data-s3="all3d" class="s3-tool">Vybrat vše ve 3D</button><button data-s3="exportobj" class="s3-tool">Export 3D modelu · OBJ</button><div class="s3-settings"><label class="s3-field">Kreslicí rovina<select id="s3Plane"><option value="xz">Půdorys (X / Z)</option><option value="xy">Čelo (X / výška)</option><option value="zy">Bok (Z / výška)</option></select></label>${field('s3Level','Poloha roviny · mm',0)}${field('s3Step','Krok mřížky · mm',100)}${field('s3Height','Výška nového sloupu',2400)}<button data-s3="planeView" class="btn">Kolmo na rovinu</button></div><p class="s3-caption">Body se přichytávají k mřížce a existujícím koncům. X = šířka, Y = výška, Z = hloubka.</p>`;
    document.getElementById('tools').append(this.rail);
    this.panel=document.createElement('div');this.panel.className='spatial-inspector';document.getElementById('side').append(this.panel);
    this.hint=document.createElement('div');this.hint.className='s3-hint';document.getElementById('viewport3d').append(this.hint);
    this.dots=document.createElement('div');this.dots.className='s3-dots';document.getElementById('viewport3d').append(this.dots);
    this.banner=document.createElement('div');this.banner.className='s3-output-note';this.banner.textContent='3D návrh: kusovník uvádí osové délky. Prostorové spoje a řezy zatím nejsou dopočítané; 3D profily se nezahrnují do nářezu.';document.getElementById('outputs').prepend(this.banner);
    this.rail.addEventListener('click',e=>{const action=e.target.closest('[data-s3]')?.dataset.s3;if(action)this.action(action)});
    this.panel.addEventListener('click',e=>{const b=e.target.closest('[data-s3]');if(b)this.action(b.dataset.s3,b.dataset.id,e.shiftKey)});
    this.rail.addEventListener('change',e=>{try{const keys={s3Level:'level',s3Step:'step',s3Height:'height'};if(e.target.id==='s3Plane'){this.plane=e.target.value;this.pending=null;}else if(keys[e.target.id]){const v=parseLength(e.target.value);if(!Number.isFinite(v)||Math.abs(v)>1e6||(e.target.id!=='s3Level'&&v<1))throw Error('Zadej platný rozměr alespoň 1 mm.');this[keys[e.target.id]]=v;e.target.value=v;this.pending=null;}this.updatePlane();this.updateHint();}catch(err){this.app.toast(err.message,'err');const key={s3Level:'level',s3Step:'step',s3Height:'height'}[e.target.id];if(key)e.target.value=this[key]}});
    this.panel.addEventListener('change',e=>{if(e.target.id==='s3Material')this.materialId=e.target.value});
    this.view.onModelClick=e=>this.click(e);
    this.view.controls?.addEventListener('change',()=>this.projectDots());
    this.view.canvas?.addEventListener('pointermove',e=>{if(this.active()&&!['select','move'].includes(this.tool)){const p=this.pointAt(e);this.cursor=p;this.preview(p);this.updateHint(p)}});
    this.view.canvas?.addEventListener('pointerleave',()=>{this.preview(null)});
    this.store.subscribe(reason=>{if(['project','undo','redo'].includes(reason)){this.pending=null;this.measurement=null;this.preview(null);}this.render();this.projectDots()});
    window.addEventListener('resize',()=>this.projectDots());
    window.addEventListener('keydown',e=>{
      if(!this.active()||this.app.modal.isOpen||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
      if(e.key==='Escape'){this.setTool('select');e.stopImmediatePropagation();e.preventDefault()}
      else if(e.key==='Delete'||e.key==='Backspace'){this.remove();e.stopImmediatePropagation();e.preventDefault()}
      else if(!e.ctrlKey&&!e.metaKey&&e.key.length===1){if(e.key.toLowerCase()==='v')this.setTool('select');if(e.key.toLowerCase()==='f')this.view.fit();e.stopImmediatePropagation();}
    },true);
    this.gizmo=new SpatialMoveGizmo(this);this.solids=new SpatialSolids(this);this.workshop=new SpatialWorkshop(this);this.render();
  }
  active(){return this.app.simple?.page==='3d'}
  activate(){this.setTool('select');this.render();this.projectDots()}
  selected(){return this.store.selectedObjects().filter(o=>['member3d','plate3d'].includes(o.type))}
  setTool(tool){
    if(!this.view.scene){this.app.toast('3D modelování vyžaduje dostupné WebGL.','err');return;}
    this.gizmo?.cancel();this.tool=tool;this.pending=null;this.preview(null);if(this.view.controls)this.view.controls.enabled=tool==='select';
    this.rail.querySelectorAll('[data-s3]').forEach(b=>b.classList.toggle('active',b.dataset.s3===tool));
    this.view.canvas.style.cursor=tool==='select'?'grab':'crosshair';this.updatePlane();this.updateHint();this.projectDots();this.gizmo?.refresh();
  }
  updateHint(p){this.hint.textContent=(this.tool==='move'?'Vyber konstrukci a táhni barevnou šipku. X červená, Y zelená, Z modrá. Alt zpřesní krok na 1 mm.':this.tool==='measure'?(this.measurement?'Vzdálenost '+round(this.measurement.length)+' mm · ΔX '+round(this.measurement.dx)+' · ΔY '+round(this.measurement.dy)+' · ΔZ '+round(this.measurement.dz)+' mm. Klikni pro další měření.':this.pending?'Vyber druhý bod měření.':'Vyber první bod měření; lze kliknout i na povrch dílu.'):this.tool==='select'?'Klikni na díl a uprav jeho vlastnosti. Tažením otáčíš, Shift+klik přidá do výběru.':this.tool==='post'?'Klikni na základnu sloupu. Výška je nastavena vlevo.':this.pending?'Klikni na druhý bod profilu. Esc ukončí kreslení.':'Klikni na první bod profilu. Konce stávajících profilů se přichytí.')+(p?`  X ${round(p.x)} · Y ${round(p.y)} · Z ${round(p.z)} mm`:'')}
  updatePlane(){
    if(!this.view.scene)return;
    if(this.planeGrid){this.view.scene.remove(this.planeGrid);this.planeGrid.geometry.dispose();this.planeGrid.material.dispose();}
    this.planeGrid=new THREE.GridHelper(20000,Math.min(400,Math.max(1,Math.round(20000/this.step))),0xc27a47,0xe1c9b5);
    if(this.plane==='xz')this.planeGrid.position.y=this.level;
    if(this.plane==='xy'){this.planeGrid.rotation.x=Math.PI/2;this.planeGrid.position.z=this.level;}
    if(this.plane==='zy'){this.planeGrid.rotation.z=Math.PI/2;this.planeGrid.position.x=this.level;}
    this.planeGrid.visible=this.active()&&this.tool!=='select';this.view.scene.add(this.planeGrid);this.view.requestRender();
  }
  pointAt(e){
    const rect=this.view.canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
    let nearest=null,best=16;
    const used=new Set(members3(this.store.project).filter(m=>this.store.project.isVisible(m)).flatMap(m=>[m.start,m.end]));
    for(const n of this.store.project.nodes3d){if(!used.has(n.id))continue;const q=new THREE.Vector3(n.x,n.y,n.z).project(this.view.camera);if(q.z<-1||q.z>1)continue;const d=Math.hypot((q.x+1)*rect.width/2-(e.clientX-rect.left),(1-q.y)*rect.height/2-(e.clientY-rect.top));if(d<best){nearest=n;best=d}}
    if(nearest)return {x:nearest.x,y:nearest.y,z:nearest.z};
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),this.view.camera);
    if(this.tool==='measure'){const hit=ray.intersectObjects(this.view.root.children,false).find(h=>h.object.isMesh);if(hit)return {x:hit.point.x,y:hit.point.y,z:hit.point.z};}
    const normal=this.plane==='xz'?new THREE.Vector3(0,1,0):this.plane==='xy'?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0);
    if(Math.abs(ray.ray.direction.dot(normal))<0.001)return null;
    const hit=ray.ray.intersectPlane(new THREE.Plane(normal,-this.level),new THREE.Vector3());if(!hit)return null;
    const p={x:Math.round(hit.x/this.step)*this.step,y:Math.round(hit.y/this.step)*this.step,z:Math.round(hit.z/this.step)*this.step};p[this.plane==='xz'?'y':this.plane==='xy'?'z':'x']=this.level;return p;
  }
  click(e){
    if(!this.active()||this.tool==='select')return false;if(this.tool==='move')return true;
    const p=this.pointAt(e);if(!p){this.app.toast('Rovina je rovnoběžná s pohledem. Zvol „Kolmo na rovinu“.','warn');return true;}
    try{
      if(this.tool==='measure'){if(!this.pending){this.pending=p;this.measurement=null;}else{const a=this.pending;this.measurement={length:distance3(a,p),dx:p.x-a.x,dy:p.y-a.y,dz:p.z-a.z};this.pending=null;this.preview(null);}this.updateHint();}
      else if(this.tool==='post')this.add(p,{...p,y:p.y+this.height},'Sloup');
      else if(!this.pending){this.pending=p;this.projectDots();this.updateHint(p)}
      else {this.add(this.pending,p,'Nosník');this.pending=null;this.preview(null);this.updateHint();}
    }catch(err){this.app.toast(err.message,'err')}
    return true;
  }
  add(a,b,name){let m;this.store.commit('Nový prostorový profil',p=>{m=addMember3(p,a,b,{name,materialId:this.materialId})});this.store.select(m.id);return m}
  preview(p){
    if(!this.view.scene)return;
    if(this.previewLine){this.view.scene.remove(this.previewLine);this.previewLine.geometry.dispose();this.previewLine.material.dispose();this.previewLine=null;}
    const a=this.pending||(this.tool==='post'?p:null),b=this.tool==='post'&&p?{...p,y:p.y+this.height}:p;
    if(a&&b){this.previewLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x,a.y,a.z),new THREE.Vector3(b.x,b.y,b.z)]),new THREE.LineBasicMaterial({color:0xd77938,depthTest:false}));this.previewLine.renderOrder=10;this.view.scene.add(this.previewLine)}this.view.requestRender();
  }
  projectDots(){
    if(!this.active()||!this.view.camera){this.dots.innerHTML='';return;}
    const rect=this.view.canvas.getBoundingClientRect(),selected=new Set(this.selected().flatMap(m=>[m.start,m.end]));
    const visible=new Set(members3(this.store.project).filter(m=>this.store.project.isVisible(m)).flatMap(m=>[m.start,m.end]));
    this.dots.innerHTML=this.store.project.nodes3d.filter(n=>visible.has(n.id)&&(this.tool!=='select'||selected.has(n.id))).slice(0,500).map(n=>{const q=new THREE.Vector3(n.x,n.y,n.z).project(this.view.camera);if(q.z<-1||q.z>1||Math.abs(q.x)>1||Math.abs(q.y)>1)return '';return `<i class="s3-dot ${selected.has(n.id)?'selected':''}" style="left:${(q.x+1)*rect.width/2}px;top:${(1-q.y)*rect.height/2}px"></i>`}).join('');
  }
  materialOptions(value){return [...new Map([...this.store.library.items,...Object.values(this.store.project.materials)].map(m=>[m.id,m])).values()].filter(m=>m.active!==false&&categoryKind(m.category)==='profil').map(m=>`<option value="${esc(m.id)}" ${m.id===value?'selected':''}>${esc(m.name)}</option>`).join('')}
  materialSelect(id,value){return `<label class="s3-field">Materiál<select id="${id}">${this.materialOptions(value)}</select></label>`}
  render(){
    const all=spatialObjects(this.store.project),sel=this.selected();this.banner.hidden=!all.length;
    this.banner.textContent=`3D díly připravené k výstupu: ${this.store.derived.parts.filter(p=>(p.axis3d||p.plate3d)&&p.productionReady).length} / ${all.length}. Nářez obsahuje pouze vyřešené díly. Prostorové řezy ověř podle detailu rohů průřezu.`;
    let html=`<div class="s3-heading"><span class="eyebrow">PROSTOROVÝ NÁVRH</span><h2>${sel.length?sel.length===1?esc(sel[0].name):sel.length+' profilů':all.length?'Prostorová konstrukce':'Začni ve třech rozměrech'}</h2><p>${all.length} dílů · rozměry v mm</p></div>`;
    if(!sel.length){html+=`<div class="ins-section"><p>Vytvoř pergolu podle rozměrů, nebo rozmísti sloupy a spoj jejich konce.</p><button class="btn primary" data-s3="pergola">Vytvořit pergolu</button></div>`;}
    if(sel.length===1&&sel[0].type==='member3d'){const m=sel[0],{a,b}=endpoints3(this.store.project,m);html+=`<div class="ins-section">${field('s3Name','Název',m.name)}${this.materialSelect('s3MemberMaterial',m.materialId)}${field('s3Roll','Otočení průřezu · °',m.roll)}<button class="btn" data-s3="properties">Použít vlastnosti</button><div class="s3-length">${field('s3Length','Délka v ose · mm',round(distance3(a,b)))}</div><button class="btn" data-s3="length">Změnit délku od začátku</button><p class="s3-caption">Změna délky posune společný koncový bod i připojené profily.</p></div>`;
      for(const [key,n,label]of[['a',a,'Začátek'],['b',b,'Konec']]){const connected=all.filter(x=>x.start===n.id||x.end===n.id).length;html+=`<div class="ins-section"><h3>${label} · ${connected} připojených profilů</h3><div class="s3-coordinates">${field('s3'+key+'x','X',round(n.x))}${field('s3'+key+'y','Y · výška',round(n.y))}${field('s3'+key+'z','Z',round(n.z))}</div><button class="btn" data-s3="point" data-id="${key}">Posunout společný bod</button></div>`;}
    }
    if(sel.length)html+=`<div class="ins-section simple-actions"><button class="btn" data-s3="repeat">Kopie / rozestupy</button><button class="btn" data-s3="delete">Odstranit vybrané</button></div>`;
    html+=`<div class="ins-section">${this.materialSelect('s3Material',this.materialId)}<p class="s3-caption">Materiál pro nové profily. Nejdřív nakresli osy, potom nastav konce a spoje.</p></div><details class="s3-list" ${all.length?'open':''}><summary>Díly konstrukce (${all.length})</summary>${all.map(m=>`<button class="${this.store.selection.has(m.id)?'active':''}" data-s3="pick" data-id="${esc(m.id)}">${esc(m.name)} <small>${m.type==='plate3d'?m.width+' × '+m.height:round(distance3(...Object.values(endpoints3(this.store.project,m))))} mm</small></button>`).join('')}</details>`;
    this.panel.innerHTML=(this.solids?.html()||'')+(this.workshop?.html()||'')+html;
  }
  value(id){const v=parseLength(document.getElementById(id).value);if(!Number.isFinite(v))throw Error('Vyplň platný rozměr.');return v}
  action(action,id,shift=false){try{
    if(this.solids.action(action,id)||this.workshop.action(action))return;
    if(action==='move'&&!this.selected().length){this.app.toast('Nejdřív kliknutím vyber díl nebo použij Vybrat vše ve 3D.','warn');return;}
    if(['select','post','beam','measure','move'].includes(action))this.setTool(action);
    else if(action==='pergola')this.pergolaDialog();
    else if(action==='numeric')this.memberDialog();
    else if(action==='repeat')this.repeatDialog();
    else if(action==='delete')this.remove();
    else if(action==='pick'){this.setTool('select');shift?this.store.toggleSelect(id):this.store.select(id)}
    else if(action==='planeView')this.view.setStandardView(this.plane==='xz'?'top':this.plane==='xy'?'front':'side');
    else if(action==='properties'){const m=this.selected()[0],name=document.getElementById('s3Name').value.trim().slice(0,120),mat=document.getElementById('s3MemberMaterial').value,roll=this.value('s3Roll');if(Math.abs(roll)>360)throw Error('Otočení průřezu musí být −360° až 360°.');if(m.locked)throw Error('Profil je zamčený.');this.store.commit('Vlastnosti 3D profilu',p=>Object.assign(p.byId(m.id),{name:name||'3D profil',materialId:mat,roll}));}
    else if(action==='length'){const m=this.selected()[0],length=this.value('s3Length');this.store.commit('Změna délky 3D profilu',p=>resizeMember3(p,m.id,length));}
    else if(action==='point'){const m=this.selected()[0],position={x:this.value('s3'+id+'x'),y:this.value('s3'+id+'y'),z:this.value('s3'+id+'z')};this.store.commit('Posun prostorového bodu',p=>moveNode3(p,id==='a'?m.start:m.end,position));}
  }catch(err){this.app.toast(err.message,'err')}}
  remove(){const ids=this.selected().filter(m=>!m.locked).map(m=>m.id);if(!ids.length)return;this.store.commit('Odstranění 3D profilů',p=>ids.forEach(id=>p.remove(id)));this.store.clearSelection()}
  dialog(title,body,action){this.app.modal.open({title,body:body+'<div class="form-error"></div>',buttons:[{label:'Zrušit'},{label:'Vytvořit',primary:true,action}]})}
  pergolaDialog(){
    this.setTool('select');this.dialog('Nová pergola',`<p>Zadej osové rozměry. Svařovaná varianta má průběžné nosníky, krokve napojené z boku a čtyři patky s otvory. Rozměry materiálů nejsou statickým návrhem.</p><label class="s3-field">Varianta<select id="s3PergKind"><option value="welded">Svařovaná konstrukce s vyřešenými řezy</option><option value="draft">Pouze osový návrh</option></select></label><div class="s3-form-grid">${field('s3Width','Šířka · X',4000)}${field('s3Depth','Hloubka · Z',3000)}${field('s3PergHeight','Výška přední strany',2400)}${field('s3Rise','Zvýšení zadní strany',300)}${field('s3Rafters','Počet krokví',7)}</div>${this.materialSelect('s3PergMaterial',this.materialId)}${this.materialSelect('s3PostMaterial','m_jekl_80_80_4').replace('Materiál','Sloupy')}${this.materialSelect('s3BeamMaterial','m_jekl_80_80_4').replace('Materiál','Průběžné nosníky')}${field('s3WeldGap','Mezera pro svar',1)}<p>Krokve používají první zvolený materiál.</p>`,()=>{
      const options={width:this.value('s3Width'),depth:this.value('s3Depth'),height:this.value('s3PergHeight'),rise:this.value('s3Rise'),rafters:this.value('s3Rafters'),materialId:document.getElementById('s3PergMaterial').value};
      if(this.store.project.nodes3d.length)options.origin={x:Math.max(...this.store.project.nodes3d.map(n=>n.x))+1000,y:0,z:0};
      let added;this.store.commit('Vytvoření pergoly',p=>{added=document.getElementById('s3PergKind').value==='draft'?createPergola3(p,options):createWeldedPergola3(p,this.store.library,{...options,rafterMaterialId:options.materialId,postMaterialId:document.getElementById('s3PostMaterial').value,beamMaterialId:document.getElementById('s3BeamMaterial').value,gap:this.value('s3WeldGap')})});this.store.select(added[0].id);this.view.fit();this.projectDots();
    });
  }
  memberDialog(){this.dialog('Profil mezi přesnými body',`<p>X = šířka, Y = výška, Z = hloubka. Shodné konce se spojí do společného bodu.</p><div class="s3-form-grid">${['x','y','z'].map(k=>field('s3From'+k,'Začátek '+k.toUpperCase(),0)).join('')}${['x','y','z'].map(k=>field('s3To'+k,'Konec '+k.toUpperCase(),k==='y'?2400:0)).join('')}</div>`,()=>{const a={},b={};for(const k of ['x','y','z']){a[k]=this.value('s3From'+k);b[k]=this.value('s3To'+k)}this.add(a,b,'3D profil');this.setTool('select');this.view.fit()})}
  repeatDialog(){const ids=this.selected().map(m=>m.id);if(!ids.length){this.app.toast('Nejdřív vyber 3D profil.','warn');return;}this.dialog('Kopie s pravidelným rozestupem',`<p>Vzniknou nezávislé kopie vybraných profilů. Rozestup je posun mezi sousedními kopiemi.</p><div class="s3-form-grid">${field('s3Copies','Počet nových kopií',3)}${field('s3Dx','Rozestup X',500)}${field('s3Dy','Rozestup Y',0)}${field('s3Dz','Rozestup Z',0)}</div>`,()=>{const count=this.value('s3Copies'),offset={x:this.value('s3Dx'),y:this.value('s3Dy'),z:this.value('s3Dz')};let copies;this.store.commit('Opakování 3D profilů',p=>{copies=repeatMembers3(p,ids,count,offset)});this.store.select(copies.map(m=>m.id));this.view.fit()})}
}
