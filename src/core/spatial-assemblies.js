import {addMember3,node3,requirePoint3} from './spatial.js';
import {newId} from './ids.js';
import {setSquareEnds,setAutoButtEnd,solveSpatialMember} from './spatial-fabrication.js';
import {sectionWidth,sectionDepth} from './materials.js';
import {addBasePlates3} from './spatial-plates.js';

/** Welded beam-and-post assembly. Members meet the sides of continuous beams. */
export function createWeldedPergola3(p,library,{width=4000,depth=3000,height=2400,rise=300,rafters=7,postMaterialId='m_jekl_80_80_4',beamMaterialId='m_jekl_80_80_4',rafterMaterialId='m_jekl_40_40_2',gap=1,basePlates=true,origin={x:0,y:0,z:0}}={}){
  requirePoint3(origin);
  if(![width,depth,height,rise,gap].every(Number.isFinite)||Math.min(width,depth,height)<200||Math.max(width,depth,height)>50000||height+rise<200||Math.abs(rise)>depth/2||gap<0||gap>20||!Number.isInteger(rafters)||rafters<2||rafters>100)throw Error('Neplatné rozměry pergoly, sklon, mezera nebo počet krokví.');
  const post=p.material(postMaterialId,library),beam=p.material(beamMaterialId,library),rafter=p.material(rafterMaterialId,library);
  if([post,beam,rafter].some(m=>!m||!['jekl_ctverec','jekl_obdelnik'].includes(m.category)))throw Error('Zvol jekly pro všechny části pergoly.');
  const overhang=Math.max(sectionWidth(post),sectionWidth(rafter))/2+gap;
  const assembly={id:newId('as'),name:'Svařovaná pergola',visible:true,locked:false,note:''};p.assemblies.push(assembly);
  const point=(x,y,z)=>({x:x+origin.x,y:y+origin.y,z:z+origin.z}),added=[],posts=[];
  const add=(a,b,name,materialId)=>{const m=addMember3(p,a,b,{name,materialId,assemblyId:assembly.id});added.push(m);return m;};
  const beams=[0,depth].map((z,i)=>add(point(-overhang,height+rise*i,z),point(width+overhang,height+rise*i,z),'Nosník '+(i+1),beamMaterialId));
  for(const x of [0,width])for(const [i,z]of[0,depth].entries()){const m=add(point(x,0,z),point(x,height+rise*i,z),'Sloup '+(posts.length+1),postMaterialId);posts.push(m);node3(p,m.end).binding={memberId:beams[i].id,t:(x+overhang)/(width+2*overhang)};}
  for(let i=0;i<rafters;i++){const x=width*i/(rafters-1),m=add(point(x,height,0),point(x,height+rise,depth),'Krokev '+(i+1),rafterMaterialId);for(const [end,j]of [['start',0],['end',1]])node3(p,m[end]).binding={memberId:beams[j].id,t:(x+overhang)/(width+2*overhang)};}
  setSquareEnds(p,added.map(m=>m.id));
  for(const m of posts){const target=node3(p,m.end).binding.memberId;setAutoButtEnd(p,m.id,'end',target,gap,library);}
  for(const m of added.filter(m=>m.name.startsWith('Krokev')))for(const end of ['start','end'])setAutoButtEnd(p,m.id,end,node3(p,m[end]).binding.memberId,gap,library);
  for(const m of added){const result=solveSpatialMember(p,m,library);if(!result.ready)throw Error(m.name+': '+result.issues.join(' '));}
  if(basePlates){const mat=library.items.find(m=>m.category==='plech'&&m.dims.t===8),size=Math.max(180,sectionWidth(post)+80,sectionDepth(post)+80);added.push(...addBasePlates3(p,posts.map(m=>m.id),{width:size,height:size,materialId:mat?.id}));}
  return added;
}
