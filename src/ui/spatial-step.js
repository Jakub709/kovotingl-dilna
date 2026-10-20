import {sub,cross,norm} from '../core/spatial-geometry.js';
// ISO 10303-21 / AP214 shell-based surface model; deliberately NOT an analytic BREP.
// Connected triangle faces share an open shell; no closed-solid topology claim.
export function exportSTEP(root,project){
  const lines=[];let id=0;const put=s=>{lines.push(`#${++id}=${s};`);return '#'+id;};
  const app=put("APPLICATION_CONTEXT('automotive_design')");put(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${app})`);
  const pc=put(`PRODUCT_CONTEXT('',${app},'mechanical')`),product=put(`PRODUCT('KovoTingl','KovoTingl','Faceted surface model in mm',(${pc}))`),formation=put(`PRODUCT_DEFINITION_FORMATION('','',${product})`),dc=put(`PRODUCT_DEFINITION_CONTEXT('part definition',${app},'design')`),pd=put(`PRODUCT_DEFINITION('design','',${formation},${dc})`),pds=put(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
  const mm=put('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))'),rad=put('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))'),sr=put('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())'),unc=put(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.001),${mm},'distance_accuracy_value','')`),context=put(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${mm},${rad},${sr})) REPRESENTATION_CONTEXT('','3D'))`);
  const items=[];const real=n=>{if(!Number.isFinite(n))throw Error('Neplatná souřadnice STEP.');const v=Number(n.toFixed(6));return Number.isInteger(v)?v+'.':String(v);};
  for(const mesh of root.children.filter(m=>m.isMesh&&['member3d','plate3d'].includes(project.byId(m.userData.objectId)?.type))){
    const g=mesh.geometry,p=g.attributes.position,idx=g.index,faces=[],points=new Map();
    const point=i=>{const key=[p.getX(i),p.getY(i),p.getZ(i)].map(real).join(',');if(!points.has(key))points.set(key,put(`CARTESIAN_POINT('',(${key}))`));return points.get(key);};
    for(let i=0;i<(idx?idx.count:p.count);i+=3){const refs=[0,1,2].map(k=>point(idx?idx.getX(i+k):i+k));if(new Set(refs).size<3)continue;const vs=[0,1,2].map(k=>{const j=idx?idx.getX(i+k):i+k;return {x:p.getX(j),y:p.getY(j),z:p.getZ(j)};});let normal,axis;try{axis=norm(sub(vs[1],vs[0]));normal=norm(cross(sub(vs[1],vs[0]),sub(vs[2],vs[0])));}catch{continue;}const direction=v=>put(`DIRECTION('',(${[v.x,v.y,v.z].map(real).join(',')}))`),placement=put(`AXIS2_PLACEMENT_3D('',${refs[0]},${direction(normal)},${direction(axis)})`),plane=put(`PLANE('',${placement})`),loop=put(`POLY_LOOP('',(${refs.join(',')}))`),bound=put(`FACE_OUTER_BOUND('',${loop},.T.)`),face=put(`FACE_SURFACE('',(${bound}),${plane},.T.)`);faces.push({face,edges:refs.map((v,k)=>[v,refs[(k+1)%3]].sort().join(':'))});}
    const edgeMap=new Map();faces.forEach((f,i)=>f.edges.forEach(e=>{if(!edgeMap.has(e))edgeMap.set(e,[]);edgeMap.get(e).push(i);}));const seen=new Set(),shells=[];for(let i=0;i<faces.length;i++){if(seen.has(i))continue;const stack=[i],component=[];seen.add(i);while(stack.length){const j=stack.pop();component.push(faces[j].face);for(const edge of faces[j].edges)for(const k of edgeMap.get(edge))if(!seen.has(k)){seen.add(k);stack.push(k);}}shells.push(put(`OPEN_SHELL('',(${component.join(',')}))`));}
    if(shells.length)items.push(put(`SHELL_BASED_SURFACE_MODEL('${String(mesh.userData.objectId).replace(/[^a-zA-Z0-9_-]/g,'_')}',(${shells.join(',')}))`));
  }
  if(!items.length)throw Error('Žádné prostorové díly pro STEP.');
  const rep=put(`MANIFOLD_SURFACE_SHAPE_REPRESENTATION('',(${items.join(',')}),${context})`);put(`SHAPE_DEFINITION_REPRESENTATION(${pds},${rep})`);
  return "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('KovoTingl faceted surfaces; circles approximated'),'2;1');\nFILE_NAME('model.step','"+new Date().toISOString()+"',(''),(''),'KovoTingl','KovoTingl','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n"+lines.join('\n')+'\nENDSEC;\nEND-ISO-10303-21;\n';
}
