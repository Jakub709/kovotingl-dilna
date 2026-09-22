/**
 * Datový model projektu (§21).
 * Jeden model → 2D, 3D, kusovník i nářezový plán (§2).
 */
import { newId, bumpCounter } from './ids.js';
import * as G from './geom.js';

export const FORMAT_VERSION = 1;

/** Režimy rohového spoje rámu (§9.1). */
export const CORNER_MODES = [
  { key: 'miter', label: 'Pokos 45°', hint: 'Všechny čtyři díly řezané na 45°.' },
  { key: 'insertH', label: 'Rovný spoj – vodorovné vložené', hint: 'Svislice průběžné, vodorovné vsazené mezi ně.' },
  { key: 'throughH', label: 'Rovný spoj – vodorovné průběžné', hint: 'Vodorovné průběžné, svislice vsazené mezi ně.' },
  { key: 'custom', label: 'Vlastní nastavení rohů', hint: 'Každý díl má vlastní řezy.' },
];

export const CUT_TYPES = [
  { key: 'straight', label: '90° (rovný)', angle: 90 },
  { key: 'miter', label: '45° (pokos)', angle: 45 },
  { key: 'custom', label: 'Vlastní úhel', angle: null },
  { key: 'auto', label: 'Automaticky podle průsečíku', angle: null },
];

export const OBJECT_LABELS = {
  frame: 'Rám',
  fill: 'Výplň z profilů',
  mesh: 'Pletivo',
  profile: 'Profil',
  plate: 'Plech / patka',
  ref: 'Okolí / zeď',
  dim: 'Kóta',
};

/* ------------------------------------------------------------- řez ------- */

/**
 * Konec dílu. `angle` je úhel v UI konvenci (§12.1):
 * 90° = rovný řez kolmo k ose, 45° = pokos.
 * `orient` je grafický sklon ve 2D: 1 = "/", -1 = "\", 0 = svislý.
 */
export function makeCut(angle = 90, orient = 0, type = 'straight') {
  return { type, angle, orient, plane: 'vertical', measure: 'outer' };
}

/** Odklon řezu od kolmice (0° = rovný řez). Používá se pro geometrii. */
export function cutDeviation(cut) {
  return 90 - (cut?.angle ?? 90);
}

/* ---------------------------------------------------------- objekty ------ */

function base(type, partial) {
  return {
    id: partial.id || newId(type.slice(0, 2)),
    type,
    name: partial.name || '',
    assemblyId: partial.assemblyId || null,
    visible: partial.visible !== false,
    locked: !!partial.locked,
    note: partial.note || '',
  };
}

export function makeFrame(p = {}) {
  return {
    ...base('frame', p),
    x: p.x ?? 0,
    y: p.y ?? 0,
    w: p.w ?? 900,
    h: p.h ?? 1000,
    materialId: p.materialId || null,
    cornerMode: p.cornerMode || 'miter',
    /** Pro cornerMode 'custom' – řezy jednotlivých dílů. */
    memberCuts: p.memberCuts || null,
    /** Pevný bod při změně rozměru (§FR-DIM-003). */
    anchor: p.anchor || 'bl',
  };
}

export function makeFill(p = {}) {
  return {
    ...base('fill', p),
    frameId: p.frameId || null,
    dir: p.dir || 'v', // 'v' svislá, 'h' vodorovná
    mode: p.mode || 'count', // 'count' | 'gap'
    count: p.count ?? 7,
    maxGap: p.maxGap ?? 120,
    edgeGapMode: p.edgeGapMode || 'equal', // 'equal' | 'custom'
    edgeGap: p.edgeGap ?? null,
    materialId: p.materialId || null,
    /** Ruční úpravy jednotlivých výplní (§FR-FILL-005). */
    manual: !!p.manual,
    overrides: p.overrides || {},
  };
}

export function makeMesh(p = {}) {
  return {
    ...base('mesh', p),
    frameId: p.frameId || null,
    x: p.x ?? 0,
    y: p.y ?? 0,
    w: p.w ?? 800,
    h: p.h ?? 900,
    inset: p.inset ?? 0,
    materialId: p.materialId || null,
    meshText: p.meshText || '',
    overrideW: p.overrideW ?? null,
    overrideH: p.overrideH ?? null,
  };
}

export function makeProfile(p = {}) {
  return {
    ...base('profile', p),
    points: (p.points || [G.v(0, 0), G.v(1000, 0)]).map((q) => ({ x: q.x, y: q.y })),
    materialId: p.materialId || null,
    /** 'bent' = jeden ohýbaný díl, 'cut' = skládaný z více kusů (§13). */
    bend: p.bend || 'bent',
    closed: !!p.closed,
    cuts: p.cuts || { start: makeCut(90, 0), end: makeCut(90, 0) },
    lengthMode: p.lengthMode || 'outer', // 'outer' | 'center'
    anchor: p.anchor || 'start',
  };
}

export function makePlate(p = {}) {
  return {
    ...base('plate', p),
    points: (p.points || G.rectPoints(0, 0, 120, 120)).map((q) => ({ x: q.x, y: q.y })),
    thickness: p.thickness ?? 6,
    materialId: p.materialId || null,
    holes: (p.holes || []).map((h) => ({ ...h })),
    plateKind: p.plateKind || 'patka', // 'patka' | 'plech'
  };
}

export function makeHole(p = {}) {
  return {
    id: p.id || newId('h'),
    kind: p.kind || 'circle', // 'circle' | 'oval'
    cx: p.cx ?? 0,
    cy: p.cy ?? 0,
    d: p.d ?? 14,
    w: p.w ?? 20,
    h: p.h ?? 12,
    /** Kótování od hrany nebo od středu (§FR-PLATE-004). */
    ref: p.ref || 'center',
  };
}

export function makeRef(p = {}) {
  return {
    ...base('ref', p),
    points: (p.points || []).map((q) => ({ x: q.x, y: q.y })),
    closed: !!p.closed,
    refKind: p.refKind || 'zed',
  };
}

export function makeDim(p = {}) {
  return {
    ...base('dim', p),
    a: p.a ? { ...p.a } : { x: 0, y: 0 },
    b: p.b ? { ...p.b } : { x: 100, y: 0 },
    offset: p.offset ?? 60,
    dimKind: p.dimKind || 'linear',
    textShift: p.textShift ?? 0,
  };
}

export function makeAssembly(p = {}) {
  return {
    id: p.id || newId('as'),
    name: p.name || 'Sestava',
    visible: p.visible !== false,
    locked: !!p.locked,
    note: p.note || '',
  };
}

/* -------------------------------------------------------- projekt -------- */

export function defaultSettings() {
  return {
    kerf: 3, // prořez pily (§FR-CUT-003)
    gridStep: 10,
    snap: true,
    showGrid: true,
    showDims: true,
    showRef: true,
    profileFillMode: 'count',
    /** Zaokrouhlení délek dílů v kusovníku. */
    lengthDecimals: 0,
    /** Sloučit shodné díly do jednoho řádku (§15.2). */
    mergeIdentical: true,
    /** Automatická validace při každé změně (§17). */
    autoValidate: true,
    sharedMiter: false, // sdílený pokosový řez v nářezu – nikdy ne automaticky (§16.2)
  };
}

export class Project {
  constructor(p = {}) {
    this.formatVersion = FORMAT_VERSION;
    this.id = p.id || newId('prj');
    this.name = p.name || 'Nový projekt';
    this.customer = p.customer || '';
    this.note = p.note || '';
    this.units = 'mm';
    this.created = p.created || new Date().toISOString();
    this.modified = p.modified || this.created;
    this.settings = { ...defaultSettings(), ...(p.settings || {}) };
    this.assemblies = (p.assemblies || []).map((a) => makeAssembly(a));
    this.objects = p.objects || [];
    /** Snapshot materiálů použitých v projektu (§18). */
    this.materials = p.materials || {};
    /** Ruční zámky nářezu: { [materialId]: { locked:true, bars:[[partKey,...]] } } */
    this.cutLocks = p.cutLocks || {};
    /** Uživatelská pojmenování dílů: { [partKey]: name } */
    this.partNames = p.partNames || {};
  }

  /* --- objekty --- */

  byId(id) {
    return this.objects.find((o) => o.id === id) || null;
  }
  ofType(type) {
    return this.objects.filter((o) => o.type === type);
  }
  add(obj) {
    this.objects.push(obj);
    return obj;
  }
  remove(id) {
    const i = this.objects.findIndex((o) => o.id === id);
    if (i < 0) return null;
    const [obj] = this.objects.splice(i, 1);
    // Závislé objekty (výplně/pletivo v rámu, kóty na objekt) odstraníme s ním.
    this.objects = this.objects.filter((o) => !(('frameId' in o) && o.frameId === id));
    return obj;
  }
  /** Objekty patřící do sestavy. */
  inAssembly(assemblyId) {
    return this.objects.filter((o) => o.assemblyId === assemblyId);
  }
  assembly(id) {
    return this.assemblies.find((a) => a.id === id) || null;
  }
  assemblyName(id) {
    return this.assembly(id)?.name || '';
  }

  /** Je objekt viditelný včetně viditelnosti své sestavy? */
  isVisible(obj) {
    if (!obj.visible) return false;
    const a = obj.assemblyId ? this.assembly(obj.assemblyId) : null;
    return !a || a.visible;
  }

  /* --- materiály --- */

  /** Uloží snapshot materiálu do projektu (§18). */
  useMaterial(mat) {
    if (!mat) return null;
    this.materials[mat.id] = JSON.parse(JSON.stringify(mat));
    return mat.id;
  }
  /** Materiál z projektového snapshotu, s fallbackem na globální knihovnu. */
  material(id, library = null) {
    if (!id) return null;
    if (this.materials[id]) return this.materials[id];
    const m = library?.get(id);
    if (m) {
      this.materials[id] = JSON.parse(JSON.stringify(m));
      return this.materials[id];
    }
    return null;
  }

  /* --- serializace --- */

  toJSON() {
    return {
      kind: 'kovotingl-project',
      formatVersion: FORMAT_VERSION,
      id: this.id,
      name: this.name,
      customer: this.customer,
      note: this.note,
      units: this.units,
      created: this.created,
      modified: this.modified,
      settings: this.settings,
      assemblies: this.assemblies,
      objects: this.objects,
      materials: this.materials,
      cutLocks: this.cutLocks,
      partNames: this.partNames,
    };
  }

  static fromJSON(json) {
    const o = typeof json === 'string' ? JSON.parse(json) : json;
    if (!o || o.kind !== 'kovotingl-project') throw new Error('Soubor není projekt KovoTingl CAD.');
    const data = migrate(o);
    validateDocument(data);
    const p = new Project(data);
    // Posun čítače id, aby se nové id nepřekrývalo s načtenými.
    bumpCounter(p.objects.length + p.assemblies.length + 16);
    return p;
  }
}

/** Migrační mechanismus pro budoucí verze formátu (§18). */
function migrate(data) {
  let d = data;
  if (!d.formatVersion || d.formatVersion < 1) {
    d = { ...d, formatVersion: 1 };
  }
  if (d.formatVersion > FORMAT_VERSION) {
    throw new Error(
      `Projekt byl vytvořen v novější verzi programu (formát ${d.formatVersion}, tento program umí ${FORMAT_VERSION}).`
    );
  }
  return d;
}

/* ---------------------------------------------------- pomocné výpočty ---- */

/** Světlý (vnitřní) obdélník rámu podle šířky profilu. */
export function frameClearRect(project, frame, library) {
  const mat = project.material(frame.materialId, library);
  const t = mat ? sectionW(mat) : 0;
  return { x: frame.x + t, y: frame.y + t, w: Math.max(0, frame.w - 2 * t), h: Math.max(0, frame.h - 2 * t), t };
}

// Lokální kopie, aby model.js nezávisel na materials.js kvůli cyklickému importu.
function sectionW(mat) {
  const d = mat.dims || {};
  switch (mat.category) {
    case 'jekl_ctverec':
      return d.a || 20;
    case 'jekl_obdelnik':
      return d.a || 40;
    case 'trubka':
      return d.d || 25;
    case 'pasovina':
      return d.a || 30;
    case 'uhelnik':
    case 't_profil':
    case 'u_profil':
      return d.a || 40;
    case 'plech':
      return d.t || 3;
    default:
      return d.a || 20;
  }
}

/** Obálka objektu v modelových souřadnicích. */
export function objectBBox(project, obj, library) {
  switch (obj.type) {
    case 'frame':
      return { minX: obj.x, minY: obj.y, maxX: obj.x + obj.w, maxY: obj.y + obj.h, w: obj.w, h: obj.h };
    case 'mesh': {
      const r = meshRect(project, obj, library);
      return { minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h, w: r.w, h: r.h };
    }
    case 'fill': {
      const f = project.byId(obj.frameId);
      if (!f) return null;
      const c = frameClearRect(project, f, library);
      return { minX: c.x, minY: c.y, maxX: c.x + c.w, maxY: c.y + c.h, w: c.w, h: c.h };
    }
    case 'profile':
    case 'plate':
    case 'ref':
      return G.bboxOf(obj.points);
    case 'dim':
      return G.bboxOf([obj.a, obj.b]);
    default:
      return null;
  }
}

/** Skutečný obdélník pletiva (v rámu s odsazením, nebo volně). */
export function meshRect(project, mesh, library) {
  if (mesh.frameId) {
    const f = project.byId(mesh.frameId);
    if (f) {
      const c = frameClearRect(project, f, library);
      const i = mesh.inset || 0;
      return {
        x: c.x + i,
        y: c.y + i,
        w: Math.max(0, (mesh.overrideW ?? c.w - 2 * i)),
        h: Math.max(0, (mesh.overrideH ?? c.h - 2 * i)),
      };
    }
  }
  return { x: mesh.x, y: mesh.y, w: mesh.overrideW ?? mesh.w, h: mesh.overrideH ?? mesh.h };
}

/** Posune objekt o vektor. */
export function translateObject(obj, dx, dy) {
  switch (obj.type) {
    case 'frame':
    case 'mesh':
      obj.x += dx;
      obj.y += dy;
      break;
    case 'profile':
    case 'plate':
      for (const h of obj.holes || []) { h.cx += dx; h.cy += dy; }
    case 'ref':
      obj.points = obj.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      break;
    case 'dim':
      obj.a = { ...obj.a, x: obj.a.x + dx, y: obj.a.y + dy };
      obj.b = { ...obj.b, x: obj.b.x + dx, y: obj.b.y + dy };
      break;
    default:
      break; // fill se posouvá se svým rámem
  }
}

/** Hluboká kopie objektu s novým id. */
export function cloneObject(obj, idMap = null) {
  const copy = JSON.parse(JSON.stringify(obj));
  copy.id = newId(obj.type.slice(0, 2));
  if (idMap) idMap.set(obj.id, copy.id);
  if (copy.holes) copy.holes = copy.holes.map((h) => ({ ...h, id: newId('h') }));
  return copy;
}

function validateDocument(d) {
  const fail=()=>{throw new Error('Projekt obsahuje neplatná data. Původní výkres zůstává otevřený.')};
  if(!Array.isArray(d.objects)||d.objects.length>5000)fail();
  const ids=new Set(),types=new Set(['frame','profile','plate','fill','mesh','ref','dim']);
  const finite=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e8;
  const point=p=>p&&finite(p.x)&&finite(p.y);
  for(const obj of d.objects){
    if(!obj||!types.has(obj.type)||typeof obj.id!=='string'||!/^[-_a-zA-Z0-9]+$/.test(obj.id)||ids.has(obj.id))fail();ids.add(obj.id);
    if(obj.type==='frame'&&![obj.x,obj.y,obj.w,obj.h].every(finite))fail();
    if(['plate','profile','ref'].includes(obj.type)&&(!Array.isArray(obj.points)||obj.points.length>10000||!obj.points.every(point)))fail();
    if(obj.type==='profile'&&obj.points.length<2)fail();
    if(obj.type==='plate'&&(!Array.isArray(obj.holes)||obj.holes.length>2000||!obj.holes.every(h=>finite(h.cx)&&finite(h.cy)&&['circle','oval'].includes(h.kind)&&(h.kind==='circle'?finite(h.d):finite(h.w)&&finite(h.h)))))fail();
    if(obj.type==='fill'&&(!finite(obj.count)||obj.count<0||obj.count>200||!finite(obj.maxGap)||obj.maxGap<=0))fail();
    if(obj.type==='dim'&&(!point(obj.a)||!point(obj.b)))fail();
  }
  if(d.assemblies&&!Array.isArray(d.assemblies))fail();
  if(d.settings&&(!finite(d.settings.kerf??3)||!finite(d.settings.gridStep??10)))fail();
}
