// Polygon BSP operations. All operands are outward-oriented closed meshes in mm.
import {add,sub,mul,dot,cross,length,norm} from './spatial-geometry.js';
const EPS=1e-5;
class Polygon {
  constructor(v){this.v=v;this.n=norm(cross(sub(v[1],v[0]),sub(v[2],v[0])));this.w=dot(this.n,v[0]);}
  flip(){this.v.reverse();this.n=mul(this.n,-1);this.w=-this.w;}
}
function polygon(v){
  const clean=v.filter((p,i)=>length(sub(p,v[(i+v.length-1)%v.length]))>EPS);
  if(clean.length<3)return null;
  for(let i=1;i<clean.length-1;i++)if(length(cross(sub(clean[i],clean[0]),sub(clean[i+1],clean[0])))>EPS*EPS){
    // Rotate to a non-collinear triple, retaining winding.
    for(let j=0;j<clean.length;j++){const a=clean[j],b=clean[(j+1)%clean.length],c=clean[(j+2)%clean.length];if(length(cross(sub(b,a),sub(c,a)))>EPS*EPS)return new Polygon([...clean.slice(j),...clean.slice(0,j)]);}
  }return null;
}
class BSP {
  constructor(polys=[],depth=0){this.polys=[];this.depth=depth;if(polys.length)this.build(polys);}
  split(p,cf,cb,front,back){
    const types=p.v.map(v=>{const d=dot(this.n,v)-this.w;return d>EPS?1:d<-EPS?2:0;});const type=types.reduce((a,b)=>a|b,0);
    if(type===0)(dot(this.n,p.n)>0?cf:cb).push(p);
    else if(type===1)front.push(p);else if(type===2)back.push(p);
    else {const f=[],b=[];for(let i=0;i<p.v.length;i++){const j=(i+1)%p.v.length,a=p.v[i],z=p.v[j],ta=types[i],tz=types[j];if(ta!==2)f.push(a);if(ta!==1)b.push(a);if((ta|tz)===3){const q=add(a,mul(sub(z,a),(this.w-dot(this.n,a))/dot(this.n,sub(z,a))));f.push(q);b.push(q);}}const fp=polygon(f),bp=polygon(b);if(fp)front.push(fp);if(bp)back.push(bp);}
  }
  build(polys){if(!polys.length)return;if(this.depth>350)throw Error('Model je pro booleovskou operaci příliš složitý.');if(!this.n){this.n=polys[0].n;this.w=polys[0].w;}const f=[],b=[];for(const p of polys)this.split(p,this.polys,this.polys,f,b);if(f.length){this.front??=new BSP([],this.depth+1);this.front.build(f);}if(b.length){this.back??=new BSP([],this.depth+1);this.back.build(b);}}
  invert(){for(const p of this.polys)p.flip();this.n=mul(this.n,-1);this.w=-this.w;this.front?.invert();this.back?.invert();[this.front,this.back]=[this.back,this.front];}
  clip(polys){if(!this.n)return polys;let f=[],b=[];for(const p of polys)this.split(p,f,b,f,b);if(this.front)f=this.front.clip(f);b=this.back?this.back.clip(b):[];return f.concat(b);}
  clipTo(b){this.polys=b.clip(this.polys);this.front?.clipTo(b);this.back?.clipTo(b);}
  all(){return this.polys.concat(this.front?.all()||[],this.back?.all()||[]);}
}
export function meshPolygons(geometry){const a=geometry.attributes.position,idx=geometry.index,out=[];for(let i=0;i<(idx?idx.count:a.count);i+=3){const v=[0,1,2].map(k=>{const j=idx?idx.getX(i+k):i+k;return {x:a.getX(j),y:a.getY(j),z:a.getZ(j)};});const p=polygon(v);if(p)out.push(p);}return out;}
export function booleanPolygons(left,right,operation='subtract'){
  if(!left.length||!right.length)return operation==='intersect'?[]:left;
  const clone=ps=>ps.map(p=>new Polygon(p.v.map(v=>({...v}))));const a=new BSP(clone(left)),b=new BSP(clone(right));
  if(operation==='subtract'){a.invert();a.clipTo(b);b.clipTo(a);b.invert();b.clipTo(a);b.invert();a.build(b.all());a.invert();}
  else if(operation==='intersect'){a.invert();b.clipTo(a);b.invert();a.clipTo(b);b.clipTo(a);a.build(b.all());a.invert();}
  else throw Error('Neznámá booleovská operace.');return a.all();
}
export function triangles(polys){return polys.flatMap(p=>p.v.slice(1,-1).map((_,i)=>[p.v[0],p.v[i+1],p.v[i+2]]));}
export function solidVolume(polys){const ts=triangles(polys);if(!ts.length)return 0;const o=ts[0][0];return Math.abs(ts.reduce((s,[a,b,c])=>s+dot(sub(a,o),cross(sub(b,o),sub(c,o)))/6,0));}
