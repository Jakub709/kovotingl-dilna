/** Directed endpoint -> support-axis bindings; evaluated transactionally. */
export function resolveSpatialBindings(p){
  const nodes=new Map(p.nodes3d.map(n=>[n.id,n])),members=new Map(p.objects.filter(m=>m.type==='member3d').map(m=>[m.id,m]));
  const visiting=new Set(),done=new Set(),positions=new Map();
  function visit(id){
    if(done.has(id))return positions.get(id);
    if(visiting.has(id))throw Error('Vazby tvoří kruh. Zvol jiný nosník nebo vazbu uvolni.');
    const n=nodes.get(id);if(!n)throw Error('Chybí bod vazby.');visiting.add(id);let point={x:n.x,y:n.y,z:n.z};
    if(n.binding){const m=members.get(n.binding.memberId),t=n.binding.t;if(!m||!Number.isFinite(t)||t<0||t>1)throw Error('Neplatná vazba bodu na nosník.');const a=visit(m.start),b=visit(m.end);point={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};}
    positions.set(id,point);visiting.delete(id);done.add(id);return point;
  }
  for(const n of p.nodes3d)visit(n.id);
  for(const m of members.values()){const a=positions.get(m.start),b=positions.get(m.end);if(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1)throw Error('Vazba by vytvořila nulový profil.');if((m.locked||p.assemblies?.some(a=>a.id===m.assemblyId&&a.locked))&&[m.start,m.end].some(id=>{const n=nodes.get(id),v=positions.get(id);return Math.hypot(n.x-v.x,n.y-v.y,n.z-v.z)>.001}))throw Error('Vazba by posunula zamčený profil.');}
  for(const n of p.nodes3d)Object.assign(n,positions.get(n.id));
}
export function bindSpatialNode(p,nodeId,memberId,t){
  const node=p.nodes3d.find(n=>n.id===nodeId),m=p.byId(memberId);
  if(!node||m?.type!=='member3d'||m.start===nodeId||m.end===nodeId)throw Error('Bod nelze navázat na profil, který z něj vychází.');
  if(p.objects.some(m=>m.type==='member3d'&&(m.locked||p.assemblies?.some(a=>a.id===m.assemblyId&&a.locked))&&(m.start===nodeId||m.end===nodeId)))throw Error('Bod patří zamčenému profilu.');
  if(!Number.isFinite(t)||t<0||t>1)throw Error('Poloha na nosníku musí být 0–100 %.');
  node.binding={memberId,t};resolveSpatialBindings(p);
}
