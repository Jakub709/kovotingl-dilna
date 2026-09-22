import {fitOpening} from '../core/constraints.js';
import {connectProfiles} from '../core/joints.js';
import {Project, makeFrame, makePlate, makeProfile, makeHole, objectBBox, translateObject, makeAssembly, makeCut} from '../core/model.js';
import {parseLength, fmtLen} from '../core/units.js';
import {pointsToChain} from '../core/recognize.js';
import * as G from '../core/geom.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={frame:'Rám',profile:'Profil',fill:'Výplň',mesh:'Pletivo',plate:'Patka / plech',ref:'Zeď / okolí',dim:'Kóta'};
const hints={sketch:'Načrtni tvar jedním tahem. Kliknutím na kótu upravíš rozměr.',select:'Klikni na prvek. Tažením ho posuneš, kliknutím na kótu změníš rozměr.',line:'Klikáním označ konce úseků. Dvojklik nebo Enter profil dokončí.',rect:'Táhni myší od jednoho rohu rámu k druhému.',fill:'Klikni dovnitř rámu. Počet a materiál výplní nastavíš vpravo.',plate:'Táhni myší a nakresli patku. Přesné rozměry doplníš vpravo.',hole:'Klikni na patku v místě nového otvoru.',mesh:'Klikni dovnitř rámu nebo tažením nakresli volné pletivo.',ref:'Klikáním nakresli okolí. Dvojklik nebo Enter kreslení dokončí.',dim:'Klikni na první a potom na druhý bod měřené vzdálenosti.',group:'Označ související prvky a dej jim společné jméno.'};

export class SimpleWorkspace {
  constructor(app){
    this.app=app;this.store=app.store;this.page='2d';this.editAssembly=false;
    const bind=(id,fn)=>$(id)?.addEventListener('click',fn);
    bind('homeButton',e=>{e.preventDefault();this.newProject()});bind('simpleHelp',()=>this.help());
    bind('quickShape',()=>this.templates());bind('emptyFrame',()=>this.frameDialog());
    bind('emptyDraw',()=>{this.dismissEmpty=true;this.app.canvas.setTool('sketch');this.refresh()});
    bind('detailToggle',()=>{$('side').classList.toggle('show-details');$('detailToggle').textContent=$('side').classList.contains('show-details')?'Jednoduše':'Podrobnosti'});
    bind('simpleExport',()=>this.exports());bind('revealObjects',()=>this.objectList());
    $('simpleProps').addEventListener('change',e=>this.onField(e));
    $('simpleProps').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT')e.target.blur()});
    $('simpleProps').addEventListener('click',e=>this.onAction(e));
    const old=app.host.onToolChange;
    app.host.onToolChange=t=>{old?.(t);$('toolHint').textContent=hints[t]||'';if(t!=='sketch')this.dismissEmpty=true;this.refresh(false)};
    app.host.onPolygon=points=>this.polygonChoice(points);
    this.store.subscribe(reason=>{
      if(reason==='project'){this.dismissEmpty=false;this.editAssembly=false;this.showPage('2d')}
      if(!['highlight','drag','hover'].includes(reason))this.refresh();
      else if(reason==='highlight' && this.store.firstSelected()?.type==='fill')this.renderInspector();
    });
    window.addEventListener('error',e=>window.kt?.log?.('ERROR',String(e.error?.stack||e.message)));
    window.addEventListener('unhandledrejection',e=>window.kt?.log?.('ERROR',String(e.reason?.stack||e.reason)));
  }
  start(){this.app.canvas.setTool('sketch');this.showPage('2d');this.refresh()}
  showPage(page){
    this.page=page;document.body.dataset.page=page;document.body.classList.remove('no-outputs');
    document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
    if(page==='bom'||page==='cut'){this.app.view3d.setEnabled(false);this.app.mini3d.setEnabled(false)}
    else requestAnimationFrame(()=>{this.app.canvas.renderer.resize();this.app.canvas.requestDraw()});
  }
  refresh(inspector=true){
    const s=this.store,p=s.project;
    $('pieceCount').textContent=s.derived.parts.length;
    $('saveState').textContent=s.dirty?'Změny čekají na uložení':s.filePath?'Vše uloženo':'Připraveno ke kreslení';
    $('emptyCanvas').classList.toggle('hidden',p.objects.length>0||!!this.dismissEmpty);
    if(inspector)this.renderInspector();
  }
  operationObjects(){
    const p=this.store.project,ids=new Set(this.store.selection);
    for(const id of [...ids]){const o=p.byId(id);if(o?.assemblyId&&!this.editAssembly)for(const x of p.inAssembly(o.assemblyId))ids.add(x.id)}
    for(const o of p.objects)if(ids.has(o.frameId))ids.add(o.id);
    return [...ids].map(id=>p.byId(id)).filter(Boolean);
  }
  field(name,label,value,unit='mm',extra=''){
    return `<label class="simple-field"><span>${esc(label)}</span><div class="field-unit"><input type="text" data-simple-field="${esc(name)}" value="${esc(value)}" ${extra}/>${unit?`<em>${esc(unit)}</em>`:''}</div></label>`;
  }
  material(o){
    const kind=o.type==='plate'?'plech':o.type==='mesh'?'pletivo':'profil';
    const mats=this.store.library.items.filter(m=>m.active && (kind==='plech'?m.category==='plech':kind==='pletivo'?m.category==='pletivo':!['plech','pletivo'].includes(m.category)));
    const current=this.store.project.material(o.materialId,this.store.library);
    if(current&&!mats.some(m=>m.id===current.id))mats.unshift(current);
    return `<label class="simple-field"><span>Z čeho bude vyrobený</span><select data-simple-field="materialId"><option value="">Vyber materiál</option>${mats.map(m=>`<option value="${esc(m.id)}" ${m.id===o.materialId?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>`;
  }
  renderInspector(){
    const objs=this.store.selectedObjects(),o=objs[0],p=this.store.project;
    if(!o){$('simpleProps').innerHTML=`<div class="ins-empty"><h2>Tady se doladí detaily.</h2><p>Nakresli nebo vyber prvek. Zobrazí se jeho rozměry, materiál a možnosti doplnění.</p><div class="ins-tip"><b>Rozměry nemusíš trefit.</b><br>Do kóty můžeš napsat 900, 90 cm i 0,9 m.</div><div class="ins-tip"><b>Vše spolu souvisí.</b><br>Po úpravě se přepočítá 3D, seznam dílů i nářez tyčí.</div></div>`;return}
    if(objs.length>1){$('simpleProps').innerHTML=`<div class="ins-section"><h2>${objs.length} vybraných prvků</h2><p class="simple-note">Sestava drží související prvky pohromadě.</p></div><div class="ins-section"><div class="simple-actions"><button class="btn primary" data-simple-act="group">Spojit do sestavy</button><button class="btn" data-simple-act="resizeAssembly">Rozměry celku</button></div><button class="btn" data-simple-act="autoJoint">Spojit dva profily pokosem</button></div><div class="ins-footer"><div class="simple-actions"><button class="btn" data-simple-act="duplicate">Duplikovat</button><button class="btn" data-simple-act="delete">Odstranit</button></div></div>`;return}
    let html=`<div class="ins-section"><h2>${esc(o.name||labels[o.type]||'Prvek')}</h2><span class="ins-subtitle">${esc(p.assemblyName(o.assemblyId)||'Samostatný prvek')}</span></div>`;
    if('materialId'in o)html+=`<div class="ins-section">${this.material(o)}</div>`;
    let fields='';
    if(o.type==='frame')fields=`<div class="field-pair">${this.field('w','Šířka',fmtLen(o.w))}${this.field('h','Výška',fmtLen(o.h))}</div><p class="simple-note">Vnější rozměry rámu. Levý dolní roh zůstává na místě.</p>`;
    if(o.type==='profile'){
      const chain=pointsToChain(o.points);
      fields=chain.segments.map((s,i)=>this.field('segLen',chain.segments.length===1?'Délka osy':`Úsek ${i+1}`,fmtLen(s.length,1),'mm',`data-idx="${i}"`)).join('');
      fields+=chain.bends.map((v,i)=>this.field('bend',`Lom ${i+1}`,Math.abs(v),'°',`data-idx="${i}"`)).join('');
      if(chain.segments.length>1)fields+=`<label class="simple-field"><span>Jak ho vyrobit</span><select data-simple-field="bendMode"><option value="bent" ${o.bend==='bent'?'selected':''}>Jeden ohýbaný díl</option><option value="cut" ${o.bend==='cut'?'selected':''}>Svařit z jednotlivých kusů</option></select></label>`;
    }
    if(o.type==='fill')fields=`<div class="choice-row"><button data-simple-act="dirV" class="${o.dir==='v'?'active':''}">Svisle</button><button data-simple-act="dirH" class="${o.dir==='h'?'active':''}">Vodorovně</button></div><br><label class="simple-field"><span>Rozmístit podle</span><select data-simple-field="mode"><option value="count" ${o.mode==='count'?'selected':''}>Počtu kusů</option><option value="gap" ${o.mode==='gap'?'selected':''}>Největší mezery</option></select></label>${o.mode==='gap'?this.field('maxGap','Maximální mezera',o.maxGap):this.field('count','Počet profilů',o.count,'ks')}<p class="simple-note">Krajní mezery jsou stejné jako mezi profily. Jednotlivý díl můžeš upravit samostatně.</p><button class="btn" data-simple-act="individual">Upravit jednu výplň</button>`;
    if(o.type==='plate'){const b=G.bboxOf(o.points);fields=`<div class="field-pair">${this.field('plateW','Šířka',fmtLen(b.w))}${this.field('plateH','Výška',fmtLen(b.h))}</div>${this.field('thickness','Tloušťka',o.thickness)}<div class="simple-actions"><button class="btn" data-simple-act="holes">Přidat otvory</button></div><p class="simple-note">${o.holes.length} otvorů · pozice se mění společně s patkou.</p>`}
    if(o.type==='mesh')fields=this.field('inset','Odsazení od rámu',o.inset);
    if(o.type==='ref')fields=`<p class="simple-note">Referenční obrys se nevyrábí. Body a úseky upravíš v Podrobnostech.</p><button class="btn" data-simple-act="wallFit">Umístit rám s odstupem</button>`;
    if(o.type==='dim')fields=this.field('dimValue','Vzdálenost',fmtLen(G.dist(o.a,o.b)));
    if(fields)html+=`<div class="ins-section"><h3>ROZMĚRY A PROVEDENÍ</h3>${fields}</div>`;
    if(o.type==='frame')html+=`<div class="ins-section"><h3>SPOJENÍ ROHŮ</h3><label class="simple-field"><select data-simple-field="cornerMode"><option value="miter" ${o.cornerMode==='miter'?'selected':''}>Šikmé řezy 45°</option><option value="insertH" ${o.cornerMode==='insertH'?'selected':''}>Rovné — vodorovné uvnitř</option><option value="throughH" ${o.cornerMode==='throughH'?'selected':''}>Rovné — vodorovné přes celou šířku</option><option value="custom" ${o.cornerMode==='custom'?'selected':''}>Vlastní (v Podrobnostech)</option></select></label></div><div class="ins-section"><h3>CO DOVNITŘ RÁMU?</h3><div class="choice-row"><button data-simple-act="fill">Profily</button><button data-simple-act="mesh">Pletivo</button></div></div>`;
    if(o.assemblyId)html+=`<div class="ins-section"><h3>SESTAVA</h3><div class="simple-actions"><button class="btn" data-simple-act="editAssembly">${this.editAssembly?'Upravovat celý celek':'Upravit jen tento díl'}</button><button class="btn" data-simple-act="resizeAssembly">Rozměry celku</button></div><p class="simple-note">${this.editAssembly?'Přesun a odstranění se týká jen vybraného dílu.':'Přesun, kopie a odstranění působí na celou sestavu.'}</p></div>`;
    html+=`<div class="ins-footer"><div class="simple-actions"><button class="btn" data-simple-act="duplicate">Duplikovat</button><button class="btn" data-simple-act="delete">Odstranit</button></div><button class="header-btn" data-simple-act="name">Přejmenovat prvek</button></div>`;
    $('simpleProps').innerHTML=html;
  }
  onField(e){const field=e.target.dataset.simpleField,o=this.store.firstSelected();if(!field||!o)return;try{this.app.props.applyField(o,field,e.target.value,e.target)}catch(err){this.app.toast(err.message,'err');this.renderInspector()}}
  onAction(e){const act=e.target.closest('[data-simple-act]')?.dataset.simpleAct,o=this.store.firstSelected();if(!act||!o)return;
    const fields={dirV:['dir','v'],dirH:['dir','h']};if(fields[act]){this.app.props.applyField(o,...fields[act],{dataset:{}});return}
    switch(act){
      case'fill':this.app.addFill(o,'v');break;case'mesh':this.app.canvas.placeMeshInFrame(o);break;
      case'autoJoint':try{const objs=this.store.selectedObjects();if(objs.length!==2)throw Error('Vyber právě dva rovné profily.');this.store.commit('Pokos podle průsečíku',p=>connectProfiles(p,objs[0].id,objs[1].id));this.app.toast('Konce jsou spojené. Úhel se vypočítal z geometrie.','ok')}catch(err){this.app.toast(err.message,'err')}break;
      case'duplicate':this.app.duplicateSelection();break;case'delete':this.app.deleteSelection();break;case'group':this.app.groupSelection();break;
      case'individual':this.individualFill(o);break;case'holes':this.holesDialog(o);break;case'wallFit':this.wallFit(o);break;case'resizeAssembly':this.resizeAssembly();break;
      case'editAssembly':this.editAssembly=!this.editAssembly;this.app.canvas.editAssembly=this.editAssembly;this.renderInspector();break;
      case'name':this.nameDialog(o);break;
    }
  }
  newProject(){const go=()=>this.app.modal.open({title:'Nový výkres',body:`<label class="simple-field"><span>Jak se projekt jmenuje?</span><input id="newName" value="Nový projekt" maxlength="100"/></label><p class="simple-note">Otevře se čisté plátno. Můžeš rovnou kreslit myší.</p>`,buttons:[{label:'Zrušit'},{label:'Začít kreslit',primary:true,action:m=>{const name=m.bodyEl.querySelector('#newName').value.trim()||'Nový projekt';this.store.setProject(new Project({name}));this.store.dirty=true;this.app.setMode('2d');this.app.canvas.setTool('sketch');this.app.canvas.fit();this.refresh()}}],onMount:root=>{const i=root.querySelector('input');i.focus();i.select()}});if(this.store.dirty)this.app.confirmDiscard('Začít nový výkres?',go);else go()}
  nameDialog(o){this.app.modal.open({title:'Přejmenovat prvek',body:`<label class="simple-field"><span>Název</span><input id="elementName" value="${esc(o.name)}" maxlength="100"/></label>`,buttons:[{label:'Zrušit'},{label:'Použít',primary:true,action:m=>this.store.commit('Přejmenování',p=>{p.byId(o.id).name=m.bodyEl.querySelector('input').value})}]})}
  templates(){this.app.modal.open({title:'Přidat podle rozměrů',body:`<p>Volitelná zkratka. Dál můžeš tvar upravovat ve výkresu.</p><div class="template-cards"><button class="template-card" data-kind="frame"><b>Rám</b><small>Šířka, výška a materiál.</small></button><button class="template-card" data-kind="profile"><b>Rovný profil</b><small>Jeden kus přesné délky.</small></button><button class="template-card" data-kind="plate"><b>Patka / plech</b><small>Rozměry, tloušťka a otvory.</small></button><button class="template-card" data-kind="sketch"><b>Volný náčrt</b><small>Nakresli si vlastní tvar.</small></button></div>`,buttons:[{label:'Zavřít'}],onMount:root=>root.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{const kind=b.dataset.kind;this.app.modal.close();if(kind==='sketch'){this.app.setMode('2d');this.app.canvas.setTool('sketch')}else this.shapeDialog(kind)})})}
  frameDialog(){this.shapeDialog('frame')}
  shapeDialog(kind){const frame=kind==='frame',plate=kind==='plate';this.app.modal.open({title:frame?'Rám podle rozměrů':plate?'Nová patka':'Nový profil',body:`<div class="field-pair">${this.field('width',frame||plate?'Šířka':'Délka',frame?900:plate?120:1000)}${frame||plate?this.field('height','Výška',frame?1000:120):''}</div><p class="simple-note">Lze zadat i 90 cm nebo 1,2 m. Materiál změníš v pravém panelu.</p><div class="form-error" role="alert"></div>`,buttons:[{label:'Zrušit'},{label:'Přidat do výkresu',primary:true,action:m=>{const w=parseLength(m.bodyEl.querySelector('[data-simple-field="width"]').value),h=parseLength(m.bodyEl.querySelector('[data-simple-field="height"]')?.value||'100');if(!(w>0&&h>0&&w<=100000&&h<=100000)){m.bodyEl.querySelector('.form-error').textContent='Zadej kladné rozměry do 100 000 mm.';return false}const boxes=this.store.project.objects.map(o=>objectBBox(this.store.project,o,this.store.library)).filter(Boolean),x=boxes.length?Math.max(...boxes.map(b=>b.maxX))+150:0;let obj;if(frame)obj=makeFrame({x,w,h,materialId:'m_jekl_40_40_2'});else if(plate)obj=makePlate({points:G.rectPoints(x,0,w,h),materialId:'m_plech_6_mm'});else obj=makeProfile({points:[G.v(x,0),G.v(x+w,0)],bend:'cut',materialId:'m_jekl_40_40_2'});this.store.commit('Přidání prvku',p=>p.add(obj));this.store.select(obj.id);this.app.setMode('2d');this.app.canvas.setTool('select');this.app.canvas.fit()}}]})}
  holesDialog(plate){this.app.modal.open({title:'Otvory do patky',body:`${this.field('diameter','Průměr otvoru',14)}${this.field('margin','Vzdálenost středu od hrany',20)}<label class="simple-field"><span>Rozmístění</span><select id="holePattern"><option value="four">4 otvory do rohů</option><option value="one">1 otvor doprostřed</option></select></label><div class="form-error" role="alert"></div>`,buttons:[{label:'Zrušit'},{label:'Přidat otvory',primary:true,action:m=>{const d=parseLength(m.bodyEl.querySelector('[data-simple-field="diameter"]').value),off=parseLength(m.bodyEl.querySelector('[data-simple-field="margin"]').value),b=G.bboxOf(plate.points);if(!(d>0&&off>=d/2&&off<b.w/2&&off<b.h/2)){m.bodyEl.querySelector('.form-error').textContent='Otvory se nevejdou. Zmenši průměr nebo uprav odstup.';return false}const corners=m.bodyEl.querySelector('#holePattern').value==='four'?[[b.minX+off,b.minY+off],[b.maxX-off,b.minY+off],[b.maxX-off,b.maxY-off],[b.minX+off,b.maxY-off]]:[[b.minX+b.w/2,b.minY+b.h/2]];this.store.commit('Přidání otvorů',p=>{p.byId(plate.id).holes.push(...corners.map(([cx,cy])=>makeHole({cx,cy,d})))})}}]})}
  objectList(){const p=this.store.project;this.app.modal.open({title:'Prvky projektu',body:`<p class="simple-note">Skrytí mění jen výkres. Díl zůstává v seznamu pro výrobu.</p><div class="project-objects">${p.objects.map(o=>`<div class="object-row"><label><input type="checkbox" data-visible="${esc(o.id)}" ${o.visible?'checked':''}/>${esc(o.name||labels[o.type])}</label><button class="btn" data-select="${esc(o.id)}">Vybrat</button></div>`).join('')||'<p>Zatím tu nic není. Začni kreslit.</p>'}</div>`,buttons:[{label:'Zavřít'}],onMount:root=>{root.querySelectorAll('[data-visible]').forEach(i=>i.onchange=()=>this.store.commit('Viditelnost',p=>p.byId(i.dataset.visible).visible=i.checked));root.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>{this.store.select(b.dataset.select);this.app.modal.close();this.app.setMode('2d')})}})}
  checkExport(){this.store.revalidate();if(this.store.derived.counts.errors){this.app.toast('Nejdřív oprav červeně označené chyby. Výstup by mohl být nesprávný.','err');this.app.command('project.revalidate');return false}if(!this.store.derived.parts.length){this.app.toast('Nejdřív nakresli alespoň jeden výrobní prvek.','warn');return false}return true}
  exports(){const errors=this.store.revalidate().filter(i=>i.severity==='error').length;this.app.modal.open({title:'Výstupy pro dílnu',body:`${errors?`<div class="warning-box">Projekt má ${errors} chyb. Před exportem je potřeba je opravit.</div>`:''}<p>PDF můžeš uložit, poslat nebo vytisknout. Rozměry jsou v milimetrech.</p><div class="export-options"><button data-export="all">Kompletní dokumentace</button><button data-export="drawing">Jen výkres</button><button data-export="bom">Seznam dílů</button><button data-export="cut">Nářez tyčí</button></div>`,buttons:[{label:'Zavřít'},{label:'Tisk na tiskárně',action:()=>{setTimeout(()=>this.app.printReport(['drawing','bom','cut']),0)}}],onMount:root=>root.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>{const key=b.dataset.export;this.app.modal.close();this.app.exportPdf(key==='all'?['drawing','bom','cut']:[key],key)})})}
  help(){this.app.modal.open({title:'Stačí kreslit. Zbytek doladíš.',body:`<div class="help-steps"><p><b>Načrtni tvar myší</b>Vyber Kreslit a jedním tahem nakresli obdélník, čáru nebo lomený profil. Nejistý tvar si vybereš z nabídky.</p><p><b>Klikni na číslo a přepiš rozměr</b>Nemusíš kreslit přesně. Do kóty napiš třeba 900 nebo 90 cm. Rozměry jsou také vpravo.</p><p><b>Vyber materiál a doplň konstrukci</b>Klikni na prvek. Vpravo nastav profil, spojení rohů nebo výplň. Podrobnosti otevřou další možnosti.</p><p><b>Prohlédni si 3D a výstupy</b>Nahoře přepni na 3D, seznam dílů nebo nářez. Červené chyby oprav před exportem. Projekt si ulož.</p></div><p class="simple-note">Ctrl+Z vrátí změnu · Delete odstraní výběr · Esc zruší kreslení · F zobrazí vše · V vybírá · N kreslí.</p>`,buttons:[{label:'Rozumím, jdu kreslit',primary:true}]})}
  resizeAssembly(){const objs=this.operationObjects(),p=this.store.project;let bb=null;for(const o of objs){const b=objectBBox(p,o,this.store.library);if(b)bb=bb?G.bboxUnion(bb,b):b}if(!bb)return;this.app.modal.open({title:'Změnit rozměr celku',body:`<div class="warning-box">Mění se geometrie všech vybraných prvků. Průřezy materiálů a průměry otvorů zůstanou stejné.</div><div class="field-pair">${this.field('newW','Šířka celku',fmtLen(bb.w))}${this.field('newH','Výška celku',fmtLen(bb.h))}</div><div class="form-error"></div>`,buttons:[{label:'Zrušit'},{label:'Změnit celý celek',primary:true,action:m=>{const w=parseLength(m.bodyEl.querySelector('[data-simple-field="newW"]').value),h=parseLength(m.bodyEl.querySelector('[data-simple-field="newH"]').value);if(!(w>0&&h>0&&bb.w>0&&bb.h>0)){m.bodyEl.querySelector('.form-error').textContent='Zadej kladné rozměry.';return false}const sx=w/bb.w,sy=h/bb.h;this.store.commit('Rozměry sestavy',p=>{for(const obj of objs){const o=p.byId(obj.id);if(o.points)o.points=o.points.map(q=>({x:bb.minX+(q.x-bb.minX)*sx,y:bb.minY+(q.y-bb.minY)*sy}));if(o.holes)for(const hole of o.holes){hole.cx=bb.minX+(hole.cx-bb.minX)*sx;hole.cy=bb.minY+(hole.cy-bb.minY)*sy}if(o.type==='frame'||(o.type==='mesh'&&!o.frameId)){o.x=bb.minX+(o.x-bb.minX)*sx;o.y=bb.minY+(o.y-bb.minY)*sy;o.w*=sx;o.h*=sy}}});this.app.canvas.fit()}}]})}
  wallFit(ref){this.app.modal.open({title:'Rám uvnitř stavebního otvoru',body:`<p>Obdélníkový rám se umístí doprostřed otvoru a zmenší tak, aby dodržel odstup i od šikmých stěn. Vazba zůstane aktivní při úpravě obrysu.</p>${this.field('gap','Odstup od okolí',10)}<div class="form-error"></div>`,buttons:[{label:'Zrušit'},{label:'Vložit rám s vazbou',primary:true,action:m=>{const gap=parseLength(m.bodyEl.querySelector('input').value);if(!(gap>=0)){m.bodyEl.querySelector('.form-error').textContent='Odstup musí být nezáporný.';return false}const b=G.bboxOf(ref.points);if(!b||b.w<=2*gap+80||b.h<=2*gap+80){m.bodyEl.querySelector('.form-error').textContent='Otvor je příliš malý.';return false}const f=makeFrame({x:b.minX+gap,y:b.minY+gap,w:b.w-2*gap,h:b.h-2*gap,materialId:'m_jekl_40_40_2'});try{Object.assign(f,fitOpening(ref.points,gap))}catch(err){m.bodyEl.querySelector('.form-error').textContent=err.message;return false}f.referenceFit={refId:ref.id,gap};this.store.commit('Rám s odstupem',p=>p.add(f));this.store.select(f.id);this.app.canvas.fit()}}]})}
  polygonChoice(points){this.app.modal.open({title:'Co jsi nakreslil?',body:'<p>Uzavřený obrys může být rám svařený z profilů, nebo plocha plechu.</p>',buttons:[{label:'Zrušit'},{label:'Plech',action:()=>this.app.canvas.createPlate(null,points)},{label:'Rám z profilů',primary:true,action:()=>{
    const poly=G.ensureCCW(points);if(G.dist(poly[0],poly.at(-1))>.01)poly.push({...poly[0]});
    const o=makeProfile({points:poly,closed:true,bend:'cut',materialId:'m_jekl_40_40_2',name:'Mnohoúhelníkový rám'});
    this.store.commit('Uzavřený rám',p=>p.add(o));this.store.select(o.id);this.app.canvas.setTool('select');
  }}]})}
  individualFill(fill){
    const parts=this.store.partsOfObject(fill.id),selected=this.store.partByKey(this.store.highlightPart)||parts[0];if(!selected)return;
    const idx=selected.subIndex,frame=this.store.project.byId(fill.frameId),mat=this.store.project.material(frame.materialId,this.store.library),t=mat?.dims?.a||0;
    const pos=fill.dir==='v'?selected.axis.a.x-frame.x-t:selected.axis.a.y-frame.y-t;
    const start=fill.dir==='v'?selected.axis.a.y-frame.y-t:selected.axis.a.x-frame.x-t;
    this.app.modal.open({title:'Upravit výplň '+(idx+1),body:'<p>Nejprve ve výkresu vyber konkrétní profil výplně. Tato úprava vyjme jeho polohu z automatického rozmístění.</p>'+this.field('length','Délka',selected.centerLength)+this.field('position','Poloha osy od vnitřní hrany',pos)+this.field('start','Posun začátku',start)+'<div class="form-error"></div>',buttons:[{label:'Zrušit'},{label:'Použít pro tento kus',primary:true,action:m=>{
      const values={};for(const key of ['length','position','start'])values[key]=parseLength(m.bodyEl.querySelector('[data-simple-field="'+key+'"]').value);
      if(!(values.length>0)||values.position==null||values.start==null){m.bodyEl.querySelector('.form-error').textContent='Zadej platné rozměry a kladnou délku.';return false}
      this.store.commit('Individuální výplň',p=>{const f=p.byId(fill.id);f.overrides[idx]={...(f.overrides[idx]||{}),...values};f.manual=true});
    }}]});
  }

}
