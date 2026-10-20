/**
 * Kontroly a varování (§17).
 *
 * Varování uživatele neblokuje – chybný prvek se zvýrazní a lze pokračovat.
 * Blokující je jen to, co by vytvořilo neplatná data nebo chybný export.
 */
import * as G from './geom.js';
import { frameClearRect, meshRect } from './model.js';
import { sectionWidth } from './materials.js';
import { fillLayout, deviationOf } from './build.js';
import {members3,endpoints3,validPoint3,distance3} from './spatial.js';
import {categoryKind} from './materials.js';
import {spatialCollisions} from './spatial-collisions.js';
import {validatePlate3} from './spatial-plates.js';

export const SEVERITY = { ERROR: 'error', WARN: 'warn', INFO: 'info' };

function issue(code, severity, title, message, objectIds = [], extra = {}) {
  return { code, severity, title, message, objectIds, ...extra };
}

/**
 * @returns {Array} seznam varování
 */
export function validate(project, library, parts, plans = []) {
  const out = [];
  const spatial=members3(project);
  for(const p of parts)if(p.machiningError)out.push(issue('MACHINING',SEVERITY.ERROR,'Neplatné obrábění',p.machiningError,[p.objectId]));
  for(const plate of project.objects.filter(o=>o.type==='plate3d')){
    try{validatePlate3(project,plate);}catch(err){out.push(issue('BAD_PLATE3D',SEVERITY.ERROR,'Neplatný prostorový plech',err.message,[plate.id]));}
    const mat=project.material(plate.materialId,library);
    if(!mat||mat.category!=='plech'||Math.abs(mat.dims.t-plate.thickness)>.001)out.push(issue('PLATE3D_MATERIAL',SEVERITY.ERROR,'Materiál plechu','Tloušťka plechu musí odpovídat zvolenému materiálu.',[plate.id]));
    if(plate.attachment){const m=project.byId(plate.attachment.memberId),end=m?.ends?.[plate.attachment.end];if(end?.kind!=='square')out.push(issue('PLATE3D_END',SEVERITY.WARN,'Zkontroluj napojení patky','Patka leží kolmo k ose. Konec připojeného profilu není potvrzený jako kolmý.',[plate.id,m?.id].filter(Boolean)));}
  }
  const collisions=spatialCollisions(project,parts,library);
  for(const ids of collisions.pairs)out.push(issue('SPATIAL_COLLISION',SEVERITY.WARN,'Možná kolize ve 3D','Materiálové objemy dílů se překrývají. Kontrola odečítá dutiny a obrábění, kruhy aproximuje ploškami. Při částečné kontrole jde pouze o možnou kolizi obálek.',ids));
  if(collisions.limited)out.push(issue('SPATIAL_COLLISION_LIMIT',SEVERITY.WARN,'Kontrola kolizí je částečná','Přesná kontrola narazila na limit počtu dvojic nebo na nevyřešenou geometrii. U některých dvojic se kontrolovaly jen vnější obálky.'));
  const drafts=parts.filter(p=>p.axis3d&&!p.productionReady);
  if(drafts.length)out.push(issue('SPATIAL_DRAFT',SEVERITY.WARN,'3D návrh – nevyřešené konce','Nevyřešené 3D díly mají osové délky a nejsou v nářezu.',drafts.map(p=>p.objectId)));
  for(const part of drafts)for(const message of part.fabrication?.issues||[])out.push(issue('SPATIAL_JOINT',SEVERITY.ERROR,'Zkontroluj prostorový spoj',message,[part.objectId]));
  for(const m of spatial){const {a,b}=endpoints3(project,m),mat=project.material(m.materialId,library);if(!validPoint3(a)||!validPoint3(b)||distance3(a,b)<1)out.push(issue('BAD_SPATIAL',SEVERITY.ERROR,'Neplatný 3D profil','Zkontroluj koncové body profilu.',[m.id]));if(!mat||categoryKind(mat.category)!=='profil')out.push(issue('BAD_SPATIAL_MATERIAL',SEVERITY.ERROR,'Chybí profilový materiál','Přiřaď 3D dílu materiál typu profil.',[m.id]));}

  for (const obj of project.objects) {
    if (obj.constraintError) out.push(issue("REFERENCE",SEVERITY.ERROR,"Vazba na okolí",obj.constraintError,[obj.id]));
    switch (obj.type) {
      case 'frame':
        checkFrame(project, obj, library, out);
        break;
      case 'fill':
        checkFill(project, obj, library, out);
        break;
      case 'mesh':
        checkMesh(project, obj, library, out);
        break;
      case 'plate':
        checkPlate(project, obj, library, out);
        break;
      case 'profile':
        checkProfile(project, obj, library, out);
        break;
      default:
        break;
    }
  }

  for (const plan of plans) for (const bar of plan.bars) {
    if (bar.used > bar.stock + 0.01) out.push(issue('BAR_OVERFLOW', SEVERITY.ERROR, 'Tyč je přeplněná',
      'Na tyči ' + (bar.index+1) + ' je ' + bar.used + ' mm, ale má jen ' + bar.stock + ' mm. Přesuň díl nebo obnov automatický nářez.',
      bar.pieces.map(x => x.part.objectId)));
  }
  checkParts(project, parts, out);
  checkCollisions(project, library, parts, out);

  // Chyby první, pak varování; stabilní pořadí.
  const rank = { error: 0, warn: 1, info: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return out;
}

/* ------------------------------------------------------------- rám ------ */

function checkFrame(project, frame, library, out) {
  const mat = project.material(frame.materialId, library);
  if (!mat) {
    out.push(
      issue('MISSING_MATERIAL', SEVERITY.WARN, 'Chybějící materiál',
        `Rám „${frame.name || frame.id}“ nemá přiřazený materiál, proto nemá správné délky dílů.`, [frame.id])
    );
  }
  if (!(frame.w > 0) || !(frame.h > 0)) {
    out.push(
      issue('BAD_SIZE', SEVERITY.ERROR, 'Neplatný rozměr',
        `Rám má nulový nebo záporný rozměr (${Math.round(frame.w)} × ${Math.round(frame.h)} mm).`, [frame.id])
    );
    return;
  }
  const t = mat ? sectionWidth(mat) : 0;
  if (t > 0 && (frame.w <= 2 * t || frame.h <= 2 * t)) {
    out.push(
      issue('FRAME_NOT_CLOSED', SEVERITY.ERROR, 'Neuzavřený rám',
        `Rám ${Math.round(frame.w)} × ${Math.round(frame.h)} mm je menší než dvojnásobek profilu (${t} mm) – ` +
          'obrys se neuzavře. Zvětši rám nebo zvol menší profil.', [frame.id])
    );
  }
  if (frame.cornerMode === 'custom' && frame.memberCuts) {
    for (const [slot, mc] of Object.entries(frame.memberCuts)) {
      for (const end of ['start', 'end']) {
        const c = mc?.[end];
        if (c && !angleOk(c.angle)) {
          out.push(
            issue('BAD_ANGLE', SEVERITY.ERROR, 'Nemožný úhel',
              `Rám „${frame.name || frame.id}“, díl ${slot}: úhel ${c.angle}° není proveditelný ` +
                '(dovolený rozsah 15°–90°).', [frame.id])
          );
        }
      }
    }
  }
}

function angleOk(a) {
  return Number.isFinite(a) && a >= 15 && a <= 90;
}

/* ---------------------------------------------------------- výplň ------- */

function checkFill(project, fill, library, out) {
  const frame = project.byId(fill.frameId);
  if (!frame) {
    out.push(
      issue('ORPHAN_FILL', SEVERITY.ERROR, 'Výplň bez rámu',
        'Výplň nemá platný rám. Přiřaď ji k rámu nebo ji odstraň.', [fill.id])
    );
    return;
  }
  const mat = project.material(fill.materialId, library);
  if (!mat) {
    out.push(
      issue('MISSING_MATERIAL', SEVERITY.WARN, 'Chybějící materiál',
        'Výplň nemá přiřazený materiál.', [fill.id, frame.id])
    );
    return;
  }
  const clear = frameClearRect(project, frame, library);
  const bar = sectionWidth(mat);
  const span = fill.dir === 'v' ? clear.w : clear.h;
  const layout = fillLayout(span, bar, fill);

  if (!layout.ok || layout.gap < 0) {
    out.push(
      issue('FILL_NO_FIT', SEVERITY.ERROR, 'Výplň se nevejde',
        `${layout.count}× profil ${Math.round(bar)} mm se do světlosti ${Math.round(span)} mm nevejde ` +
          `(mezera by vyšla ${Math.round(layout.gap)} mm). Sniž počet nebo zvol užší profil.`,
        [fill.id, frame.id])
    );
  } else if (layout.gap < 1) {
    out.push(
      issue('FILL_TIGHT', SEVERITY.WARN, 'Výplně na sraz',
        `Mezera mezi výplněmi je ${Math.round(layout.gap)} mm – profily se prakticky dotýkají.`,
        [fill.id, frame.id])
    );
  }
  if (layout.count === 0) {
    out.push(issue('FILL_EMPTY', SEVERITY.INFO, 'Prázdná výplň', 'Výplň má nastaven nulový počet profilů.', [fill.id]));
  }
}

/* --------------------------------------------------------- pletivo ------ */

function checkMesh(project, mesh, library, out) {
  const r = meshRect(project, mesh, library);
  if (!(r.w > 0) || !(r.h > 0)) {
    out.push(
      issue('BAD_SIZE', SEVERITY.ERROR, 'Neplatný rozměr',
        `Pletivo má rozměr ${Math.round(r.w)} × ${Math.round(r.h)} mm.`, [mesh.id])
    );
  }
  if (!mesh.materialId && !mesh.meshText) {
    out.push(
      issue('MISSING_MATERIAL', SEVERITY.WARN, 'Chybějící materiál',
        'Pletivo nemá vybraný typ ani popis.', [mesh.id])
    );
  }
}

/* ----------------------------------------------------------- plech ------ */

function checkPlate(project, plate, library, out) {
  const bb = G.bboxOf(plate.points);
  if (!bb || plate.points.length < 3) {
    out.push(issue('BAD_SHAPE', SEVERITY.ERROR, 'Neplatný tvar', 'Plech nemá uzavřený obrys.', [plate.id]));
    return;
  }
  if (bb.w < 1 || bb.h < 1) {
    out.push(
      issue('BAD_SIZE', SEVERITY.ERROR, 'Neplatný rozměr',
        `Plech má rozměr ${Math.round(bb.w)} × ${Math.round(bb.h)} mm.`, [plate.id])
    );
  }
  if (!plate.materialId) {
    out.push(issue('MISSING_MATERIAL', SEVERITY.WARN, 'Chybějící materiál', 'Plech nemá přiřazený materiál.', [plate.id]));
  }
  if (!(plate.thickness > 0)) {
    out.push(issue('BAD_SIZE', SEVERITY.ERROR, 'Neplatná tloušťka', 'Plech má nulovou tloušťku.', [plate.id]));
  }

  const poly = plate.points;
  for (const h of plate.holes || []) {
    const c = { x: h.cx, y: h.cy };
    const rx = h.kind === 'circle' ? h.d / 2 : h.w / 2;
    const ry = h.kind === 'circle' ? h.d / 2 : h.h / 2;
    const inside = G.pointInPolygon(c, poly);
    const margin = G.distToPolyline(c, poly, true);
    // A slot is a segment swept by a circle. Test that segment against every plate edge.
    const r = Math.min(rx, ry);
    const a = {x:c.x-Math.max(0,rx-ry), y:c.y-Math.max(0,ry-rx)};
    const b = {x:c.x+Math.max(0,rx-ry), y:c.y+Math.max(0,ry-rx)};
    let fits = inside && G.pointInPolygon(a,poly) && G.pointInPolygon(b,poly);
    for (let i=0;i<poly.length;i++) {
      const u=poly[i],v=poly[(i+1)%poly.length];
      const d=G.segIntersect(a,b,u,v) ? 0 : Math.min(G.distToSegment(a,u,v),G.distToSegment(b,u,v),G.distToSegment(u,a,b),G.distToSegment(v,a,b));
      if (d < r-0.01) fits=false;
    }
    if (!fits) {
      out.push(
        issue('HOLE_OUTSIDE', SEVERITY.ERROR, 'Otvor mimo plech',
          `Otvor ${h.kind === 'circle' ? 'Ø' + h.d : h.w + '×' + h.h} mm leží mimo plech nebo přesahuje jeho hranu.`,
          [plate.id], { holeId: h.id })
      );
    }
    if ((h.kind === 'circle' && !(h.d > 0)) || (h.kind === 'oval' && (!(h.w > 0) || !(h.h > 0)))) {
      out.push(issue('BAD_SIZE', SEVERITY.ERROR, 'Neplatný otvor', 'Otvor má nulový rozměr.', [plate.id], { holeId: h.id }));
    }
  }
}

/* ---------------------------------------------------------- profil ------ */

function checkProfile(project, prof, library, out) {
  if (!prof.points || prof.points.length < 2) {
    out.push(issue('BAD_SHAPE', SEVERITY.ERROR, 'Neplatný tvar', 'Profil nemá dva body.', [prof.id]));
    return;
  }
  if (!prof.materialId) {
    out.push(issue('MISSING_MATERIAL', SEVERITY.WARN, 'Chybějící materiál', 'Profil nemá přiřazený materiál.', [prof.id]));
  }
  for (let i = 0; i < prof.points.length - 1; i++) {
    const d = G.dist(prof.points[i], prof.points[i + 1]);
    if (d < 1) {
      out.push(
        issue('BAD_SIZE', SEVERITY.ERROR, 'Neplatný rozměr',
          `Úsek ${i + 1} profilu má délku ${G.round1(d)} mm.`, [prof.id])
      );
    }
  }
  for (const end of ['start', 'end']) {
    const c = prof.cuts?.[end];
    if (c && !angleOk(c.angle)) {
      out.push(
        issue('BAD_ANGLE', SEVERITY.ERROR, 'Nemožný úhel',
          `${end === 'start' ? 'Levý' : 'Pravý'} řez profilu má úhel ${c.angle}°, dovolený rozsah je 15°–90°.`,
          [prof.id])
      );
    }
  }
}

/* ------------------------------------------------------------ díly ------ */

function checkParts(project, parts, out) {
  for (const p of parts || []) {
    if (p.kind === 'profil') {
      if (!(p.length > 0)) {
        out.push(
          issue('BAD_SIZE', SEVERITY.ERROR, 'Neplatná délka',
            `Díl „${p.name}“ má délku ${G.round1(p.length || 0)} mm.`, [p.objectId], { partKey: p.key })
        );
      } else if (p.stockLength > 0 && (p.stockSpan ?? p.length) > p.stockLength) {
        out.push(
          issue('TOO_LONG', SEVERITY.ERROR, 'Díl delší než tyč',
            `Díl „${p.name}“ má ${Math.round(p.length)} mm, ale skladová tyč ${p.materialName} měří ` +
              `${Math.round(p.stockLength)} mm. Rozděl díl nebo změň skladovou délku materiálu.`,
            [p.objectId], { partKey: p.key })
        );
      }
      for (const [side, c] of [['Levý', p.cutL], ['Pravý', p.cutR]]) {
        if (Math.abs(deviationOf(c)) > 75) {
          out.push(
            issue('BAD_ANGLE', SEVERITY.ERROR, 'Nemožný úhel',
              `${side} řez dílu „${p.name}“ má odklon ${Math.round(deviationOf(c))}° od kolmice – ` +
                'takový řez pila nezvládne.', [p.objectId], { partKey: p.key })
          );
        }
      }
    }
    if (!p.materialId) {
      out.push(
        issue('MISSING_MATERIAL', SEVERITY.WARN, 'Chybějící materiál',
          `Díl „${p.name}“ nemá materiál, proto nejde do nářezu.`, [p.objectId], { partKey: p.key })
      );
    }
  }
}

/* -------------------------------------------------------- kolize -------- */

/** Pásy profilů rámu jako čtyři obdélníky. */
function frameBands(project, frame, library) {
  const mat = project.material(frame.materialId, library);
  const t = mat ? sectionWidth(mat) : 0;
  if (t <= 0) return [];
  const { x, y, w, h } = frame;
  return [
    { minX: x, minY: y, maxX: x + t, maxY: y + h },
    { minX: x + w - t, minY: y, maxX: x + w, maxY: y + h },
    { minX: x, minY: y + h - t, maxX: x + w, maxY: y + h },
    { minX: x, minY: y, maxX: x + w, maxY: y + t },
  ].map((b) => ({ ...b, w: b.maxX - b.minX, h: b.maxY - b.minY }));
}

function partBBox(p) {
  if (!p.axis) return null;
  const w = p.profileWidth || 0;
  const a = p.axis.a;
  const b = p.axis.b;
  const bb = G.bboxOf([a, b]);
  // Osa je střednice – rozšíříme na šířku profilu kolmo ke směru.
  const d = G.norm(G.sub(b, a));
  const n = G.perp(d);
  return {
    minX: bb.minX - Math.abs(n.x) * (w / 2),
    maxX: bb.maxX + Math.abs(n.x) * (w / 2),
    minY: bb.minY - Math.abs(n.y) * (w / 2),
    maxY: bb.maxY + Math.abs(n.y) * (w / 2),
  };
}

function checkCollisions(project, library, parts, out) {
  const TOL = 0.5; // překryv menší než půl milimetru bereme jako dotyk

  /* Výplň zasahující do rámu (§17, typický případ). */
  for (const fill of project.ofType('fill')) {
    const frame = project.byId(fill.frameId);
    if (!frame || !project.isVisible(fill)) continue;
    const bands = frameBands(project, frame, library);
    const fillParts = (parts || []).filter((p) => p.objectId === fill.id);
    for (const p of fillParts) {
      const pb = partBBox(p);
      if (!pb) continue;
      for (const band of bands) {
        const inter = G.bboxIntersection(pb, band);
        if (inter && inter.w > TOL && inter.h > TOL) {
          out.push(
            issue('COLLISION', SEVERITY.WARN, 'Kolize',
              `Výplň „${p.name}“ zasahuje do rámu o ${Math.round(Math.min(inter.w, inter.h))} mm.`,
              [fill.id, frame.id], { partKey: p.key })
          );
          break;
        }
      }
    }
  }

  const standalone=(parts||[]).filter(p=>p.axis && project.byId(p.objectId)?.type==='profile' && !p.bendGeometry);
  for(let i=0;i<standalone.length;i++)for(let j=i+1;j<standalone.length;j++){
    const a=standalone[i],b=standalone[j];if(a.objectId===b.objectId)continue;
    const hit=G.segIntersect(a.axis.a,a.axis.b,b.axis.a,b.axis.b);
    const interior=hit && Math.min(G.dist(hit,a.axis.a),G.dist(hit,a.axis.b),G.dist(hit,b.axis.a),G.dist(hit,b.axis.b))>0.5;
    const same=(G.dist(a.axis.a,b.axis.a)<0.5&&G.dist(a.axis.b,b.axis.b)<0.5)||(G.dist(a.axis.a,b.axis.b)<0.5&&G.dist(a.axis.b,b.axis.a)<0.5);
    if(interior||same)out.push(issue('COLLISION',SEVERITY.WARN,'Překrytí profilů','Profily se kříží nebo překrývají. Ověř, zda je tento spoj záměrný.',[a.objectId,b.objectId]));
  }
  /* Překrývající se rámy. */
  const frames = project.ofType('frame').filter((f) => project.isVisible(f));
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const a = frames[i];
      const b = frames[j];
      if (a.assemblyId && a.assemblyId === b.assemblyId) continue; // v jedné sestavě je překryv záměr
      const inter = G.bboxIntersection(
        { minX: a.x, minY: a.y, maxX: a.x + a.w, maxY: a.y + a.h },
        { minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h }
      );
      if (inter && inter.w > TOL && inter.h > TOL) {
        out.push(
          issue('COLLISION', SEVERITY.WARN, 'Kolize',
            `Rámy „${a.name || a.id}“ a „${b.name || b.id}“ se překrývají ` +
              `(${Math.round(inter.w)} × ${Math.round(inter.h)} mm).`, [a.id, b.id])
        );
      }
    }
  }
}

/** Kolik chyb a varování. */
export function countIssues(list) {
  return {
    errors: list.filter((i) => i.severity === SEVERITY.ERROR).length,
    warns: list.filter((i) => i.severity === SEVERITY.WARN).length,
    infos: list.filter((i) => i.severity === SEVERITY.INFO).length,
  };
}
