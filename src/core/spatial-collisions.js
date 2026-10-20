import {partSolid} from './spatial-solid.js';
import {meshPolygons,booleanPolygons,solidVolume} from './solid-boolean.js';
import {basis,along,sub,cross,dot,length,mul} from './spatial-geometry.js';
import {plateVertices} from './spatial-plates.js';
import {endPlaneValue} from './spatial-fabrication.js';
const faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
export function spatialEnvelope(project,part){
  let vertices;
  if(part.plate3d)vertices=plateVertices(project,project.byId(part.objectId));
  else if(part.axis3d){const m=project.byId(part.objectId),f=basis(project,m),fab=part.fabrication,planes=fab?.start&&fab?.end&&!fab.issues.length?[fab.start,fab.end]:[{t:0,su:0,sv:0},{t:f.L,su:0,sv:0}];vertices=planes.flatMap(plane=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>{const u=x*part.profileWidth/2,v=y*part.profileDepth/2;return along(f,endPlaneValue(plane,u,v),u,v);}));}else return null;
  const normals=faces.map(([a,b,c])=>cross(sub(vertices[b],vertices[a]),sub(vertices[c],vertices[a]))),directions=edges.map(([a,b])=>sub(vertices[b],vertices[a]));
  return {id:part.objectId,vertices,normals,directions,min:{x:Math.min(...vertices.map(v=>v.x)),y:Math.min(...vertices.map(v=>v.y)),z:Math.min(...vertices.map(v=>v.z))},max:{x:Math.max(...vertices.map(v=>v.x)),y:Math.max(...vertices.map(v=>v.y)),z:Math.max(...vertices.map(v=>v.z))}};
}
/** SAT for convex outer envelopes. Hollow interiors and holes are intentionally ignored. */
export function envelopesOverlap(a,b,tolerance=.2){
  if(['x','y','z'].some(k=>Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k])<=tolerance))return false;
  const axes=[...a.normals,...b.normals,...a.directions.flatMap(u=>b.directions.map(v=>cross(u,v)))];
  for(const axis of axes){const l=length(axis);if(l<1e-8)continue;const n=mul(axis,1/l),aa=a.vertices.map(v=>dot(v,n)),bb=b.vertices.map(v=>dot(v,n));if(Math.min(Math.max(...aa),Math.max(...bb))-Math.max(Math.min(...aa),Math.min(...bb))<=tolerance)return false;}
  return true;
}
export function spatialCollisions(project,parts,library){
  const cache=new Map(),byId=new Map(parts.map(p=>[p.objectId,p]));let limited=false,exact=0;
  const solid=id=>{if(!cache.has(id)){const g=partSolid(project,byId.get(id),library);cache.set(id,meshPolygons(g));g.dispose();}return cache.get(id);};
  const envelopes=parts.map(p=>spatialEnvelope(project,p)).filter(Boolean).sort((a,b)=>a.min.x-b.min.x),pairs=[];let candidates=0;
  for(let i=0;i<envelopes.length;i++)for(let j=i+1;j<envelopes.length&&envelopes[j].min.x<envelopes[i].max.x-.2;j++){
    const a=envelopes[i],b=envelopes[j];if(['y','z'].some(k=>Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k])<=.2))continue;
    if(++candidates>50000)return {pairs,limited:true};
    if(envelopesOverlap(a,b)){let hit=true;try{if(++exact>100){limited=true;}else hit=solidVolume(booleanPolygons(solid(a.id),solid(b.id),'intersect'))>.01;}catch{limited=true;}if(hit)pairs.push([a.id,b.id]);if(pairs.length>=100)return {pairs,limited:true};}
  }return {pairs,limited};
}
