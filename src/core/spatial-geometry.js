// Right-handed millimetre geometry shared by renderer, joints and fabrication.
export const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
export const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
export const mul=(a,s)=>({x:a.x*s,y:a.y*s,z:a.z*s});
export const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
export const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
export const norm=a=>{const n=Math.hypot(a.x,a.y,a.z);if(n<1e-9)throw Error('Nulový směrový vektor.');return mul(a,1/n)};
export const length=a=>Math.hypot(a.x,a.y,a.z);
export const ends=(p,m)=>({a:p.nodes3d.find(n=>n.id===m.start),b:p.nodes3d.find(n=>n.id===m.end)});
export function basis(p,m){
  const {a,b}=ends(p,m),d=norm(sub(b,a)),ref=Math.abs(d.y)>.999?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const u0=norm(cross(ref,d)),v0=norm(cross(d,u0)),r=m.roll*Math.PI/180;
  return {a,b,d,u:add(mul(u0,Math.cos(r)),mul(v0,Math.sin(r))),v:add(mul(v0,Math.cos(r)),mul(u0,-Math.sin(r))),L:length(sub(b,a))};
}
export function rotatePoint(point,pivot,axis,degrees){const q=sub(point,pivot),d=norm(axis),r=degrees*Math.PI/180;return add(pivot,add(add(mul(q,Math.cos(r)),mul(cross(d,q),Math.sin(r))),mul(d,dot(d,q)*(1-Math.cos(r)))))}
export function rollFor(p,m,desiredU){const zero=basis(p,{...m,roll:0});return Math.atan2(dot(desiredU,zero.v),dot(desiredU,zero.u))*180/Math.PI}
export const along=(f,t,u=0,v=0)=>add(f.a,add(mul(f.d,t),add(mul(f.u,u),mul(f.v,v))));
