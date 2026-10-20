import * as THREE from '../vendor/three.module.js';
import {sectionOutline} from './materials.js';
import {basis,sub,dot,length,add,mul,cross} from './spatial-geometry.js';
import {meshPolygons,booleanPolygons,triangles,solidVolume} from './solid-boolean.js';
import {validateMachining} from './spatial-machining.js';
export function polygonsGeometry(polys){
  // Split T junctions before triangulating: avoids false edges across flat faces.
  const vertices=[...new Map(polys.flatMap(p=>p.v).map(v=>[[v.x,v.y,v.z].map(x=>x.toFixed(5)).join(','),v])).values()],data=[];
  for(const p of polys){const border=[];for(let i=0;i<p.v.length;i++){const a=p.v[i],b=p.v[(i+1)%p.v.length],d=sub(b,a),l2=dot(d,d),mid=[];for(const v of vertices){const q=sub(v,a),t=dot(q,d)/l2;if(t>1e-7&&t<1-1e-7&&length(cross(q,d))/Math.sqrt(l2)<1e-5)mid.push({v,t});}border.push(a,...mid.sort((x,y)=>x.t-y.t).map(x=>x.v));}const center=mul(border.reduce((a,b)=>add(a,b),{x:0,y:0,z:0}),1/border.length);for(let i=0;i<border.length;i++)for(const v of [center,border[i],border[(i+1)%border.length]])data.push(v.x,v.y,v.z);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data,3));g.computeVertexNormals();return g;
}
function cutter(o,part){
  const u=o.axis==='u',half=(u?part.profileWidth:part.profileDepth)/2,depth=o.through?2*half+4:o.depth+1;
  // Local cutter X is across the face; Y follows member axis; Z points outward.
  const shape=new THREE.Shape();if(o.kind==='drill')shape.absarc(0,0,o.diameter/2,0,Math.PI*2,false);else {shape.moveTo(-o.width/2,-o.height/2);shape.lineTo(o.width/2,-o.height/2);shape.lineTo(o.width/2,o.height/2);shape.lineTo(-o.width/2,o.height/2);shape.closePath();}
  const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:32});g.translate(0,0,-depth/2);g.rotateZ(o.angle*Math.PI/180);
  const center=o.through?0:o.sign*(half+(1-o.depth)/2);
  const x=u?new THREE.Vector3(0,1,0):new THREE.Vector3(-1,0,0),y=new THREE.Vector3(0,0,1),z=u?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
  const mat=new THREE.Matrix4().makeBasis(x,y,z);mat.setPosition(u?center:-o.offset,u?o.offset:center,o.at);g.applyMatrix4(mat);const result=meshPolygons(g);g.dispose();return result;
}
export function memberSolid(project,part,material){
  const m=project.byId(part.objectId),f=basis(project,m);validateMachining(m);
  if((m.machining?.length)&&(!part.productionReady||!['jekl_ctverec','jekl_obdelnik'].includes(material.category)))throw Error('Obrábění vyžaduje jekl s vyřešenými koncovými řezy.');
  const outline=sectionOutline(material),shape=new THREE.Shape(outline.outer.map(q=>new THREE.Vector2(q.x,q.y)));for(const hole of outline.holes||[])shape.holes.push(new THREE.Path(hole.map(q=>new THREE.Vector2(q.x,q.y))));
  const g=new THREE.ExtrudeGeometry(shape,{depth:f.L,bevelEnabled:false,curveSegments:20}),a=g.attributes.position;
  if(part.fabrication?.ready)for(let i=0;i<a.count;i++){const plane=a.getZ(i)<f.L/2?part.fabrication.start:part.fabrication.end;a.setZ(i,plane.t+plane.su*a.getX(i)+plane.sv*a.getY(i));}
  let polys=meshPolygons(g);g.dispose();
  for(const o of m.machining||[]){const before=solidVolume(polys);polys=booleanPolygons(polys,cutter(o,part));const after=solidVolume(polys);if(before-after<.01)throw Error('Otvor nebo výřez nezasahuje zbývající materiál profilu.');if(after<1)throw Error('Výřez by odstranil celý profil.');}
  const result=polygonsGeometry(polys),v=q=>new THREE.Vector3(q.x,q.y,q.z),matrix=new THREE.Matrix4().makeBasis(v(f.u),v(f.v),v(f.d));matrix.setPosition(v(f.a));result.applyMatrix4(matrix);return result;
}

export function plateSolid(project,part){const obj=project.byId(part.objectId),th=part.thickness||6;
    const points=part.plate3d?[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:x*part.width/2,y:y*part.height/2})):obj.points;
    const shape = new THREE.Shape(points.map((q) => new THREE.Vector2(q.x, q.y)));
    for (const h of obj.holes || []) {
      const path = new THREE.Path();
      if (h.kind === 'circle') {
        path.absarc(h.cx, h.cy, h.d / 2, 0, Math.PI * 2, true);
      } else {
        // Ovál jako obdélník se zaoblenými konci.
        const r = Math.min(h.w, h.h) / 2;
        if (h.w >= h.h) {
          const dx = h.w / 2 - r;
          path.absarc(h.cx + dx, h.cy, r, -Math.PI / 2, Math.PI / 2, false);
          path.absarc(h.cx - dx, h.cy, r, Math.PI / 2, Math.PI * 1.5, false);
        } else {
          const dy = h.h / 2 - r;
          path.absarc(h.cx, h.cy + dy, r, 0, Math.PI, false);
          path.absarc(h.cx, h.cy - dy, r, Math.PI, Math.PI * 2, false);
        }
      }
      shape.holes.push(path);
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false, curveSegments: 20 });
    if(part.plate3d){const f=part.plate3d,v=q=>new THREE.Vector3(q.x,q.y,q.z),matrix=new THREE.Matrix4().makeBasis(v(f.u),v(f.v),v(f.normal));matrix.setPosition(v(f.origin));geo.applyMatrix4(matrix);}else geo.translate(0, 0, -th / 2);
return geo;
}
export function partSolid(project,part,library){return part.plate3d?plateSolid(project,part):memberSolid(project,part,project.material(part.materialId,library));}
