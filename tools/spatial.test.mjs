import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/core/store.js';
import {Project,makeProfile} from '../src/core/model.js';
import {addMember3,createPergola3,members3,node3,endpoints3,moveNode3,resizeMember3,repeatMembers3,distance3} from '../src/core/spatial.js';
import * as THREE from '../src/vendor/three.module.js';
import {View3D} from '../src/ui/view3d.js';

test('pergola creates 13 editable members with true sloping rafter lengths',()=>{
  const s=new Store();createPergola3(s.project);s.recompute();assert.equal(members3(s.project).length,13);
  const rafters=s.derived.parts.filter(p=>p.name==='Krokev');assert.equal(rafters.length,7);assert.ok(Math.abs(rafters[0].length-Math.hypot(3000,300))<1e-8);
  assert.equal(s.derived.parts.filter(p=>p.name==='Sloup'&&p.length===2700).length,2);
});
test('node edit updates every connected member but leaves independent nodes alone',()=>{
  const s=new Store(),p=s.project,a=addMember3(p,{x:0,y:0,z:0},{x:0,y:2400,z:0}),b=addMember3(p,{x:0,y:2400,z:0},{x:4000,y:2400,z:0});assert.equal(a.end,b.start);
  moveNode3(p,a.end,{x:0,y:2600,z:0});s.recompute();assert.equal(s.derived.parts[0].length,2600);assert.equal(node3(p,b.end).y,2400);assert.ok(s.derived.parts[1].length>4000);
});
test('zero length or nonfinite changes roll back the entire transaction',()=>{
  const s=new Store();const m=addMember3(s.project,{x:0,y:0,z:0},{x:0,y:1000,z:0});s.recompute();const before=s.snapshot();
  assert.throws(()=>s.commit('bad',p=>moveNode3(p,m.end,{x:0,y:0,z:0})),/nulovou/);assert.equal(s.snapshot(),before);
  assert.throws(()=>addMember3(s.project,{x:NaN,y:0,z:0},{x:1,y:2,z:3}),/Souřadnice/);
});
test('repeat preserves shared endpoints within copies and isolates originals',()=>{
  const s=new Store(),p=s.project,a=addMember3(p,{x:0,y:0,z:0},{x:0,y:2000,z:0}),b=addMember3(p,{x:0,y:2000,z:0},{x:0,y:2000,z:1000});
  const copies=repeatMembers3(p,[a.id,b.id],2,{x:500,y:0,z:0});assert.equal(copies.length,4);assert.equal(copies[0].end,copies[1].start);assert.notEqual(copies[0].end,a.end);assert.equal(p.nodes3d.length,9);
  moveNode3(p,copies[0].end,{x:500,y:2300,z:0});assert.equal(node3(p,a.end).y,2000);
});
test('repeat collision fails atomically and does not leave orphan nodes',()=>{
  const s=new Store(),a=addMember3(s.project,{x:0,y:0,z:0},{x:0,y:2000,z:0});addMember3(s.project,{x:500,y:0,z:0},{x:500,y:2000,z:0});s.recompute();const before=s.snapshot();
  assert.throws(()=>s.commit('repeat',p=>repeatMembers3(p,[a.id],2,{x:500,y:0,z:0})),/existuje/);assert.equal(s.snapshot(),before);
});
test('deleting a member prunes only unused nodes; undo restores topology',()=>{
  const s=new Store(),a=addMember3(s.project,{x:0,y:0,z:0},{x:0,y:1000,z:0}),b=addMember3(s.project,{x:0,y:1000,z:0},{x:1000,y:1000,z:0});s.commit('delete',p=>p.remove(a.id));assert.equal(s.project.nodes3d.length,2);assert.ok(node3(s.project,b.start));s.undo();assert.equal(s.project.nodes3d.length,3);assert.equal(members3(s.project).length,2);
});
test('3D saves round-trip through format 4 and legacy files still load',()=>{
  const s=new Store();createPergola3(s.project);const json=s.project.toJSON();assert.equal(json.formatVersion,5);const copy=Project.fromJSON(JSON.stringify(json));assert.deepEqual(copy.nodes3d,s.project.nodes3d);assert.deepEqual(copy.objects,s.project.objects);
  const legacy={kind:'kovotingl-project',formatVersion:1,objects:[],assemblies:[]};assert.deepEqual(Project.fromJSON(legacy).nodes3d,[]);
});
test('dangling, duplicate and invalid 3D nodes are rejected on load',()=>{
  const p=new Project();addMember3(p,{x:0,y:0,z:0},{x:0,y:1000,z:0});const raw=()=>JSON.parse(JSON.stringify(p.toJSON()));
  let d=raw();d.nodes3d.pop();assert.throws(()=>Project.fromJSON(d),/bod/);
  d=raw();d.nodes3d.push({...d.nodes3d[0]});assert.throws(()=>Project.fromJSON(d),/duplicitní/);
  d=raw();d.nodes3d[0].x='500';assert.throws(()=>Project.fromJSON(d),/bod/);
  d=raw();d.objects[0].roll=NaN;assert.throws(()=>Project.fromJSON(d),/profil/);
});
test('unresolved 3D parts appear in BOM but cannot enter production cutting plans',()=>{
  const s=new Store();createPergola3(s.project);s.project.add(makeProfile({points:[{x:0,y:0},{x:1000,y:0}],materialId:'m_jekl_40_40_2'}));s.recompute();assert.equal(s.derived.parts.length,14);assert.equal(s.derived.plans[0].totalPieces,1);assert.equal(s.derived.parts.filter(p=>p.productionReady===false).length,13);assert.ok(s.derived.issues.some(i=>i.code==='SPATIAL_DRAFT'));assert.equal(s.derived.counts.errors,0);
});
test('3D extrusion follows arbitrary XYZ axis and roll does not change length',()=>{
  const s=new Store(),m=addMember3(s.project,{x:300,y:500,z:700},{x:1500,y:2100,z:2700},{roll:33});s.recompute();const part=s.derived.parts[0],root=new THREE.Group();
  const v=Object.create(View3D.prototype);Object.assign(v,{store:s,root,showEdges:false});v.addProfilePart(part);
  assert.equal(root.children.length,1);const mesh=root.children[0],pos=mesh.geometry.attributes.position,{a,b}=endpoints3(s.project,m),dir=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z).normalize();let min=Infinity,max=-Infinity;
  for(let i=0;i<pos.count;i++){const t=new THREE.Vector3(pos.getX(i)-a.x,pos.getY(i)-a.y,pos.getZ(i)-a.z).dot(dir);min=Math.min(min,t);max=Math.max(max,t)}assert.ok(Math.abs(min)<0.001);assert.ok(Math.abs(max-distance3(a,b))<0.001);
});
test('locked connected members prevent node edits',()=>{const p=new Project(),m=addMember3(p,{x:0,y:0,z:0},{x:0,y:1000,z:0});m.locked=true;assert.throws(()=>moveNode3(p,m.end,{x:0,y:2000,z:0}),/zamčený/)});
test('length editing preserves start and 3D direction while moving attached profiles',()=>{const p=new Project(),a=addMember3(p,{x:100,y:200,z:300},{x:400,y:600,z:1500}),b=addMember3(p,{x:400,y:600,z:1500},{x:1000,y:600,z:1500});resizeMember3(p,a.id,2600);const e=endpoints3(p,a);assert.deepEqual({x:e.a.x,y:e.a.y,z:e.a.z},{x:100,y:200,z:300});assert.ok(Math.abs(distance3(e.a,e.b)-2600)<1e-8);assert.equal(e.b.x,700);assert.equal(node3(p,b.start).z,2700)});
test('invalid pergola dimensions and fractional repeats are rejected',()=>{const p=new Project();assert.throws(()=>createPergola3(p,{width:-1}),/rozměry/);const m=addMember3(p,{x:0,y:0,z:0},{x:0,y:1000,z:0});assert.throws(()=>repeatMembers3(p,[m.id],2.5,{x:100,y:0,z:0}),/Počet/)});
