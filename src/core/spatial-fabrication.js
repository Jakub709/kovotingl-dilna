import {sectionWidth,sectionDepth} from './materials.js';
import {add,sub,mul,dot,cross,norm,length,ends,basis,along,rollFor} from './spatial-geometry.js';

const locked=(p,m)=>m?.locked||p.assemblies?.some(a=>a.id===m?.assemblyId&&a.locked);
const supported=mat=>mat&&['jekl_ctverec','jekl_obdelnik'].includes(mat.category)&&sectionWidth(mat)>0&&sectionDepth(mat)>0;
const descriptor=(m,end)=>m.ends?.[end]||{kind:'unresolved'};
export const endPlaneValue=(plane,u,v)=>plane.t+plane.su*u+plane.sv*v;
function planeInFrame(f,point,normal){const denominator=dot(normal,f.d);if(Math.abs(denominator)<.2588)throw Error('Řez je příliš ostrý (úhel pod 15°).');return {t:dot(normal,sub(point,f.a))/denominator,su:-dot(normal,f.u)/denominator,sv:-dot(normal,f.v)/denominator};}
const corners=(w,h)=>[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
function jointPlane(p,m,end,library,visiting=new Set()){
  const key=m.id+':'+end;if(visiting.has(key))throw Error('Spoje tvoří kruhovou závislost. Zvol průběžný opěrný profil.');
  visiting=new Set(visiting);visiting.add(key);
  const f=basis(p,m),e=descriptor(m,end),at=end==='start'?f.a:f.b,t=end==='start'?0:f.L;
  if(e.kind==='unresolved'||e.kind==='square')return {t,su:0,sv:0,kind:e.kind};
  const target=p.byId(e.targetId);if(target?.type!=='member3d'||target.id===m.id)throw Error('Chybí protilehlý profil spoje.');
  const g=basis(p,target),mat=p.material(target.materialId,library);if(!supported(mat))throw Error('Spoj vyžaduje čtvercový nebo obdélníkový jekl.');
  if(e.kind==='butt'){
    const axes={u:g.u,v:g.v},n=axes[e.axis];if(!n||![1,-1].includes(e.sign))throw Error('Neplatná plocha opěrného jeklu.');
    const normal=mul(n,e.sign),half=(e.axis==='u'?sectionWidth(mat):sectionDepth(mat))/2;
    const projection=dot(sub(at,g.a),g.d),offset=sub(sub(at,g.a),mul(g.d,projection));
    if(length(offset)>.05||projection<-.01||projection>g.L+.01)throw Error('Konec musí ležet na ose opěrného profilu. Použij vazbu bodu.');
    const inward=mul(f.d,end==='start'?1:-1);if(dot(inward,normal)<.2588)throw Error('Zvolená plocha je odvrácená nebo je řez příliš ostrý.');
    const plane=planeInFrame(f,add(at,mul(normal,half+e.gap)),normal);
    const own=p.material(m.materialId,library),other=axes[e.axis==='u'?'v':'u'],limit=(e.axis==='u'?sectionDepth(mat):sectionWidth(mat))/2;
    const supportStart=descriptor(target,'start'),supportEnd=descriptor(target,'end');
    if(supportStart.kind==='unresolved'||supportEnd.kind==='unresolved')throw Error('Nejdříve vyřeš oba konce opěrného profilu.');
    const sa=jointPlane(p,target,'start',library,visiting),sb=jointPlane(p,target,'end',library,visiting);
    for(const [u,v]of corners(sectionWidth(own),sectionDepth(own))){const q=sub(along(f,endPlaneValue(plane,u,v),u,v),mul(normal,e.gap)),local=sub(q,g.a),z=dot(local,g.d),gu=dot(local,g.u),gv=dot(local,g.v);if(z<endPlaneValue(sa,gu,gv)-.05||z>endPlaneValue(sb,gu,gv)+.05||Math.abs(dot(local,other))>limit+.05)throw Error('Celý řez se nevejde na skutečnou plochu opěrného jeklu mezi jeho řezy.');}
    return {...plane,kind:'butt'};
  }
  if(e.kind==='miter'){
    const targetEnd=e.targetEnd,te=descriptor(target,targetEnd),otherNode=target[targetEnd];
    if(!['start','end'].includes(targetEnd)||m[end]!==otherNode||te.kind!=='miter'||te.targetId!==m.id||te.targetEnd!==end)throw Error('Pokos musí spojovat dva vzájemně přiřazené konce ve společném bodě.');
    const own=p.material(m.materialId,library);
    if(!supported(own)||Math.abs(sectionWidth(own)-sectionWidth(mat))>.01||Math.abs(sectionDepth(own)-sectionDepth(mat))>.01||Math.abs((own.dims.t||0)-(mat.dims.t||0))>.01)throw Error('Pokos vyžaduje shodné rozměry a tloušťku jeklů.');
    const da=mul(f.d,end==='start'?1:-1),db=mul(g.d,targetEnd==='start'?1:-1);
    if(length(cross(da,db))<.001)throw Error('Rovnoběžné profily nepotřebují rohový pokos.');
    const normal=norm(sub(da,db)),plane=planeInFrame(f,at,normal),op=planeInFrame(g,at,normal);
    const ownCorners=corners(sectionWidth(own),sectionDepth(own)).map(([u,v])=>along(f,endPlaneValue(plane,u,v),u,v));
    const targetCorners=corners(sectionWidth(mat),sectionDepth(mat)).map(([u,v])=>along(g,endPlaneValue(op,u,v),u,v));
    if(ownCorners.some(q=>!targetCorners.some(r=>length(sub(q,r))<.05)))throw Error('Průřezy pokosu nejsou natočené do společné roviny. Spoj nastav znovu.');
    return {...plane,kind:'miter'};
  }
  throw Error('Neznámý typ prostorového spoje.');
}
export function solveSpatialMember(p,m,library){
  const f=basis(p,m),mat=p.material(m.materialId,library),issues=[];
  if(!supported(mat))return {ready:false,issues:['Výrobní řezy jsou podporované pouze pro jekly.']};
  let start,end;
  try{start=jointPlane(p,m,'start',library);end=jointPlane(p,m,'end',library);}catch(err){return {ready:false,issues:[err.message]};}
  const cs=corners(sectionWidth(mat),sectionDepth(mat)),a=cs.map(([u,v])=>endPlaneValue(start,u,v)),b=cs.map(([u,v])=>endPlaneValue(end,u,v));
  if(a.some((v,i)=>b[i]-v<1))issues.push('Roviny koncových řezů se protínají nebo nezbývá dostatečná délka.');
  const min=Math.min(...a),max=Math.max(...b),stockSpan=max-min,longEdge=Math.max(...a.map((v,i)=>b[i]-v));
  const cut=(plane,isStart)=>({type:'spatial',angle:90-Math.atan(Math.hypot(plane.su,plane.sv))*180/Math.PI,orient:Math.sign((isStart?-1:1)*(Math.abs(plane.su)>1e-7?plane.su:plane.sv)),spatial:true,compound:Math.abs(plane.su)>1e-7&&Math.abs(plane.sv)>1e-7,su:plane.su,sv:plane.sv,t:plane.t-min});
  return {ready:!issues.length&&start.kind!=='unresolved'&&end.kind!=='unresolved',issues,start,end,stockSpan,longEdge,u:f.u,v:f.v,d:f.d,cutL:cut(start,true),cutR:cut(end,false),cornersStart:a.map(t=>t-min),cornersEnd:b.map(t=>t-min)};
}
export function setSquareEnds(p,ids){for(const id of ids){const m=p.byId(id);if(m?.type!=='member3d'||locked(p,m))throw Error('Vyber odemčené 3D profily.');clearMiterPartner(p,m,'start');clearMiterPartner(p,m,'end');m.ends={start:{kind:'square'},end:{kind:'square'}};}}
function clearMiterPartner(p,m,end){const old=descriptor(m,end);if(old.kind==='miter'){const t=p.byId(old.targetId);if(locked(p,t))throw Error('Druhý profil pokosu je zamčený.');if(t?.ends?.[old.targetEnd]?.targetId===m.id)t.ends[old.targetEnd]={kind:'unresolved'};}}
export function setButtEnd(p,id,end,targetId,axis,sign,gap,library){
  const m=p.byId(id);if(m?.type!=='member3d'||locked(p,m)||!['start','end'].includes(end)||!Number.isFinite(gap)||gap<0||gap>20)throw Error('Neplatný nebo zamčený konec spoje; mezera musí být 0–20 mm.');
  clearMiterPartner(p,m,end);m.ends={...m.ends,[end]:{kind:'butt',targetId,axis,sign,gap}};
  jointPlane(p,m,end,library);
}
export function setMiterJoint(p,firstId,secondId,library){
  const a=p.byId(firstId),b=p.byId(secondId);if(a?.type!=='member3d'||b?.type!=='member3d'||a===b||locked(p,a)||locked(p,b))throw Error('Vyber dva odemčené 3D profily.');
  const shared=['start','end'].flatMap(e=>['start','end'].filter(q=>a[e]===b[q]).map(q=>[e,q]));if(shared.length!==1)throw Error('Profily musí mít jeden společný koncový bod.');
  const [ae,be]=shared[0],fa=basis(p,a),fb=basis(p,b),normal=norm(cross(fa.d,fb.d));
  for(const [m,e,f] of [[a,ae,fa],[b,be,fb]]){const fixed=Object.entries(m.ends||{}).some(([k,v])=>k!==e&&v.kind==='miter');clearMiterPartner(p,m,e);if(!fixed)m.roll=rollFor(p,m,norm(cross(normal,f.d)));}
  a.ends={...a.ends,[ae]:{kind:'miter',targetId:b.id,targetEnd:be}};b.ends={...b.ends,[be]:{kind:'miter',targetId:a.id,targetEnd:ae}};
  for(const m of [a,b])for(const e of ['start','end'])jointPlane(p,m,e,library);
}
export function setAutoButtEnd(p,id,end,targetId,gap,library){
  const m=p.byId(id),target=p.byId(targetId);if(!m||!target)throw Error('Vyber oba profily.');
  const f=basis(p,m),g=basis(p,target),inward=mul(f.d,end==='start'?1:-1);
  const face=['u','v'].flatMap(axis=>[1,-1].map(sign=>({axis,sign,score:dot(inward,mul(g[axis],sign))}))).sort((a,b)=>b.score-a.score)[0];
  setButtEnd(p,id,end,targetId,face.axis,face.sign,gap,library);
}
