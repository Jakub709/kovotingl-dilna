import {newId} from './ids.js';
import {basis,add,sub,mul,cross,dot,norm,length,rotatePoint} from './spatial-geometry.js';

export const spatialObjects=p=>p.objects.filter(o=>['member3d','plate3d'].includes(o.type));
export const isLocked3=(p,o)=>o?.locked||p.assemblies?.some(a=>a.id===o?.assemblyId&&a.locked);
const finitePoint=q=>q&&['x','y','z'].every(k=>Number.isFinite(q[k])&&Math.abs(q[k])<=1e6);
function capsule(h){const w=h.kind==='circle'?h.d:h.w,v=h.kind==='circle'?h.d:h.h,r=Math.min(w,v)/2,dx=w/2-r,dy=v/2-r;return {a:{x:h.cx-dx,y:h.cy-dy},b:{x:h.cx+dx,y:h.cy+dy},r};}
function pointSegment(q,a,b){const x=b.x-a.x,y=b.y-a.y,l=x*x+y*y,t=l?Math.max(0,Math.min(1,((q.x-a.x)*x+(q.y-a.y)*y)/l)):0;return Math.hypot(q.x-a.x-x*t,q.y-a.y-y*t);}
function holeDistance(a,b){const p=capsule(a),q=capsule(b),dx=p.b.x-p.a.x,dy=p.b.y-p.a.y,ex=q.b.x-q.a.x,ey=q.b.y-q.a.y,den=dx*ey-dy*ex;let d=Math.min(pointSegment(p.a,q.a,q.b),pointSegment(p.b,q.a,q.b),pointSegment(q.a,p.a,p.b),pointSegment(q.b,p.a,p.b));if(Math.abs(den)>1e-10){const x=q.a.x-p.a.x,y=q.a.y-p.a.y,t=(x*ey-y*ex)/den,u=(x*dy-y*dx)/den;if(t>=0&&t<=1&&u>=0&&u<=1)d=0;}return d-p.r-q.r;}
export function plateFrame(p,o){
  if(o.attachment){const m=p.objects.find(m=>m.id===o.attachment.memberId);if(m?.type!=='member3d')throw Error('Chybí profil patky.');const f=basis(p,m),start=o.attachment.end==='start',normal=mul(f.d,start?-1:1);return {origin:add(start?f.a:f.b,mul(normal,o.attachment.gap||0)),u:f.u,v:mul(f.v,start?-1:1),normal};}
  return {origin:o.origin,u:o.u,v:o.v,normal:norm(cross(o.u,o.v))};
}
export function platePoint(f,x,y,z=0){return add(f.origin,add(mul(f.u,x),add(mul(f.v,y),mul(f.normal,z))))}
export function validatePlate3(p,o){
  if(!['width','height','thickness'].every(k=>Number.isFinite(o[k])&&o[k]>=1&&o[k]<=100000)||o.thickness>1000)throw Error('Neplatné rozměry 3D plechu.');
  if(o.attachment){if(!['start','end'].includes(o.attachment.end)||!Number.isFinite(o.attachment.gap)||o.attachment.gap<0||o.attachment.gap>100||!p.objects.some(m=>m.id===o.attachment.memberId&&m.type==='member3d'))throw Error('Neplatné uchycení patky.');}
  else if(!finitePoint(o.origin)||!finitePoint(o.u)||!finitePoint(o.v)||Math.abs(length(o.u)-1)>1e-6||Math.abs(length(o.v)-1)>1e-6||Math.abs(dot(o.u,o.v))>1e-6)throw Error('Neplatná poloha nebo orientace plechu.');
  if(!Array.isArray(o.holes)||o.holes.length>200)throw Error('Plech může mít nejvýše 200 otvorů.');
  const checked=[];
  for(const h of o.holes){const w=h.kind==='circle'?h.d:h.w,v=h.kind==='circle'?h.d:h.h;if(!['circle','oval'].includes(h.kind)||![h.cx,h.cy,w,v].every(Number.isFinite)||w<1||v<1||Math.abs(h.cx)+w/2>o.width/2-1||Math.abs(h.cy)+v/2>o.height/2-1)throw Error('Otvor musí být alespoň 1 mm od okraje plechu.');if(checked.some(a=>holeDistance(a,h)<1-1e-8))throw Error('Otvory se překrývají nebo mezi nimi není alespoň 1 mm.');checked.push(h);}
  return o;
}
export function addPlate3(p,options={}){
  if(p.objects.length>=5000)throw Error('Projekt může mít nejvýše 5 000 prvků.');
  const o={id:newId('p3'),type:'plate3d',name:'Plech 3D',visible:true,locked:false,note:'',assemblyId:null,materialId:null,width:180,height:180,thickness:8,origin:{x:0,y:0,z:0},u:{x:1,y:0,z:0},v:{x:0,y:0,z:1},holes:[],...options};validatePlate3(p,o);p.add(o);return o;
}
export function addBasePlates3(p,ids,{width=180,height=180,thickness=8,holeDiameter=14,edge=25,gap=0,materialId}={}){
  const members=ids.map(id=>p.byId(id));if(!members.length||members.some(m=>m?.type!=='member3d'||isLocked3(p,m)))throw Error('Vyber odemčené profily pro patky.');
  if(![holeDiameter,edge].every(Number.isFinite)||holeDiameter<0||edge<0)throw Error('Neplatné otvory patky.');
  return members.map(m=>{if(p.objects.some(o=>o.type==='plate3d'&&o.attachment?.memberId===m.id&&o.attachment.end==='start'))throw Error('Tento profil již má patku.');const holes=holeDiameter?[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({id:newId('h'),kind:'circle',cx:x*(width/2-edge),cy:y*(height/2-edge),d:holeDiameter})):[];return addPlate3(p,{name:'Patka – '+m.name,assemblyId:m.assemblyId,materialId,width,height,thickness,attachment:{memberId:m.id,end:'start',gap},holes});});
}
export function editPlate3(p,id,changes){const o=p.byId(id);if(o?.type!=='plate3d'||isLocked3(p,o))throw Error('Vyber odemčený plech.');const candidate={...o,...changes};validatePlate3(p,candidate);Object.assign(o,candidate);}
export function detachPlate3(p,o){if(!o.attachment)return;const f=plateFrame(p,o);Object.assign(o,{origin:{...f.origin},u:{...f.u},v:{...f.v}});delete o.attachment;}
export function transformPlate3(p,o,offset,axis,angle,pivot){if(o.attachment)return;const f=plateFrame(p,o);o.origin=add(rotatePoint(f.origin,pivot,axis,angle),offset);o.u=rotatePoint(f.u,{x:0,y:0,z:0},axis,angle);o.v=rotatePoint(f.v,{x:0,y:0,z:0},axis,angle);validatePlate3(p,o);}
export function plateVertices(p,o){const f=plateFrame(p,o);return [0,o.thickness].flatMap(z=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>platePoint(f,x*o.width/2,y*o.height/2,z)));}
