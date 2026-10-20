// Optional independent importer: npm install --prefix .test-output/step-reader --ignore-scripts occt-import-js
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
require('../.test-output/step-reader/node_modules/occt-import-js')().then(occt=>{
  const result=occt.ReadStepFile(fs.readFileSync(path.join(__dirname,'../.test-output/advanced/model.step')),{linearUnit:'millimeter'});
  assert.equal(result.success,true);assert.equal(result.meshes.length,1);
  const mesh=result.meshes[0],a=mesh.attributes.position.array,idx=mesh.index.array,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let volume=0;
  for(let i=0;i<a.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],a[i+k]);max[k]=Math.max(max[k],a[i+k]);}
  for(let i=0;i<idx.length;i+=3){const p=idx.slice(i,i+3).map(j=>a.slice(j*3,j*3+3));volume+=(p[0][0]*(p[1][1]*p[2][2]-p[1][2]*p[2][1])+p[0][1]*(p[1][2]*p[2][0]-p[1][0]*p[2][2])+p[0][2]*(p[1][0]*p[2][1]-p[1][1]*p[2][0]))/6;}
  const expected=304000-4*Math.PI*6**2-20*30*2;
  assert.ok(Math.abs(Math.abs(volume)-expected)<2,`${volume} != ${expected}`);
  for(let k=0;k<3;k++){assert.ok(Math.abs(min[k]-[-20,-20,0][k])<.001);assert.ok(Math.abs(max[k]-[20,20,1000][k])<.001);}
  const summary={success:true,meshes:result.meshes.length,triangles:idx.length/3,min,max,volume:Math.abs(volume)};
  fs.writeFileSync(path.join(__dirname,'../.test-output/advanced/step-import.json'),JSON.stringify(summary,null,2));console.log(summary);
}).catch(e=>{console.error(e);process.exitCode=1;});
