const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const version=require('../package.json').version;
const out=path.resolve(__dirname,'../.test-output/packaged-'+version);fs.mkdirSync(out,{recursive:true});
const releaseDir=fs.existsSync(path.resolve(__dirname,'../dist/v'+version))?'../dist/v'+version:'../dist';
const exe=path.resolve(__dirname,releaseDir,'KovoTingl-Dilna-'+version+'.exe');
const port=19438,wait=ms=>new Promise(r=>setTimeout(r,ms));
const log=(s)=>{fs.appendFileSync(path.join(out,'results.log'),s+'\n');console.log(s)};
fs.writeFileSync(path.join(out,'results.log'),'');
const child=process.argv.includes('--attach')?null:spawn(exe,[`--remote-debugging-port=${port}`],{env:{...process.env,KOVO_TEST_DATA:path.join(out,'user-data')},stdio:'ignore',windowsHide:true});
child?.on('error',e=>{log(e.stack);process.exitCode=1});
child?.on('exit',(code,signal)=>log('Launcher exit '+code+' '+(signal||'')));
(async()=>{let ws;try{
  let target;
  for(const deadline=Date.now()+120000;Date.now()<deadline;){try{const list=await(await fetch(`http://127.0.0.1:${port}/json`,{signal:AbortSignal.timeout(2000)})).json();target=list.find(t=>t.type==='page'&&t.url.includes('index.html'));if(target)break}catch{}await wait(500)}
  if(!target)throw Error('Packaged application did not expose its window within 120 seconds');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  let seq=0;const pending=new Map();ws.onmessage=e=>{const r=JSON.parse(e.data);if(pending.has(r.id)){const {resolve,reject}=pending.get(r.id);pending.delete(r.id);r.error?reject(Error(JSON.stringify(r.error))):resolve(r.result)}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(Error('CDP timeout '+method))},15000).unref()});
  if(process.argv.includes('--attach')){
    const current=await call('Runtime.evaluate',{expression:'JSON.stringify({count:window.app?.store?.project?.objects?.length,dirty:window.app?.store?.dirty})',returnByValue:true});
    log('BEFORE RELOAD '+current.result.value);
    const data=JSON.parse(current.result.value);
    if(data.count!==0||data.dirty){log('Preserving edited drawing; read-only package inspection');}
    else {await call('Page.reload');await wait(1000);}
  }
  let result;
  for(let n=0;n<60;n++){
    try{result=await call('Runtime.evaluate',{expression:`(async()=>{if(!window.app)return null;await window.app.ready;return {ready:!!window.app.simple,tool:window.app.canvas.tool,page:document.body.dataset.page,title:document.title,desktop:window.kt.desktop,version:(await window.kt.appInfo()).version}})()`,awaitPromise:true,returnByValue:true});if(result.result?.value)break}catch(e){if(!e.message.includes('context'))throw e}
    await wait(500);
  }
  if(!result?.result?.value)throw Error('Application did not become ready');
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
  const state=result.result.value;log(JSON.stringify(state));
  if(!state.ready||!state.desktop||state.version!==version)throw Error('Unexpected packaged state');
  if(!process.argv.includes('--attach')&&(state.tool!=='sketch'||state.page!=='2d'))throw Error('Unexpected packaged initial tool');
  log('PASS portable executable runs with simple workspace and native bridge');
  if(!process.argv.includes('--attach')){
    const result=await call('Runtime.evaluate',{expression:`(()=>{document.getElementById('btn3d').click();window.app.spatial.pergolaDialog();const ok=!!document.getElementById('s3Width');window.app.modal.close();return ok})()`,returnByValue:true});
    if(result.result?.value!==true)throw Error('Packaged 3D editor is unavailable');log('PASS packaged 3D editor and pergola dialog');
    const sample=fs.readFileSync(path.resolve(__dirname,'../examples/spoje-3d.kov'),'utf8');
    const workshop=await call('Runtime.evaluate',{expression:`(()=>{window.app.loadFrom(${JSON.stringify(sample)},null);const s=window.app.store;s.select(s.project.ofType('member3d')[0].id);document.querySelector('[data-s3="cutdetail"]').click();const ok=s.derived.parts.length===4&&s.derived.parts.every(p=>p.productionReady)&&!!document.querySelector('#modalBody table');window.app.modal.close();window.app.newProject(true);return ok})()`,returnByValue:true});
    if(workshop.result?.value!==true)throw Error('Packaged fabrication failed');log('PASS packaged joints, cut plans and detail dialog');
    const assembly=fs.readFileSync(path.resolve(__dirname,'../examples/pergola-svarovana.kov'),'utf8');
    const solids=await call('Runtime.evaluate',{expression:`(()=>{window.app.loadFrom(${JSON.stringify(assembly)},null);const s=window.app.store;s.select(s.project.ofType('plate3d')[0].id);document.querySelector('[data-s3="platedetail"]').click();const ok=s.derived.parts.length===17&&s.derived.parts.every(p=>p.productionReady)&&s.derived.counts.errors===0&&!!document.querySelector('#modalBody svg')&&typeof window.kt.exportModel==='function';window.app.modal.close();window.app.newProject(true);return ok})()`,returnByValue:true});
    if(solids.result?.value!==true)throw Error('Packaged 3D plates failed');log('PASS packaged welded pergola, drilled plates and export bridge');

  }
  if(!process.argv.includes('--attach')){
    const sample=fs.readFileSync(path.resolve(__dirname,'../examples/obrabeny-jekl.kov'),'utf8');
    const advanced=await call('Runtime.evaluate',{expression:`(async()=>{window.app.loadFrom(${JSON.stringify(sample)},null);const s=window.app.store;s.select(s.project.ofType('member3d')[0].id);window.app.view3d.rebuild();const {exportSTEP}=await import('./ui/spatial-step.js');const text=exportSTEP(window.app.view3d.root,s.project),ok=s.derived.counts.errors===0&&s.project.ofType('member3d')[0].machining.length===2&&text.includes('FACE_SURFACE')&&!!document.querySelector('[data-s3="beamcheck"]');window.app.newProject(true);return ok;})()`,awaitPromise:true,returnByValue:true});
    if(advanced.result?.value!==true)throw Error('Packaged machining and STEP failed');log('PASS packaged machining, engineering controls and STEP geometry');
  }
  try{const capture=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'start.png'),Buffer.from(capture.data,'base64'));}catch(e){log('WARN optional screenshot: '+e.message);}
  if(!process.argv.includes('--attach')){await call('Runtime.evaluate',{expression:'window.close();true'});log('PASS packaged window closes');}
}catch(e){log(e.stack);process.exitCode=1}finally{ws?.close();setTimeout(()=>process.exit(process.exitCode||0),500)}})();
