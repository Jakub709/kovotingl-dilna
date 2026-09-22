/**
 * Databáze materiálů (§8).
 * Materiál je vlastnost prvku – každý rám, výplň, L profil, plech i pletivo
 * může mít vlastní materiál.
 */
import { newId } from './ids.js';

export const CATEGORIES = [
  { key: 'jekl_ctverec', label: 'Jekl čtvercový', kind: 'profil', fields: ['a', 't'] },
  { key: 'jekl_obdelnik', label: 'Jekl obdélníkový', kind: 'profil', fields: ['a', 'b', 't'] },
  { key: 'trubka', label: 'Trubka kruhová', kind: 'profil', fields: ['d', 't'] },
  { key: 'pasovina', label: 'Pásovina', kind: 'profil', fields: ['a', 't'] },
  { key: 'uhelnik', label: 'Úhelník (L profil)', kind: 'profil', fields: ['a', 'b', 't'] },
  { key: 't_profil', label: 'T profil', kind: 'profil', fields: ['a', 'b', 't'] },
  { key: 'u_profil', label: 'U profil', kind: 'profil', fields: ['a', 'b', 't'] },
  { key: 'plech', label: 'Plech', kind: 'plech', fields: ['t'] },
  { key: 'pletivo', label: 'Pletivo', kind: 'pletivo', fields: [] },
  { key: 'vlastni', label: 'Vlastní profil', kind: 'profil', fields: ['a', 'b', 't'] },
];

export const FIELD_LABELS = {
  a: 'Šířka / rameno A (mm)',
  b: 'Výška / rameno B (mm)',
  d: 'Průměr D (mm)',
  t: 'Tloušťka stěny (mm)',
};

export function categoryOf(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

export function categoryKind(key) {
  return categoryOf(key).kind;
}

/* ---------------------------------------------------- výchozí katalog ---- */

function M(name, category, dims, extra = {}) {
  return {
    id: extra.id || 'm_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
    name,
    category,
    dims: { a: null, b: null, d: null, t: null, ...dims },
    stockLength: extra.stockLength ?? 6000,
    color: extra.color ?? colorForCategory(category),
    active: true,
    note: extra.note ?? '',
    builtin: true,
  };
}

function colorForCategory(cat) {
  return (
    {
      jekl_ctverec: '#6b7f96',
      jekl_obdelnik: '#5f7387',
      trubka: '#7a8aa0',
      pasovina: '#8a8f7a',
      uhelnik: '#94795f',
      t_profil: '#7e6f8c',
      u_profil: '#5f8483',
      plech: '#98a1ab',
      pletivo: '#7f9c7f',
      vlastni: '#8b8b8b',
    }[cat] || '#7a8590'
  );
}

export function defaultCatalog() {
  return [
    M('Jekl 20×20×2', 'jekl_ctverec', { a: 20, t: 2 }),
    M('Jekl 25×25×2', 'jekl_ctverec', { a: 25, t: 2 }),
    M('Jekl 30×30×2', 'jekl_ctverec', { a: 30, t: 2 }),
    M('Jekl 40×40×2', 'jekl_ctverec', { a: 40, t: 2 }),
    M('Jekl 40×40×3', 'jekl_ctverec', { a: 40, t: 3 }),
    M('Jekl 50×50×3', 'jekl_ctverec', { a: 50, t: 3 }),
    M('Jekl 60×60×3', 'jekl_ctverec', { a: 60, t: 3 }),
    M('Jekl 80×80×4', 'jekl_ctverec', { a: 80, t: 4 }),

    M('Jekl 30×20×2', 'jekl_obdelnik', { a: 30, b: 20, t: 2 }),
    M('Jekl 40×20×2', 'jekl_obdelnik', { a: 40, b: 20, t: 2 }),
    M('Jekl 50×30×2', 'jekl_obdelnik', { a: 50, b: 30, t: 2 }),
    M('Jekl 60×40×3', 'jekl_obdelnik', { a: 60, b: 40, t: 3 }),

    M('Trubka Ø22×2', 'trubka', { d: 22, t: 2 }),
    M('Trubka Ø27×2', 'trubka', { d: 27, t: 2 }),
    M('Trubka Ø33,7×2,6', 'trubka', { d: 33.7, t: 2.6 }),
    M('Trubka Ø42,4×2,6', 'trubka', { d: 42.4, t: 2.6 }),

    M('Pásovina 20×5', 'pasovina', { a: 20, t: 5 }),
    M('Pásovina 30×5', 'pasovina', { a: 30, t: 5 }),
    M('Pásovina 40×5', 'pasovina', { a: 40, t: 5 }),
    M('Pásovina 50×6', 'pasovina', { a: 50, t: 6 }),

    M('L 30×30×3', 'uhelnik', { a: 30, b: 30, t: 3 }),
    M('L 40×40×4', 'uhelnik', { a: 40, b: 40, t: 4 }),
    M('L 50×50×4', 'uhelnik', { a: 50, b: 50, t: 4 }),
    M('L 50×50×5', 'uhelnik', { a: 50, b: 50, t: 5 }),

    M('T 30×30×3', 't_profil', { a: 30, b: 30, t: 3 }),
    M('T 40×40×4', 't_profil', { a: 40, b: 40, t: 4 }),

    M('U 30×30×3', 'u_profil', { a: 30, b: 30, t: 3 }),
    M('U 40×20×3', 'u_profil', { a: 40, b: 20, t: 3 }),
    M('U 50×38×5', 'u_profil', { a: 50, b: 38, t: 5 }),

    M('Plech 2 mm', 'plech', { t: 2 }, { stockLength: 2000 }),
    M('Plech 3 mm', 'plech', { t: 3 }, { stockLength: 2000 }),
    M('Plech 4 mm', 'plech', { t: 4 }, { stockLength: 2000 }),
    M('Plech 5 mm', 'plech', { t: 5 }, { stockLength: 2000 }),
    M('Plech 6 mm', 'plech', { t: 6 }, { stockLength: 2000 }),
    M('Plech 8 mm', 'plech', { t: 8 }, { stockLength: 2000 }),
    M('Plech 10 mm', 'plech', { t: 10 }, { stockLength: 2000 }),

    M('Pletivo poplastované 50×50', 'pletivo', {}, { stockLength: 0, note: 'Oko 50×50 mm' }),
    M('Pletivo svařované 100×50', 'pletivo', {}, { stockLength: 0, note: 'Oko 100×50 mm' }),
    M('Tahokov TR 40×15', 'pletivo', {}, { stockLength: 0 }),
  ];
}

export function makeMaterial(partial = {}) {
  const cat = partial.category || 'jekl_ctverec';
  return {
    id: newId('mat'),
    name: partial.name || 'Nový materiál',
    category: cat,
    dims: { a: null, b: null, d: null, t: null, ...(partial.dims || {}) },
    stockLength: partial.stockLength ?? 6000,
    color: partial.color || colorForCategory(cat),
    active: partial.active !== false,
    note: partial.note || '',
    builtin: false,
  };
}

/* --------------------------------------------------------- rozměry ------- */

/**
 * Rozměr průřezu viditelný v 2D výkresu (šířka profilu v rovině nákresu).
 */
export function sectionWidth(mat) {
  if (!mat) return 20;
  const { a, b, d, t } = mat.dims || {};
  switch (mat.category) {
    case 'jekl_ctverec':
      return a || 20;
    case 'jekl_obdelnik':
      return a || 40;
    case 'trubka':
      return d || 25;
    case 'pasovina':
      return a || 30;
    case 'uhelnik':
    case 't_profil':
    case 'u_profil':
      return a || 40;
    case 'plech':
      return t || 3;
    default:
      return a || 20;
  }
}

/** Hloubka průřezu (rozměr kolmo k rovině nákresu). */
export function sectionDepth(mat) {
  if (!mat) return 20;
  const { a, b, d, t } = mat.dims || {};
  switch (mat.category) {
    case 'jekl_ctverec':
      return a || 20;
    case 'jekl_obdelnik':
      return b || 20;
    case 'trubka':
      return d || 25;
    case 'pasovina':
      return t || 5;
    case 'uhelnik':
    case 't_profil':
    case 'u_profil':
      return b || a || 40;
    case 'plech':
      return t || 3;
    default:
      return b || a || 20;
  }
}

/** Textový popis průřezu do kusovníku. */
export function sectionText(mat) {
  if (!mat) return '–';
  const { a, b, d, t } = mat.dims || {};
  const n = (x) => (x == null ? '?' : String(x).replace('.', ','));
  switch (mat.category) {
    case 'jekl_ctverec':
      return `${n(a)}×${n(a)}×${n(t)}`;
    case 'jekl_obdelnik':
      return `${n(a)}×${n(b)}×${n(t)}`;
    case 'trubka':
      return `Ø${n(d)}×${n(t)}`;
    case 'pasovina':
      return `${n(a)}×${n(t)}`;
    case 'uhelnik':
    case 't_profil':
    case 'u_profil':
      return `${n(a)}×${n(b)}×${n(t)}`;
    case 'plech':
      return `tl. ${n(t)}`;
    default:
      return mat.name;
  }
}

/**
 * Obrys průřezu pro 3D extruzi.
 * Souřadnice: x = v rovině nákresu, y = hloubka. Střed v počátku.
 * @returns {{outer: Array<{x,y}>, holes: Array<Array<{x,y}>>, round?: boolean}}
 */
export function sectionOutline(mat) {
  const w = sectionWidth(mat);
  const h = sectionDepth(mat);
  const t = (mat?.dims?.t) || Math.max(1.5, Math.min(w, h) * 0.1);
  const rect = (rw, rh, cx = 0, cy = 0) => [
    { x: cx - rw / 2, y: cy - rh / 2 },
    { x: cx + rw / 2, y: cy - rh / 2 },
    { x: cx + rw / 2, y: cy + rh / 2 },
    { x: cx - rw / 2, y: cy + rh / 2 },
  ];

  switch (mat?.category) {
    case 'jekl_ctverec':
    case 'jekl_obdelnik': {
      const inner = Math.min(w, h) - 2 * t > 0.5 ? [rect(w - 2 * t, h - 2 * t)] : [];
      return { outer: rect(w, h), holes: inner };
    }
    case 'trubka': {
      const R = w / 2;
      const circle = (r, n = 32) =>
        Array.from({ length: n }, (_, i) => {
          const A = (i / n) * Math.PI * 2;
          return { x: Math.cos(A) * r, y: Math.sin(A) * r };
        });
      const holes = R - t > 0.5 ? [circle(R - t).reverse()] : [];
      return { outer: circle(R), holes, round: true };
    }
    case 'pasovina':
    case 'plech':
      return { outer: rect(w, h), holes: [] };
    case 'uhelnik': {
      // L: svislé rameno w (v rovině), vodorovné rameno h (do hloubky)
      const x0 = -w / 2, y0 = -h / 2;
      return {
        outer: [
          { x: x0, y: y0 },
          { x: x0 + w, y: y0 },
          { x: x0 + w, y: y0 + t },
          { x: x0 + t, y: y0 + t },
          { x: x0 + t, y: y0 + h },
          { x: x0, y: y0 + h },
        ],
        holes: [],
      };
    }
    case 't_profil': {
      const x0 = -w / 2, y0 = -h / 2;
      return {
        outer: [
          { x: x0, y: y0 },
          { x: x0 + w, y: y0 },
          { x: x0 + w, y: y0 + t },
          { x: (t / 2), y: y0 + t },
          { x: (t / 2), y: y0 + h },
          { x: -(t / 2), y: y0 + h },
          { x: -(t / 2), y: y0 + t },
          { x: x0, y: y0 + t },
        ],
        holes: [],
      };
    }
    case 'u_profil': {
      const x0 = -w / 2, y0 = -h / 2;
      return {
        outer: [
          { x: x0, y: y0 },
          { x: x0 + w, y: y0 },
          { x: x0 + w, y: y0 + h },
          { x: x0 + w - t, y: y0 + h },
          { x: x0 + w - t, y: y0 + t },
          { x: x0 + t, y: y0 + t },
          { x: x0 + t, y: y0 + h },
          { x: x0, y: y0 + h },
        ],
        holes: [],
      };
    }
    default:
      return { outer: rect(w, h), holes: [] };
  }
}

/* --------------------------------------------------------- rejstřík ------ */

export class MaterialLibrary {
  constructor(items) {
    this.items = items && items.length ? items : defaultCatalog();
  }
  get(id) {
    return this.items.find((m) => m.id === id) || null;
  }
  byCategory(cat) {
    return this.items.filter((m) => m.category === cat && m.active);
  }
  active() {
    return this.items.filter((m) => m.active);
  }
  profiles() {
    return this.items.filter((m) => m.active && categoryKind(m.category) === 'profil');
  }
  plates() {
    return this.items.filter((m) => m.active && m.category === 'plech');
  }
  meshes() {
    return this.items.filter((m) => m.active && m.category === 'pletivo');
  }
  add(m) {
    this.items.push(m);
    return m;
  }
  remove(id) {
    const i = this.items.findIndex((m) => m.id === id);
    if (i >= 0) this.items.splice(i, 1);
  }
  toJSON() {
    return { version: 1, items: this.items };
  }
  static fromJSON(json) {
    try {
      const o = typeof json === 'string' ? JSON.parse(json) : json;
      if (o && Array.isArray(o.items) && o.items.length) return new MaterialLibrary(o.items);
    } catch {
      /* poškozený soubor → výchozí katalog */
    }
    return new MaterialLibrary(defaultCatalog());
  }
}
