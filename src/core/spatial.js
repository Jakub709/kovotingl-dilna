/** Spatial model v1. Millimetres, X = width, Y = height, Z = depth.
 * Nodes are shared explicitly; rendering and UI never own geometry.
 * Members currently describe axes, not production joints/cutting planes.
 */
import {newId} from './ids.js';
import {resolveSpatialBindings} from './spatial-bindings.js';
import {basis,rotatePoint,rollFor,add} from './spatial-geometry.js';
import {spatialObjects,isLocked3,plateFrame,detachPlate3,transformPlate3,validatePlate3} from './spatial-plates.js';

export const distance3 = (a,b) => Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
export const validPoint3 = p => p && ['x','y','z'].every(k => Number.isFinite(p[k]) && Math.abs(p[k]) <= 1e6);
export const members3 = p => p.objects.filter(o => o.type === 'member3d');
export const node3 = (p,id) => p.nodes3d.find(n => n.id === id);
export function endpoints3(p,m) { return {a:node3(p,m.start),b:node3(p,m.end)}; }
export function requirePoint3(p) { if(!validPoint3(p)) throw Error('Souřadnice musí být konečné hodnoty do 1 000 000 mm.'); }

export function addNode3(p,point,reuse=true) {
  requirePoint3(point);
  const found=reuse && p.nodes3d.find(n => distance3(n,point)<0.01);
  if(found) return found;
  const node={id:newId('nd'),x:point.x,y:point.y,z:point.z};
  p.nodes3d.push(node); return node;
}
export function addMember3(p,a,b,options={}) {
  requirePoint3(a); requirePoint3(b);
  if(distance3(a,b)<1) throw Error('Profil musí být dlouhý alespoň 1 mm.');
  if(p.objects.length>=5000) throw Error('Projekt může obsahovat nejvýše 5 000 prvků.');
  const duplicate=members3(p).some(m=>{const e=endpoints3(p,m);return e.a&&e.b&&((distance3(e.a,a)<0.01&&distance3(e.b,b)<0.01)||(distance3(e.a,b)<0.01&&distance3(e.b,a)<0.01))});
  if(duplicate) throw Error('Mezi těmito body už profil existuje.');
  const start=addNode3(p,a,options.reuse!==false),end=addNode3(p,b,options.reuse!==false);
  const m={id:newId('m3'),type:'member3d',start:start.id,end:end.id,name:options.name||'3D profil',materialId:options.materialId||'m_jekl_40_40_2',roll:options.roll??0,assemblyId:options.assemblyId||null,visible:true,locked:false,note:'',jointMode:'unresolved'};
  p.add(m);return m;
}
export function moveNode3(p,id,position) {
  requirePoint3(position);const n=node3(p,id);
  if(!n) throw Error('Bod už neexistuje.');
  if(n.binding)throw Error('Bod je navázaný na nosník. Nejdřív změň nebo uvolni jeho vazbu.');
  const connected=members3(p).filter(m=>m.start===id||m.end===id);
  if(connected.some(m=>m.locked||p.assembly(m.assemblyId)?.locked))throw Error('K bodu je připojen zamčený profil.');
  for(const m of connected){const other=node3(p,m.start===id?m.end:m.start);if(!other||distance3(position,other)<1)throw Error('Změna by vytvořila nulovou délku profilu.');}
  Object.assign(n,{x:position.x,y:position.y,z:position.z});
}
export function pruneNodes3(p) {
  const used=new Set(members3(p).flatMap(m=>[m.start,m.end]));
  p.nodes3d=p.nodes3d.filter(n=>used.has(n.id));
}
export function resizeMember3(p,id,length) {
  if(!Number.isFinite(length)||length<1||length>1e6)throw Error('Délka musí být 1 až 1 000 000 mm.');
  const m=p.byId(id);if(m?.type!=='member3d')throw Error('Vyber 3D profil.');
  const {a,b}=endpoints3(p,m),scale=length/distance3(a,b);
  moveNode3(p,m.end,{x:a.x+(b.x-a.x)*scale,y:a.y+(b.y-a.y)*scale,z:a.z+(b.z-a.z)*scale});
}
export function repeatMembers3(p,ids,count,offset) {
  requirePoint3(offset);
  if(!Number.isInteger(count)||count<1||count>100) throw Error('Počet nových kopií musí být 1 až 100.');
  if(Math.hypot(offset.x,offset.y,offset.z)<1) throw Error('Zadej nenulový rozestup kopií.');
  const source=members3(p).filter(m=>ids.includes(m.id)),plates=p.objects.filter(o=>o.type==='plate3d'&&(ids.includes(o.id)||source.some(m=>m.id===o.attachment?.memberId)));
  if(!source.length&&!plates.length) throw Error('Vyber alespoň jeden 3D díl.');
  const result=[];
  for(let i=1;i<=count;i++){
    const map=new Map();
    const copied=new Map();
    for(const m of source){
      const points=[m.start,m.end].map(id=>{if(!map.has(id)){const n=node3(p,id);map.set(id,addNode3(p,{x:n.x+offset.x*i,y:n.y+offset.y*i,z:n.z+offset.z*i},false));}return map.get(id)});
      // Keep copied groups independent from original nodes, but shared within a copy.
      const copy=addMember3(p,points[0],points[1],{...m,reuse:false});
      copy.start=points[0].id;copy.end=points[1].id;copy.note=m.note||'';result.push(copy);copied.set(m.id,copy);
    }
    for(const [oldId,copy]of copied){const original=p.byId(oldId);copy.ends={};for(const e of ['start','end']){const joint=original.ends?.[e]||{kind:'unresolved'};copy.ends[e]=joint.targetId?(copied.has(joint.targetId)?{...joint,targetId:copied.get(joint.targetId).id}:{kind:'unresolved'}):{...joint};}}
    for(const [id,node]of map){const binding=node3(p,id).binding;if(binding&&copied.has(binding.memberId))node.binding={...binding,memberId:copied.get(binding.memberId).id};}
    for(const original of plates){const copy=JSON.parse(JSON.stringify(original));copy.id=newId('p3');copy.locked=false;if(copy.attachment&&copied.has(copy.attachment.memberId))copy.attachment.memberId=copied.get(copy.attachment.memberId).id;else{detachPlate3(p,copy);copy.origin=add(copy.origin,{x:offset.x*i,y:offset.y*i,z:offset.z*i});}validatePlate3(p,copy);p.add(copy);result.push(copy);}
  }
  pruneNodes3(p);return result;
}
export function createPergola3(p,{width=4000,depth=3000,height=2400,rise=300,rafters=7,materialId='m_jekl_40_40_2',origin={x:0,y:0,z:0}}={}) {
  if(![width,depth,height].every(v=>Number.isFinite(v)&&v>=100&&v<=50000)||!Number.isFinite(rise)||Math.abs(rise)>10000||height+rise<100||!Number.isInteger(rafters)||rafters<2||rafters>100)throw Error('Zkontroluj rozměry pergoly a počet krokví (2–100).');
  requirePoint3(origin);
  const assembly={id:newId('as'),name:'Pergola',visible:true,locked:false,note:''};p.assemblies.push(assembly);
  const point=(x,y,z)=>({x:x+origin.x,y:y+origin.y,z:z+origin.z});
  const options={materialId,assemblyId:assembly.id};const added=[];
  const add=(a,b,name)=>added.push(addMember3(p,a,b,{...options,name}));
  for(const x of [0,width])for(const z of [0,depth])add(point(x,0,z),point(x,height+rise*z/depth,z),'Sloup');
  for(const z of [0,depth])add(point(0,height+rise*z/depth,z),point(width,height+rise*z/depth,z),'Nosník');
  for(let i=0;i<rafters;i++){const x=width*i/(rafters-1);add(point(x,height,0),point(x,height+rise,depth),'Krokev');if(i>0&&i<rafters-1){const r=added.at(-1);node3(p,r.start).binding={memberId:added[4].id,t:i/(rafters-1)};node3(p,r.end).binding={memberId:added[5].id,t:i/(rafters-1)};}}
  return added;
}

export function validateSpatialDocument(d) {
  if(!Array.isArray(d.nodes3d)||d.nodes3d.length>10000)throw Error('Neplatná data prostorových bodů.');
  const nodes=new Map();
  for(const n of d.nodes3d){if(!validPoint3(n)||typeof n.id!=='string'||!/^[-_a-zA-Z0-9]+$/.test(n.id)||nodes.has(n.id))throw Error('Neplatný nebo duplicitní prostorový bod.');nodes.set(n.id,n);}
  for(const m of d.objects.filter(o=>o.type==='member3d')){
    const a=nodes.get(m.start),b=nodes.get(m.end);
    if(!a||!b||distance3(a,b)<1||!Number.isFinite(m.roll)||Math.abs(m.roll)>360||m.jointMode!=='unresolved')throw Error('Neplatný prostorový profil nebo chybějící koncový bod.');
    for(const e of Object.values(m.ends||{})){if(!e||!['unresolved','square','butt','miter'].includes(e.kind))throw Error('Neplatný typ prostorového spoje.');if(['butt','miter'].includes(e.kind)&&!d.objects.some(t=>t.type==='member3d'&&t.id===e.targetId&&t.id!==m.id))throw Error('Chybí protilehlý profil spoje.');if(e.kind==='butt'&&(!['u','v'].includes(e.axis)||![1,-1].includes(e.sign)||!Number.isFinite(e.gap)||e.gap<0||e.gap>20))throw Error('Neplatná plocha nebo mezera spoje.');if(e.kind==='miter'&&!['start','end'].includes(e.targetEnd))throw Error('Neplatný konec pokosu.');}
  }
  resolveSpatialBindings(d);
}

export function connectedMembers3(p,ids){
  const selected=new Set(ids),ms=members3(p);let changed=true;
  while(changed){changed=false;const nodes=new Set(ms.filter(m=>selected.has(m.id)).flatMap(m=>[m.start,m.end]));
    for(const m of ms){const linked=[m.start,m.end].some(id=>nodes.has(id)||selected.has(node3(p,id)?.binding?.memberId))||Object.values(m.ends||{}).some(e=>selected.has(e.targetId));
      const reverse=ms.some(x=>selected.has(x.id)&&([x.start,x.end].some(id=>node3(p,id)?.binding?.memberId===m.id)||Object.values(x.ends||{}).some(e=>e.targetId===m.id)));
      if((linked||reverse)&&!selected.has(m.id)){selected.add(m.id);changed=true;}}
    for(const plate of p.objects.filter(o=>o.type==='plate3d'&&o.attachment)){if(selected.has(plate.id)&&!selected.has(plate.attachment.memberId)){selected.add(plate.attachment.memberId);changed=true;}if(selected.has(plate.attachment.memberId)&&!selected.has(plate.id)){selected.add(plate.id);changed=true;}}
  }return [...selected].filter(id=>['member3d','plate3d'].includes(p.byId(id)?.type));
}
export function transformMembers3(p,ids,{offset={x:0,y:0,z:0},axis={x:0,y:1,z:0},angle=0,pivot={x:0,y:0,z:0}}={}){
  requirePoint3(offset);requirePoint3(pivot);requirePoint3(axis);if(!Number.isFinite(angle)||Math.abs(angle)>360)throw Error('Otočení musí být −360° až 360°.');
  if(connectedMembers3(p,ids).length!==new Set(ids).size)throw Error('Vyber celou propojenou konstrukci, aby se vazby a sousední profily nerozpojily.');
  const objects=spatialObjects(p).filter(m=>ids.includes(m.id)),ms=objects.filter(o=>o.type==='member3d');if(!objects.length||objects.some(m=>isLocked3(p,m)))throw Error('Vyber odemčené díly.');
  const directions=new Map(ms.map(m=>[m.id,basis(p,m).u])),nodes=new Set(ms.flatMap(m=>[m.start,m.end]));
  for(const id of nodes){const n=node3(p,id),v=add(rotatePoint(n,pivot,axis,angle),offset);requirePoint3(v);Object.assign(n,v);}
  for(const m of ms)m.roll=rollFor(p,m,rotatePoint(directions.get(m.id),{x:0,y:0,z:0},axis,angle));
  for(const plate of objects.filter(o=>o.type==='plate3d'))transformPlate3(p,plate,offset,axis,angle,pivot);
  resolveSpatialBindings(p);
}
