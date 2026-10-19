/** OBJ in millimetres. Exports visible model meshes, including actual plate holes. */
export function exportOBJ(root,project){
  const out=['# KovoTingl Dilna - units: millimetres'],meshes=root.children.filter(m=>m.isMesh&&project.byId(m.userData.objectId)&&['member3d','plate3d'].includes(project.byId(m.userData.objectId).type));let index=1;
  if(!meshes.length)throw Error('Model neobsahuje viditelné prostorové díly.');
  for(const mesh of meshes){const geometry=mesh.geometry,positions=geometry.attributes.position,indices=geometry.index;out.push('o '+mesh.userData.objectId);for(let i=0;i<positions.count;i++)out.push(`v ${positions.getX(i)} ${positions.getY(i)} ${positions.getZ(i)}`);const count=indices?indices.count:positions.count;for(let i=0;i<count;i+=3)out.push(`f ${index+(indices?indices.getX(i):i)} ${index+(indices?indices.getX(i+1):i+1)} ${index+(indices?indices.getX(i+2):i+2)}`);index+=positions.count;}
  return out.join('\n')+'\n';
}
