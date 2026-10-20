import {isLocked3} from './spatial-plates.js';
export function validateMachining(m){
  if(m.machining===undefined)return;
  if(!Array.isArray(m.machining)||m.machining.length>12)throw Error('Nejvýše 12 obrábění na jeden profil.');
  for(const o of m.machining){
    if(!o||!['drill','box'].includes(o.kind)||!['u','v'].includes(o.axis)||![1,-1].includes(o.sign)||typeof o.through!=='boolean')throw Error('Neplatný typ obrábění.');
    for(const key of ['at','offset','depth','angle'])if(!Number.isFinite(o[key])||Math.abs(o[key])>100000)throw Error('Neplatný rozměr obrábění.');
    if(o.depth<=0||Math.abs(o.angle)>180)throw Error('Hloubka musí být kladná, úhel −180 až 180°.');
    for(const key of o.kind==='drill'?['diameter']:['width','height'])if(!Number.isFinite(o[key])||o[key]<1||o[key]>2000)throw Error('Velikost otvoru musí být 1 až 2000 mm.');
  }
}
export function editMachining(p,id,operations){const m=p.byId(id);if(m?.type!=='member3d'||isLocked3(p,m))throw Error('Vyber odemčený prostorový profil.');validateMachining({...m,machining:operations});m.machining=structuredClone(operations);}
export function machiningText(o){return `${o.kind==='drill'?'Vrtání Ø '+o.diameter:'Výřez '+o.width+' × '+o.height} mm; stěna ${o.axis.toUpperCase()}${o.sign>0?'+':'−'}; podél osy ${o.at} mm; příčně ${o.offset} mm; ${o.through?'obě stěny':'hloubka '+o.depth+' mm'}; natočení ${o.angle}°`;}
