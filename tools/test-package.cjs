const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const out=path.resolve(__dirname,'../.test-output/packaged');fs.mkdirSync(out,{recursive:true});
const exe=path.resolve(__dirname,'../dist/KovoTingl-Dilna-0.1.0.exe');
const port=19437,wait=ms=>new Promise(r=>setTimeout(r,ms));
const log=(s)=>{fs.appendFileSync(path.join(out,'results.log'),s+'\n');console.log(s)};
fs.writeFileSync(path.join(out,'results.log'),'');
const child=process.argv.includes('--attach')?null:spawn(exe,[`--remote-debugging-port=${port}`],{env:{...process.env,KOVO_TEST_DATA:path.join(out,'user-data')},stdio:'ignore',windowsHide:true});
child?.on('error',e=>{log(e.stack);process.exitCode=1});
(async()=>{let ws;try{
  let target;
  for(let n=0;n<120;n++){try{const list=await(await fetch(`http://127.0.0.1:${port}/json`)).json();target=list.find(t=>t.type==='page'&&t.url.includes('index.html'));if(target)break}catch{}await wait(500)}
  if(!target)throw Error('Packaged application did not expose its window within 60 seconds');
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
  if(!state.ready||!state.desktop||state.version!=='0.1.0')throw Error('Unexpected packaged state');
  if(!process.argv.includes('--attach')&&(state.tool!=='sketch'||state.page!=='2d'))throw Error('Unexpected packaged initial tool');
  log('PASS portable executable runs with simple workspace and native bridge');
  try{const capture=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'start.png'),Buffer.from(capture.data,'base64'));}catch(e){log('WARN optional screenshot: '+e.message);}
  if(!process.argv.includes('--attach')){await call('Runtime.evaluate',{expression:'window.close();true'});log('PASS packaged window closes');}
}catch(e){log(e.stack);process.exitCode=1}finally{ws?.close();setTimeout(()=>process.exit(process.exitCode||0),500)}})();
