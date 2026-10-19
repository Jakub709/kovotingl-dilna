const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const archive=path.join(root,'dist','v'+version,'win-unpacked','resources','app.asar');
const files=['main.js','preload.js'];
function walk(relative){for(const item of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const name=relative+'/'+item.name;if(item.isDirectory())walk(name);else files.push(name)}}walk('src');
for(const file of files)assert.ok(fs.readFileSync(path.join(root,file)).equals(asar.extractFile(archive,path.normalize(file))),'Packaged/source mismatch: '+file);
assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,version);
console.log(`${files.length} runtime files match packaged version ${version}.`);
