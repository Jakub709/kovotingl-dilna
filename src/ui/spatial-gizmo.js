import * as THREE from '../vendor/three.module.js';
import {connectedMembers3,transformMembers3} from '../core/spatial.js';
import {spatialEnvelope} from '../core/spatial-collisions.js';

/** Preview is transient; a released drag commits one exact, undoable translation. */
export class SpatialMoveGizmo {
  constructor(editor){
    this.e=editor;this.view=editor.view;this.group=new THREE.Group();this.group.visible=false;
    this.view.scene?.add(this.group);this.drag=null;
    const canvas=this.view.canvas;if(!canvas)return;
    canvas.addEventListener('pointerdown',e=>this.down(e),true);
    canvas.addEventListener('pointermove',e=>this.move(e),true);
    canvas.addEventListener('pointerup',e=>this.up(e),true);
    canvas.addEventListener('pointercancel',()=>this.cancel(),true);
    this.view.controls?.addEventListener('change',()=>{if(!this.drag)this.refresh()});
    editor.store.subscribe(()=>{this.cancel();this.refresh()});
  }
  active(){return this.e.active()&&this.e.tool==='move'}
  ray(event){const r=this.view.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.params.Line.threshold=this.size*.06;ray.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2),this.view.camera);return ray;}
  clear(){for(const child of [...this.group.children]){this.group.remove(child);child.traverse(n=>{n.geometry?.dispose();n.material?.dispose()});}}
  refresh(){
    if(!this.view.camera||this.drag)return;this.group.visible=this.active();if(!this.active()){this.view.requestRender();return;}
    this.clear();const selected=new Set(this.e.selected().map(m=>m.id));const vertices=this.e.store.derived.parts.filter(p=>selected.has(p.objectId)).flatMap(p=>spatialEnvelope(this.e.store.project,p)?.vertices||[]);if(!vertices.length){this.group.visible=false;return;}
    const box=new THREE.Box3().setFromPoints(vertices.map(v=>new THREE.Vector3(v.x,v.y,v.z)));this.center=box.getCenter(new THREE.Vector3());this.size=Math.max(60,this.view.camera.position.distanceTo(this.center)*.12);
    ['x','y','z'].forEach((axis,i)=>{const direction=new THREE.Vector3();direction[axis]=1;const arrow=new THREE.ArrowHelper(direction,this.center,this.size,[0xc44a43,0x36945c,0x3778c0][i],this.size*.25,this.size*.12);arrow.traverse(n=>{n.userData.axis=axis;n.renderOrder=50;if(n.material)n.material.depthTest=false;});this.group.add(arrow);});this.view.requestRender();
  }
  down(event){
    if(!this.active()||event.button!==0)return;const ray=this.ray(event),hit=ray.intersectObjects(this.group.children,true)[0];if(!hit)return;
    const axis=hit.object.userData.axis,direction=new THREE.Vector3();direction[axis]=1;
    const normal=this.view.camera.position.clone().sub(this.center);normal.addScaledVector(direction,-normal.dot(direction));if(normal.lengthSq()<1e-6)return;normal.normalize();
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,this.center),start=ray.ray.intersectPlane(plane,new THREE.Vector3());if(!start)return;
    event.preventDefault();event.stopImmediatePropagation();
    const ids=connectedMembers3(this.e.store.project,this.e.selected().map(m=>m.id));this.e.store.select(ids);
    this.drag={axis,direction,plane,start,ids,delta:0,pointerId:event.pointerId};this.view.canvas.setPointerCapture(event.pointerId);this.view.controls.enabled=false;
  }
  move(event){
    if(!this.drag||event.pointerId!==this.drag.pointerId)return;event.preventDefault();event.stopImmediatePropagation();
    const q=this.ray(event).ray.intersectPlane(this.drag.plane,new THREE.Vector3());if(!q)return;
    const step=event.altKey?1:this.e.step,delta=Math.round(q.sub(this.drag.start).dot(this.drag.direction)/step)*step;this.drag.delta=delta;
    for(const mesh of this.view.root.children)if(mesh.isMesh&&this.drag.ids.includes(mesh.userData.objectId))mesh.position.copy(this.drag.direction).multiplyScalar(delta);
    this.group.position.copy(this.drag.direction).multiplyScalar(delta);this.e.hint.textContent=`Posun ${this.drag.axis.toUpperCase()}: ${delta} mm · krok ${step} mm · Alt = krok 1 mm`;this.view.requestRender();
  }
  up(event){
    if(!this.drag||event.pointerId!==this.drag.pointerId)return;event.preventDefault();event.stopImmediatePropagation();const d=this.drag;this.cancel();
    if(d.delta){const offset={x:0,y:0,z:0};offset[d.axis]=d.delta;try{this.e.store.commit('Posun konstrukce myší',p=>transformMembers3(p,d.ids,{offset}));}catch(err){this.e.app.toast(err.message,'err');}}
    this.refresh();this.e.updateHint();
  }
  cancel(){
    if(this.drag){try{this.view.canvas.releasePointerCapture(this.drag.pointerId)}catch{}for(const mesh of this.view.root.children)if(mesh.isMesh&&this.drag.ids.includes(mesh.userData.objectId))mesh.position.set(0,0,0);this.drag=null;}
    this.group.position.set(0,0,0);if(this.view.controls)this.view.controls.enabled=this.e.tool==='select';
  }
}
