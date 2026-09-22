import * as G from './geom.js';
import {makeCut} from './model.js';
export function connectProfiles(project,firstId,secondId){
  const a=project.byId(firstId),b=project.byId(secondId);
  if(a?.type!=='profile'||b?.type!=='profile'||a.points.length!==2||b.points.length!==2)throw Error('Vyber dva samostatné rovné profily.');
  const hit=G.lineIntersect(a.points[0],G.sub(a.points[1],a.points[0]),b.points[0],G.sub(b.points[1],b.points[0]));
  if(!hit)throw Error('Rovnoběžné profily nelze spojit pokosem.');
  const ai=G.dist(hit,a.points[0])<G.dist(hit,a.points[1])?0:1,bi=G.dist(hit,b.points[0])<G.dist(hit,b.points[1])?0:1;
  const da=G.sub(hit,a.points[1-ai]),db=G.sub(b.points[1-bi],hit);
  if(G.len(da)<1||G.len(db)<1)throw Error('Spoj by vytvořil nulovou délku dílu.');
  const turn=G.normAngle(G.angleOf(db)-G.angleOf(da));
  const angle=90-Math.abs(turn)/2;
  if(angle<15)throw Error('Spoj je příliš ostrý pro dovolený rozsah řezů.');
  const orientation=turn>0?-1:1;
  a.points[ai]={...hit};b.points[bi]={...hit};
  a.cuts[ai===0?'start':'end']=makeCut(angle,ai===0?-orientation:orientation,'auto');
  b.cuts[bi===0?'start':'end']=makeCut(angle,bi===0?orientation:-orientation,'auto');
  return {firstId,secondId,angle};
}
