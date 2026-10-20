import {memberSolid} from './spatial-solid.js';
/**
 * Odvození výrobních dílů (Part) z geometrie (§12, §15).
 *
 * KONVENCE – platí shodně ve 2D, 3D, kusovníku i nářezu (§12):
 *
 *  • Úhel řezu je v UI konvenci pily: 90° = rovný řez kolmo k ose,
 *    45° = pokos. `deviation = 90 − angle` je odklon od kolmice.
 *  • Každý díl má lokální směr od počátečního (levého) k cílovému (pravému)
 *    konci. V nářezu se díl kreslí tímto směrem zleva doprava.
 *  • `orient` říká, která hrana je delší: +1 = hrana na straně perp(směr)
 *    (v nákresu nahoře), −1 = protilehlá (dole), 0 = rovný řez.
 *  • Délka dílu je měřena po nejdelší vnější hraně (§12.2):
 *        L = L_střednice + (t/2)·tan(dev_začátek) + (t/2)·tan(dev_konec)
 *    Rámy počítáme přes střednici, takže pokosový rám vyjde přesně na
 *    vnější rozměr (900 × 1000 → díly 900 a 1000).
 *  • Prořez pily se do délky dílu nezapočítává, jen do rozložení na tyči.
 */
import * as G from './geom.js';
import {solveSpatialMember} from './spatial-fabrication.js';
import {plateFrame} from './spatial-plates.js';
import {endpoints3,distance3} from './spatial.js';
import { makeCut, frameClearRect, meshRect } from './model.js';
import { sectionWidth, sectionDepth, sectionText, categoryKind } from './materials.js';

/** Odklon řezu od kolmice ve stupních. */
export const deviationOf = (cut) => 90 - (cut?.angle ?? 90);

/** Přírůstek vnější hrany od jednoho šikmého konce. */
function endExtension(halfWidth, cut) {
  const dev = deviationOf(cut);
  if (Math.abs(dev) < 1e-6) return 0;
  const clamped = G.clamp(dev, -85, 85);
  return halfWidth * Math.tan(clamped * G.RAD);
}

/** Vnější (nejdelší) délka dílu ze střednicové délky a obou řezů. */
export function outerLength(centerLength, width, cutA, cutB) {
  return centerLength + Math.abs((cutA?.orient ?? 1) * endExtension(width / 2, cutA) + (cutB?.orient ?? 1) * endExtension(width / 2, cutB));
}

/**
 * Úhel pokosu pro lom o δ stupňů (změna směru).
 * Roh 90° → 45° pokos; lom 67° → 90 − 33,5 = 56,5°.
 */
export function miterAngleForBend(deltaDeg) {
  return G.round1(90 - Math.abs(deltaDeg) / 2);
}

/* ------------------------------------------------------------- díl ------- */

function makePart(p) {
  return {
    key: p.key,
    objectId: p.objectId,
    subIndex: p.subIndex ?? 0,
    name: p.name || '',
    defaultName: p.defaultName || p.name || '',
    assemblyId: p.assemblyId || null,
    assemblyName: p.assemblyName || '',
    kind: p.kind || 'profil',
    materialId: p.materialId || null,
    materialName: p.materialName || '',
    materialSection: p.materialSection || '',
    stockLength: p.stockLength ?? 6000,
    length: p.length ?? null,
    centerLength: p.centerLength ?? null,
    width: p.width ?? null,
    height: p.height ?? null,
    thickness: p.thickness ?? null,
    holes: p.holes || [],
    cutL: p.cutL || makeCut(90, 0),
    cutR: p.cutR || makeCut(90, 0),
    axis: p.axis || null,
    axis3d: p.axis3d || null,
    productionReady: p.productionReady !== false,
    fabrication: p.fabrication || null,
    machining: p.machining || [],
    checks: p.checks || {},
    plate3d: p.plate3d || null,
    profileWidth: p.profileWidth ?? null,
    profileDepth: p.profileDepth ?? null,
    bendGeometry: p.bendGeometry || null,
    count: 1,
    note: p.note || '',
    sourceLabel: p.sourceLabel || '',
  };
}

/* --------------------------------------------------------- generátory --- */

/**
 * Vytvoří všechny výrobní díly projektu.
 * @returns {Array} pole dílů v pořadí, v jakém byly objekty vytvořeny
 */
export function buildParts(project, library) {
  const parts = [];
  for (const obj of project.objects) {
    // Visibility is a display preference, never a manufacturing filter.
    switch (obj.type) {
      case 'plate3d': {
        const info=matInfo(project,obj.materialId,library);
        parts.push(makePart({key:`${obj.id}:0`,objectId:obj.id,name:obj.name,assemblyId:obj.assemblyId,assemblyName:project.assemblyName(obj.assemblyId),kind:'plech',materialId:obj.materialId,materialName:info.materialName,materialSection:info.materialSection,width:obj.width,height:obj.height,thickness:obj.thickness,holes:obj.holes.map(h=>({...h})),plate3d:plateFrame(project,obj),note:'Prostorový plech; otvory podle detailu dílu'}));break;
      }
      case 'member3d': {
        const {a,b}=endpoints3(project,obj),info=matInfo(project,obj.materialId,library);
        const fabrication=solveSpatialMember(project,obj,library);
        if(a&&b)parts.push(makePart({key:`${obj.id}:0`,objectId:obj.id,name:obj.name||'3D profil',assemblyId:obj.assemblyId,assemblyName:project.assemblyName(obj.assemblyId),materialId:obj.materialId,materialName:info.materialName,materialSection:info.materialSection,stockLength:info.stockLength,profileWidth:info.width,profileDepth:info.depth,machining:obj.machining||[],checks:obj.checks||{},axis3d:{a:{...a},b:{...b}},length:fabrication.ready?fabrication.longEdge:distance3(a,b),centerLength:distance3(a,b),productionReady:fabrication.ready,fabrication,cutL:fabrication.cutL,cutR:fabrication.cutR,note:fabrication.ready?'3D řezy: viz souřadnice rohů; délka nejdelší hrany':'3D návrh: osová délka; konce nejsou vyřešené'}));
        break;
      }
      case 'frame':
        parts.push(...framePartsOf(project, obj, library));
        break;
      case 'fill':
        parts.push(...fillPartsOf(project, obj, library));
        break;
      case 'mesh':
        parts.push(...meshPartsOf(project, obj, library));
        break;
      case 'plate':
        parts.push(...platePartsOf(project, obj, library));
        break;
      case 'profile':
        parts.push(...profilePartsOf(project, obj, library));
        break;
      default:
        break; // 'ref' a 'dim' do kusovníku nevstupují (§11)
    }
  }
  // Uživatelská pojmenování mají přednost před výchozími.
  for (const p of parts) {
    const obj = project.byId(p.objectId);
    if(p.axis3d){p.beamCheckApplicable=['jekl_ctverec','jekl_obdelnik'].includes(project.material(p.materialId,library)?.category)&&!obj?.machining?.length;p.wallThickness=project.material(p.materialId,library)?.dims?.t;if(obj?.machining?.length){try{memberSolid(project,p,project.material(p.materialId,library)).dispose();}catch(err){p.machiningError=err.message;p.productionReady=false;}}}
    p.note = [obj?.note, p.note].filter(Boolean).join(' · ');
    p.lengthMode = obj?.lengthMode || 'outer';
    if(p.axis3d){p.stockSpan=p.fabrication?.ready?p.fabrication.stockSpan:p.centerLength;p.lengthMode='spatial';}
    if (p.kind === 'profil' && !p.axis3d) {
      const half = (p.profileWidth || 0) / 2;
      p.stockSpan = p.centerLength + Math.abs((p.cutL.orient || 0) * endExtension(half, p.cutL)) + Math.abs((p.cutR.orient || 0) * endExtension(half, p.cutR));
      if (p.lengthMode === 'center') p.length = p.centerLength;
      if (p.lengthMode === 'center') p.note = [p.note, 'Délka měřena v ose'].filter(Boolean).join(' · ');
      if (p.stockSpan > p.length + 0.01) p.note = [p.note, `Polotovar min. ${Math.ceil(p.stockSpan * 10) / 10} mm`].filter(Boolean).join(' · ');
    }
    if (obj?.type === 'plate') {
      const bb = G.bboxOf(obj.points);
      p.shapeKey = JSON.stringify({points:obj.points.map(q=>[G.round1(q.x-bb.minX),G.round1(q.y-bb.minY)]),holes:obj.holes.map(h=>[h.kind,G.round1(h.cx-bb.minX),G.round1(h.cy-bb.minY),h.d,h.w,h.h])});
    }
    const custom = project.partNames[p.key];
    if (custom) {
      p.name = custom;
      p.customName = true;
    }
  }
  return parts;
}

function matInfo(project, materialId, library) {
  const mat = project.material(materialId, library);
  return {
    mat,
    materialId,
    materialName: mat ? mat.name : '',
    materialSection: mat ? sectionText(mat) : '',
    stockLength: mat ? mat.stockLength : 6000,
    width: mat ? sectionWidth(mat) : 0,
    depth: mat ? sectionDepth(mat) : 0,
    kind: mat ? categoryKind(mat.category) : 'profil',
  };
}

function asmOf(project, obj) {
  return { assemblyId: obj.assemblyId, assemblyName: project.assemblyName(obj.assemblyId) };
}

/* ------------------------------------------------------------- rám ------ */

const FRAME_MEMBERS = [
  { slot: 'left', label: 'levý svislý rám', pos: 1 },
  { slot: 'right', label: 'pravý svislý rám', pos: 2 },
  { slot: 'top', label: 'horní vodorovný rám', pos: 3 },
  { slot: 'bottom', label: 'spodní vodorovný rám', pos: 4 },
];

/**
 * Střednice jednotlivých dílů rámu podle režimu rohů (§9.1).
 * Směr je zvolen proti směru hodinových ručiček, takže perp(směr) míří
 * dovnitř rámu a pokos má u všech dílů stejnou orientaci (−1).
 */
export function frameMemberGeometry(frame, t) {
  const { x, y, w, h } = frame;
  const cx0 = x + t / 2, cy0 = y + t / 2;
  const cx1 = x + w - t / 2, cy1 = y + h - t / 2;
  const mode = frame.cornerMode || 'miter';

  const seg = (ax, ay, bx, by) => ({ a: G.v(ax, ay), b: G.v(bx, by) });

  if (mode === 'insertH') {
    // Svislice průběžné (plná výška), vodorovné vsazené mezi ně.
    return {
      left: { ...seg(cx0, y + h, cx0, y), cutA: makeCut(90, 0), cutB: makeCut(90, 0) },
      right: { ...seg(cx1, y, cx1, y + h), cutA: makeCut(90, 0), cutB: makeCut(90, 0) },
      top: { ...seg(cx1 - t / 2, cy1, cx0 + t / 2, cy1), cutA: makeCut(90, 0), cutB: makeCut(90, 0) },
      bottom: { ...seg(cx0 + t / 2, cy0, cx1 - t / 2, cy0), cutA: makeCut(90, 0), cutB: makeCut(90, 0) },
    };
  }
  if (mode === 'throughH') {
    // Vodorovné průběžné (plná šířka), svislice vsazené mezi ně.
    return {
      left: { ...seg(cx0, cy1 - t / 2, cx0, cy0 + t / 2), cutA: makeCut(90, 0), cutB: makeCut(90, 0) },
      right: { ...seg(cx1, cy0 + t / 2, cx1, cy1 - t / 2), cutA: makeCut(90, 0), cutB: makeCut(90, 0) },
      top: { ...seg(x + w, cy1, x, cy1), cutA: makeCut(90, 0), cutB: makeCut(90, 0) },
      bottom: { ...seg(x, cy0, x + w, cy0), cutA: makeCut(90, 0), cutB: makeCut(90, 0) },
    };
  }
  // 'miter' i 'custom' vycházejí ze střednicového obdélníku s pokosem 45°.
  const m = () => makeCut(45, -1, 'miter');
  const base = {
    bottom: { ...seg(cx0, cy0, cx1, cy0), cutA: m(), cutB: m() },
    right: { ...seg(cx1, cy0, cx1, cy1), cutA: m(), cutB: m() },
    top: { ...seg(cx1, cy1, cx0, cy1), cutA: m(), cutB: m() },
    left: { ...seg(cx0, cy1, cx0, cy0), cutA: m(), cutB: m() },
  };
  if (mode === 'custom' && frame.memberCuts) {
    for (const slot of ['left', 'right', 'top', 'bottom']) {
      const mc = frame.memberCuts[slot];
      if (!mc) continue;
      if (mc.start) base[slot].cutA = { ...base[slot].cutA, ...mc.start };
      if (mc.end) base[slot].cutB = { ...base[slot].cutB, ...mc.end };
    }
  }
  return base;
}

function framePartsOf(project, frame, library) {
  const info = matInfo(project, frame.materialId, library);
  const t = info.width || 0;
  const geo = frameMemberGeometry(frame, t);
  const asm = asmOf(project, frame);
  const prefix = frame.name || 'R';

  return FRAME_MEMBERS.map((m, i) => {
    const g = geo[m.slot];
    const centerLength = G.dist(g.a, g.b);
    const length = t > 0 ? outerLength(centerLength, t, g.cutA, g.cutB) : centerLength;
    return makePart({
      key: `${frame.id}:${m.slot}`,
      objectId: frame.id,
      subIndex: i,
      defaultName: `R${m.pos} – ${m.label}`,
      name: `R${m.pos} – ${m.label}`,
      ...asm,
      kind: 'profil',
      materialId: info.materialId,
      materialName: info.materialName,
      materialSection: info.materialSection,
      stockLength: info.stockLength,
      centerLength,
      length,
      cutL: g.cutA,
      cutR: g.cutB,
      axis: { a: g.a, b: g.b },
      profileWidth: info.width,
      profileDepth: info.depth,
      sourceLabel: prefix === 'R' ? 'Rám' : prefix,
    });
  });
}

/* ---------------------------------------------------------- výplň ------- */

/**
 * Rozmístění výplní ve světlosti rámu (§9.2).
 * @returns {{positions:number[], gap:number, edge:number, count:number, span:number, bar:number, ok:boolean}}
 */
export function fillLayout(clearSpan, barWidth, opts) {
  const { mode = 'count', count = 1, maxGap = 120, edgeGapMode = 'equal', edgeGap = null } = opts || {};
  let n = Math.max(0, Math.round(count));

  if (mode === 'gap') {
    // Nejmenší počet, při kterém mezera nepřesáhne zadané maximum.
    const raw = (clearSpan - maxGap) / (barWidth + maxGap);
    n = Math.max(1, Math.ceil(raw - 1e-9));
  }
  if (n <= 0) return { positions: [], gap: 0, edge: 0, count: 0, span: clearSpan, bar: barWidth, ok: true };

  let edge;
  let gap;
  if (edgeGapMode === 'custom' && edgeGap != null) {
    edge = edgeGap;
    gap = n > 1 ? (clearSpan - n * barWidth - 2 * edge) / (n - 1) : 0;
  } else {
    // Krajní mezery stejné jako mezi profily (FR-FILL-003).
    gap = (clearSpan - n * barWidth) / (n + 1);
    edge = gap;
  }

  const positions = [];
  for (let i = 0; i < n; i++) positions.push(edge + i * (barWidth + gap));

  return {
    positions,
    gap: G.round1(gap),
    edge: G.round1(edge),
    count: n,
    span: clearSpan,
    bar: barWidth,
    ok: gap > -1e-6 && edge > -1e-6,
  };
}

function fillPartsOf(project, fill, library) {
  const frame = project.byId(fill.frameId);
  if (!frame) return [];
  const clear = frameClearRect(project, frame, library);
  const info = matInfo(project, fill.materialId, library);
  const bar = info.width || 0;
  if (bar <= 0 || clear.w <= 0 || clear.h <= 0) return [];

  const vertical = fill.dir === 'v';
  const span = vertical ? clear.w : clear.h;
  const runLength = vertical ? clear.h : clear.w;
  const layout = fillLayout(span, bar, fill);
  const asm = asmOf(project, fill);
  const baseName = fill.name || 'V1 – výplň svislá';

  return layout.positions.map((off, i) => {
    const ov = fill.overrides?.[i] || null;
    const length = ov?.length ?? runLength;
    const shift = ov?.offset ?? 0;
    const position = ov?.position ?? (off + bar / 2 + shift);
    const a = vertical
      ? G.v(clear.x + position, clear.y + (ov?.start ?? 0))
      : G.v(clear.x + (ov?.start ?? 0), clear.y + position);
    const b = vertical ? G.v(a.x, a.y + length) : G.v(a.x + length, a.y);

    const cutL = ov?.cutL ? { ...makeCut(90, 0), ...ov.cutL } : makeCut(90, 0);
    const cutR = ov?.cutR ? { ...makeCut(90, 0), ...ov.cutR } : makeCut(90, 0);
    const outer = outerLength(length, bar, cutL, cutR);

    const label = fill.name
      ? layout.positions.length > 1 && ov
        ? `${fill.name} (${i + 1})`
        : fill.name
      : vertical
      ? 'V1 – výplň svislá'
      : 'V1 – výplň vodorovná';

    return makePart({
      key: `${fill.id}:${i}`,
      objectId: fill.id,
      subIndex: i,
      defaultName: baseName,
      name: ov ? `${label} – upraveno` : label,
      ...asm,
      kind: 'profil',
      materialId: info.materialId,
      materialName: info.materialName,
      materialSection: info.materialSection,
      stockLength: info.stockLength,
      centerLength: length,
      length: outer,
      cutL,
      cutR,
      axis: { a, b },
      profileWidth: info.width,
      profileDepth: info.depth,
      note: ov ? 'ručně upraveno' : '',
      sourceLabel: 'Výplň',
    });
  });
}

/* --------------------------------------------------------- pletivo ------ */

function meshPartsOf(project, mesh, library) {
  const r = meshRect(project, mesh, library);
  const info = matInfo(project, mesh.materialId, library);
  const asm = asmOf(project, mesh);
  if (r.w <= 0 || r.h <= 0) return [];
  return [
    makePart({
      key: `${mesh.id}:0`,
      objectId: mesh.id,
      subIndex: 0,
      defaultName: mesh.name || 'PL – pletivo',
      name: mesh.name || 'PL – pletivo',
      ...asm,
      kind: 'pletivo',
      materialId: info.materialId,
      materialName: info.materialName || mesh.meshText || 'Pletivo',
      materialSection: mesh.meshText || info.materialSection,
      stockLength: 0,
      width: G.round1(r.w),
      height: G.round1(r.h),
      note: mesh.meshText || '',
      sourceLabel: 'Pletivo',
    }),
  ];
}

/* ----------------------------------------------------------- plech ------ */

function platePartsOf(project, plate, library) {
  const bb = G.bboxOf(plate.points);
  if (!bb) return [];
  const info = matInfo(project, plate.materialId, library);
  const asm = asmOf(project, plate);
  const thickness = plate.thickness ?? info.mat?.dims?.t ?? 6;

  return [
    makePart({
      key: `${plate.id}:0`,
      objectId: plate.id,
      subIndex: 0,
      defaultName: plate.name || (plate.plateKind === 'patka' ? 'P1 – patka' : 'PL – plech'),
      name: plate.name || (plate.plateKind === 'patka' ? 'P1 – patka' : 'PL – plech'),
      ...asm,
      kind: 'plech',
      materialId: info.materialId,
      materialName: info.materialName,
      materialSection: info.materialSection,
      stockLength: 0,
      width: G.round1(bb.w),
      height: G.round1(bb.h),
      thickness,
      holes: (plate.holes || []).map((h) => ({ ...h })),
      sourceLabel: plate.plateKind === 'patka' ? 'Patka' : 'Plech',
    }),
  ];
}

/* ---------------------------------------------------------- profil ------ */

function profilePartsOf(project, prof, library) {
  const pts = prof.points || [];
  if (pts.length < 2) return [];
  const info = matInfo(project, prof.materialId, library);
  const asm = asmOf(project, prof);
  const t = info.width || 0;
  const asmName = asmOf(project, prof);
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1], length: G.dist(pts[i], pts[i + 1]) });

  // Změny směru v jednotlivých lomech.
  const bends = [];
  for (let i = 1; i < segs.length; i++) {
    const a1 = G.angleOf(G.sub(segs[i - 1].b, segs[i - 1].a));
    const a2 = G.angleOf(G.sub(segs[i].b, segs[i].a));
    bends.push(G.round1(G.normAngle(a2 - a1)));
  }

  /* Jeden ohýbaný díl (§13) – do kusovníku jde jako jeden prvek s geometrií ohybů. */
  if (!prof.closed && (prof.bend === 'bent' || segs.length === 1)) {
    const developed = segs.reduce((s, x) => s + x.length, 0);
    const cutL = prof.cuts?.start || makeCut(90, 0);
    const cutR = prof.cuts?.end || makeCut(90, 0);
    const outer = t > 0 ? outerLength(developed, t, cutL, cutR) : developed;
    return [
      makePart({
        key: `${prof.id}:0`,
        objectId: prof.id,
        subIndex: 0,
        defaultName: prof.name || (segs.length > 1 ? 'Z1 – ohýbaný profil' : 'L1 – profil'),
        name: prof.name || (segs.length > 1 ? 'Z1 – ohýbaný profil' : 'L1 – profil'),
        ...asm,
        kind: 'profil',
        materialId: info.materialId,
        materialName: info.materialName,
        materialSection: info.materialSection,
        stockLength: info.stockLength,
        centerLength: developed,
        length: outer,
        cutL,
        cutR,
        axis: { a: pts[0], b: pts[pts.length - 1] },
        profileWidth: info.width,
        profileDepth: info.depth,
        bendGeometry:
          segs.length > 1
            ? { segments: segs.map((s) => G.round1(s.length)), bends, mode: 'bent' }
            : null,
        note: segs.length > 1 ? `ohýbaný díl, ${segs.length} úseky` : '',
        sourceLabel: 'Profil',
      }),
    ];
  }

  /* Skládaný z více kusů – každý úsek je samostatný díl s pokosem v lomu. */
  return segs.map((s, i) => {
    const closingBend = prof.closed ? G.normAngle(G.angleOf(G.sub(segs[0].b,segs[0].a))-G.angleOf(G.sub(segs.at(-1).b,segs.at(-1).a))) : null;
    const prevBend = i > 0 ? bends[i - 1] : closingBend;
    const nextBend = i < segs.length - 1 ? bends[i] : closingBend;
    const cutL =
      prevBend == null
        ? prof.cuts?.start || makeCut(90, 0)
        : makeCut(miterAngleForBend(prevBend), prevBend > 0 ? -1 : 1, 'miter');
    const cutR =
      nextBend == null
        ? prof.cuts?.end || makeCut(90, 0)
        : makeCut(miterAngleForBend(nextBend), nextBend > 0 ? -1 : 1, 'miter');
    const outer = t > 0 ? outerLength(s.length, t, cutL, cutR) : s.length;
    return makePart({
      key: `${prof.id}:${i}`,
      objectId: prof.id,
      subIndex: i,
      defaultName: `${prof.name || 'Z'}${segs.length > 1 ? ` – úsek ${i + 1}` : ''}`,
      name: `${prof.name || 'Z1 – lomený profil'}${segs.length > 1 ? ` – úsek ${i + 1}` : ''}`,
      ...asm,
      kind: 'profil',
      materialId: info.materialId,
      materialName: info.materialName,
      materialSection: info.materialSection,
      stockLength: info.stockLength,
      centerLength: s.length,
      length: outer,
      cutL,
      cutR,
      axis: { a: s.a, b: s.b },
      profileWidth: info.width,
      profileDepth: info.depth,
      sourceLabel: 'Profil',
    });
  });
}

/* ------------------------------------------------------- kusovník ------- */

/**
 * Klíč pro sloučení shodných dílů (§15.2).
 * Za shodné se považují díly se stejným materiálem, rozměrem, délkou, oběma
 * řezy a orientací. Výchozí název do klíče nevstupuje – dva pokosové svislíky
 * rámu jsou z hlediska výroby jeden řádek „2 ks“. Ručně přejmenovaný díl se
 * ale slučuje jen se stejně pojmenovaným, aby se záměr uživatele neztratil.
 */
function mergeKey(p, decimals) {
  const r = (x) => (x == null ? '-' : Math.round(x * Math.pow(10, decimals)));
  const cut = (c) => `${r(c.angle)}/${c.orient ?? 0}`;
  return [
    p.axis3d || p.plate3d ? p.objectId : '-',
    p.kind,
    p.assemblyId || '-',
    p.shapeKey || '-',
    p.note || '-',
    p.lengthMode || 'outer',
    p.materialId || '-',
    p.customName ? `#${p.name}` : '-',
    r(p.length),
    r(p.width),
    r(p.height),
    r(p.thickness),
    cut(p.cutL),
    cut(p.cutR),
    (p.holes || []).map((h) => `${h.kind}${r(h.d)}x${r(h.w)}x${r(h.h)}`).join(','),
    p.bendGeometry ? p.bendGeometry.segments.join('|') + '@' + p.bendGeometry.bends.join('|') : '-',
  ].join('#');
}

/**
 * Kusovník: sloučí shodné díly a přiřadí pozice.
 * @returns {Array} řádky kusovníku, každý s polem `sources` (klíče dílů)
 */
export function buildBOM(project, parts) {
  const decimals = 4; // Display rounding must not merge different manufacturing dimensions.
  const merge = project.settings.mergeIdentical !== false;
  const rows = [];
  const index = new Map();

  for (const p of parts) {
    const k = merge ? mergeKey(p, decimals) : p.key;
    if (index.has(k)) {
      const row = index.get(k);
      row.count += 1;
      row.sources.push(p.key);
      row.mergedNames.push(p.name);
      continue;
    }
    const row = { ...p, count: 1, sources: [p.key], mergedNames: [p.name], mergeKey: k };
    index.set(k, row);
    rows.push(row);
  }

  // Kusovník se zobrazuje po materiálech – seřadíme řádky stejně, aby čísla
  // pozic šla po sobě. Pořadí materiálů se řídí prvním výskytem, takže
  // materiál rámu zůstane nahoře.
  const matOrder = new Map();
  for (const r of rows) if (!matOrder.has(r.materialId || '')) matOrder.set(r.materialId || '', matOrder.size);
  rows.sort((a, b) => matOrder.get(a.materialId || '') - matOrder.get(b.materialId || ''));

  rows.forEach((r, i) => {
    r.pos = i + 1;
    if (r.mergedNames.length > 1) r.name = combineNames(r.mergedNames);
  });
  return rows;
}

/**
 * Název sloučeného řádku. Ze „R1 – levý svislý rám“ a „R2 – pravý svislý rám“
 * udělá „R1, R2 – svislý rám“; když se názvy liší úplně, spojí je čárkou.
 */
export function combineNames(names) {
  const uniq = [...new Set(names)];
  if (uniq.length === 1) return uniq[0];

  const split = uniq.map((n) => {
    const i = n.indexOf(' – ');
    return i > 0 ? [n.slice(0, i), n.slice(i + 3)] : [null, n];
  });
  if (split.some(([code]) => code == null)) return uniq.join(', ');

  const codes = split.map(([code]) => code);
  const tails = split.map(([, tail]) => tail.split(' '));
  // Společný konec popisu – „levý svislý rám“ + „pravý svislý rám“ → „svislý rám“.
  let common = [];
  const minLen = Math.min(...tails.map((t) => t.length));
  for (let i = 1; i <= minLen; i++) {
    const word = tails[0][tails[0].length - i];
    if (tails.every((t) => t[t.length - i] === word)) common.unshift(word);
    else break;
  }
  return common.length ? `${codes.join(', ')} – ${common.join(' ')}` : uniq.join(', ');
}

/** Souhrn podle materiálu – pro hlavičku nářezu a kontroly. */
export function materialSummary(parts) {
  const map = new Map();
  for (const p of parts) {
    if (p.kind !== 'profil' || !p.materialId) continue;
    if (!map.has(p.materialId)) {
      map.set(p.materialId, {
        materialId: p.materialId,
        materialName: p.materialName,
        stockLength: p.stockLength,
        totalLength: 0,
        pieces: 0,
      });
    }
    const e = map.get(p.materialId);
    e.totalLength += p.length || 0;
    e.pieces += 1;
  }
  return [...map.values()];
}
