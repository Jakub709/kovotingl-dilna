import * as G from './geom.js';

// Conservative axis-aligned frame inside a convex opening. The gap is measured
// perpendicularly to every wall, including sloping walls.
export function fitOpening(points,gap){
  if(points.length<3)throw Error('Okolí musí mít alespoň tři body a tvořit stavební otvor.');
  const poly=G.ensureCCW(points),bb=G.bboxOf(poly);
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],c=poly[(i+2)%poly.length];
    if(G.cross(G.sub(b,a),G.sub(c,b))<-.001)throw Error('Tento otvor má vnitřní roh. Rozděl jej na jednodušší obrysy nebo vlož rám ručně.');
  }
  const center={x:bb.minX+bb.w/2,y:bb.minY+bb.h/2};let scale=1;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],normal=G.perp(G.norm(G.sub(b,a)));
    const distance=G.dot(G.sub(center,a),normal)-gap;
    const reach=Math.abs(normal.x)*bb.w/2+Math.abs(normal.y)*bb.h/2;
    if(reach>0)scale=Math.min(scale,distance/reach);
  }
  if(!(scale>0))throw Error('Rám se s tímto odstupem do otvoru nevejde.');
  return {x:center.x-bb.w*scale/2,y:center.y-bb.h*scale/2,w:bb.w*scale,h:bb.h*scale};
}
export function resolveReferences(project){
  for(const obj of project.objects){
    if(!obj.referenceFit)continue;
    const ref=project.byId(obj.referenceFit.refId);
    try{if(ref?.type!=='ref')throw Error('Chybí referenční otvor.');Object.assign(obj,fitOpening(ref.points,obj.referenceFit.gap));delete obj.constraintError}
    catch(err){obj.constraintError=err.message}
  }
}
