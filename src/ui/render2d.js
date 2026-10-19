/**
 * Vykreslení 2D výkresu.
 *
 * Profily se kreslí z odvozených dílů (store.derived.parts), takže výkres
 * ukazuje přesně tu geometrii, která jde do kusovníku, nářezu i 3D (§2).
 */
import * as G from '../core/geom.js';
import { deviationOf } from '../core/build.js';
import { meshRect } from '../core/model.js';
import { fmtLen, fmtAngle } from '../core/units.js';

const C = {
  grid: '#e9edf2',
  gridStrong: '#dbe2ea',
  axis: '#c3ccd6',
  steel: '#8b98a6',
  steelDark: '#4d5966',
  steelFill: '#d5dce4',
  sel: '#1b64c4',
  selFill: 'rgba(27,100,196,.16)',
  hover: '#5b93dd',
  hi: '#e07b1a',
  hiFill: 'rgba(224,123,26,.20)',
  err: '#c0392b',
  errFill: 'rgba(192,57,43,.13)',
  ref: '#9aa6b2',
  dim: '#3c4a58',
  dimLine: '#7e8b99',
  mesh: '#7f9c7f',
  text: '#1c2530',
  white: '#ffffff',
};

/* ────────────────────────────────────────────────────── transformace ── */

export class View {
  constructor() {
    this.scale = 0.35; // px na mm
    this.ox = 80;
    this.oy = 520;
  }
  toScreen(p) {
    return { x: p.x * this.scale + this.ox, y: -p.y * this.scale + this.oy };
  }
  toModel(s) {
    return { x: (s.x - this.ox) / this.scale, y: -(s.y - this.oy) / this.scale };
  }
  /** px → mm */
  d(px) {
    return px / this.scale;
  }
  /** mm → px */
  s(mm) {
    return mm * this.scale;
  }
  zoomAt(screenPt, factor) {
    const before = this.toModel(screenPt);
    this.scale = G.clamp(this.scale * factor, 0.006, 24);
    const after = this.toModel(screenPt);
    this.ox += (after.x - before.x) * this.scale;
    this.oy -= (after.y - before.y) * this.scale;
  }
  pan(dxPx, dyPx) {
    this.ox += dxPx;
    this.oy += dyPx;
  }
  fit(bbox, width, height, pad = 90) {
    if (!bbox || !(bbox.w > 0 || bbox.h > 0)) return;
    const sx = (width - pad * 2) / Math.max(bbox.w, 1);
    const sy = (height - pad * 2) / Math.max(bbox.h, 1);
    this.scale = G.clamp(Math.min(sx, sy), 0.006, 24);
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    this.ox = width / 2 - cx * this.scale;
    this.oy = height / 2 + cy * this.scale;
  }
}

/* ──────────────────────────────────────────────────── obrys profilu ── */

/**
 * Obrys profilového dílu ve 2D včetně tvaru řezů na obou koncích.
 * Stejná geometrie se používá pro kreslení i pro výběr myší.
 */
export function partOutline(part) {
  if (!part?.axis) return null;
  const a = part.axis.a;
  const b = part.axis.b;
  const t = part.profileWidth || 0;
  const d = G.norm(G.sub(b, a));
  if (!t || (d.x === 0 && d.y === 0)) return null;
  const n = G.perp(d);
  const half = t / 2;

  const ext = (cut) => {
    const dev = G.clamp(deviationOf(cut), -85, 85);
    return Math.abs(dev) < 1e-6 ? 0 : half * Math.tan(dev * G.RAD);
  };

  const eA = ext(part.cutL);
  const oA = part.cutL?.orient || 0;
  const eB = ext(part.cutR);
  const oB = part.cutR?.orient || 0;

  // Na začátku vybíhá materiál dozadu (−d) na delší straně, na konci dopředu (+d).
  const aPlus = G.add(G.add(a, G.mul(n, half)), G.mul(d, oA >= 0 ? -eA : eA));
  const aMinus = G.add(G.add(a, G.mul(n, -half)), G.mul(d, oA >= 0 ? eA : -eA));
  const bPlus = G.add(G.add(b, G.mul(n, half)), G.mul(d, oB >= 0 ? eB : -eB));
  const bMinus = G.add(G.add(b, G.mul(n, -half)), G.mul(d, oB >= 0 ? -eB : eB));

  return [aPlus, bPlus, bMinus, aMinus];
}

/** Obrys pro ohýbaný lomený profil – pás konstantní šířky podél lomené osy. */
export function bentOutline(points, t) {
  if (!points || points.length < 2 || !t) return null;
  const half = t / 2;
  const offsetSide = (sign) => {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[i - 1];
      const next = points[i + 1];
      if (!prev) {
        const d = G.norm(G.sub(next, points[i]));
        out.push(G.add(points[i], G.mul(G.perp(d), half * sign)));
      } else if (!next) {
        const d = G.norm(G.sub(points[i], prev));
        out.push(G.add(points[i], G.mul(G.perp(d), half * sign)));
      } else {
        // Vnitřní vrchol: průsečík obou odsazených hran (ostrý roh ohybu).
        const d1 = G.norm(G.sub(points[i], prev));
        const d2 = G.norm(G.sub(next, points[i]));
        const p1 = G.add(points[i], G.mul(G.perp(d1), half * sign));
        const p2 = G.add(points[i], G.mul(G.perp(d2), half * sign));
        const hit = G.lineIntersect(p1, d1, p2, d2);
        out.push(hit || p1);
      }
    }
    return out;
  };
  return [...offsetSide(1), ...offsetSide(-1).reverse()];
}

/* ────────────────────────────────────────────────────────── kreslení ── */

export class Renderer {
  constructor(canvas, view) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = view;
    this.dpr = window.devicePixelRatio || 1;
    /** Klikací oblasti kót – naplní se při každém překreslení. */
    this.dimHits = [];
    this.meshPattern = null;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.w = r.width;
    this.h = r.height;
  }

  get width() {
    return this.w || this.canvas.clientWidth;
  }
  get height() {
    return this.h || this.canvas.clientHeight;
  }

  /**
   * @param {Store} store
   * @param {object} ui { tool, hover, sketch, preview, snapPoint, selection }
   */
  draw(store, ui = {}) {
    const ctx = this.ctx;
    const v = this.view;
    this.dimHits = [];

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = C.white;
    ctx.fillRect(0, 0, this.width, this.height);

    const p = store.project;
    if (p.settings.showGrid) this.drawGrid();
    this.drawGroundLine(store);

    // Okolí / reference se kreslí pod konstrukcí.
    if (p.settings.showRef !== false) {
      for (const obj of p.ofType('ref')) if (p.isVisible(obj)) this.drawRef(store, obj, ui);
    }

    // Pletivo pod profily.
    for (const obj of p.ofType('mesh')) if (p.isVisible(obj)) this.drawMesh(store, obj, ui);

    // Plechy a patky.
    for (const obj of p.ofType('plate')) if (p.isVisible(obj)) this.drawPlate(store, obj, ui);

    // Profilové díly z odvozeného modelu.
    for (const part of store.derived.parts) {
      if (part.kind !== 'profil' || part.axis3d || !p.isVisible(p.byId(part.objectId))) continue;
      this.drawProfilePart(store, part, ui);
    }

    // Kóty.
    if (p.settings.showDims) this.drawDimensions(store, ui);
    for (const obj of p.ofType('dim')) if (p.isVisible(obj)) this.drawManualDim(store, obj, ui);

    // Rozpracovaný náčrt / náhled nástroje.
    if (ui.sketch?.length > 1) this.drawSketch(ui.sketch);
    if (ui.preview) this.drawPreview(ui.preview);
    if (ui.marquee) this.drawMarquee(ui.marquee);
    if (ui.snapPoint) this.drawSnapMarker(ui.snapPoint, ui.snapKind);

    this.drawScaleBar();
  }

  /* ── mřížka ── */

  drawGrid() {
    const ctx = this.ctx;
    const v = this.view;
    const w = this.width;
    const h = this.height;

    // Krok volíme tak, aby čáry nebyly hustší než ~9 px.
    let step = 10;
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    for (const s of steps) {
      if (v.s(s) >= 9) {
        step = s;
        break;
      }
      step = s;
    }
    const major = step * 5;

    const tl = v.toModel({ x: 0, y: 0 });
    const br = v.toModel({ x: w, y: h });
    const x0 = Math.floor(tl.x / step) * step;
    const x1 = Math.ceil(br.x / step) * step;
    const y0 = Math.floor(br.y / step) * step;
    const y1 = Math.ceil(tl.y / step) * step;

    ctx.lineWidth = 1;
    for (let x = x0; x <= x1; x += step) {
      const sx = Math.round(v.toScreen({ x, y: 0 }).x) + 0.5;
      ctx.strokeStyle = Math.abs(x % major) < 1e-6 ? C.gridStrong : C.grid;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (let y = y0; y <= y1; y += step) {
      const sy = Math.round(v.toScreen({ x: 0, y }).y) + 0.5;
      ctx.strokeStyle = Math.abs(y % major) < 1e-6 ? C.gridStrong : C.grid;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }
  }

  /** Čára ±0,000 – úroveň země. */
  drawGroundLine(store) {
    const ctx = this.ctx;
    const v = this.view;
    const y = v.toScreen({ x: 0, y: 0 }).y;
    if (y < -20 || y > this.height + 20) return;
    ctx.save();
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1;
    ctx.setLineDash([9, 4, 2, 4]);
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(this.width, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = C.dimLine;
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('±0,000', this.width - 8, y - 3);
    ctx.restore();
  }

  /* ── profilový díl ── */

  drawProfilePart(store, part, ui) {
    const ctx = this.ctx;
    const v = this.view;
    const obj = store.project.byId(part.objectId);
    if (!obj) return;

    const bent = part.bendGeometry && obj.type === 'profile' && obj.points.length > 2;
    const poly = bent ? bentOutline(obj.points, part.profileWidth) : partOutline(part);
    if (!poly) return;

    const state = this.stateOf(store, part.objectId, part.key, ui);
    const mat = store.project.material(part.materialId, store.library);
    const base = mat?.color || C.steel;

    ctx.beginPath();
    const pts = poly.map((q) => v.toScreen(q));
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();

    ctx.fillStyle = state.fill || hexA(base, 0.32);
    ctx.fill();
    ctx.strokeStyle = state.stroke || shade(base, -0.35);
    ctx.lineWidth = state.lw;
    ctx.stroke();

    // Naznačení dutiny u jeklů a trubek při dostatečném přiblížení.
    const wall = mat?.dims?.t;
    if (wall && v.s(part.profileWidth) > 14 && ['jekl_ctverec', 'jekl_obdelnik', 'trubka'].includes(mat.category)) {
      const inner = insetPolygon(poly, wall);
      if (inner) {
        ctx.beginPath();
        const ip = inner.map((q) => v.toScreen(q));
        ctx.moveTo(ip[0].x, ip[0].y);
        for (let i = 1; i < ip.length; i++) ctx.lineTo(ip[i].x, ip[i].y);
        ctx.closePath();
        ctx.strokeStyle = hexA(shade(base, -0.2), 0.55);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    if (state.selected && !bent) this.drawPartDirectionArrow(part);
  }

  /** Šipka lokálního směru dílu (od levého k pravému konci, §12.1). */
  drawPartDirectionArrow(part) {
    const ctx = this.ctx;
    const v = this.view;
    const a = v.toScreen(part.axis.a);
    const b = v.toScreen(part.axis.b);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 34) return;
    const ux = dx / L;
    const uy = dy / L;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const half = Math.min(L * 0.3, 26);

    ctx.save();
    ctx.strokeStyle = C.sel;
    ctx.fillStyle = C.sel;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(m.x - ux * half, m.y - uy * half);
    ctx.lineTo(m.x + ux * half, m.y + uy * half);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(m.x + ux * half, m.y + uy * half);
    ctx.lineTo(m.x + ux * (half - 7) - uy * 3.5, m.y + uy * (half - 7) + ux * 3.5);
    ctx.lineTo(m.x + ux * (half - 7) + uy * 3.5, m.y + uy * (half - 7) - ux * 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ── pletivo ── */

  drawMesh(store, mesh, ui) {
    const ctx = this.ctx;
    const v = this.view;
    const r = meshRect(store.project, mesh, store.library);
    if (!(r.w > 0) || !(r.h > 0)) return;
    const p0 = v.toScreen({ x: r.x, y: r.y + r.h });
    const p1 = v.toScreen({ x: r.x + r.w, y: r.y });
    const state = this.stateOf(store, mesh.id, `${mesh.id}:0`, ui);

    ctx.save();
    ctx.beginPath();
    ctx.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    ctx.fillStyle = state.fill || 'rgba(127,156,127,.10)';
    ctx.fill();
    ctx.clip();

    // Vzor oka – ne jednotlivé dráty (§9.3).
    const step = Math.max(9, v.s(50));
    ctx.strokeStyle = hexA(C.mesh, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = p0.x - (p1.y - p0.y); x < p1.x + (p1.y - p0.y); x += step) {
      ctx.moveTo(x, p0.y);
      ctx.lineTo(x + (p1.y - p0.y), p1.y);
      ctx.moveTo(x, p1.y);
      ctx.lineTo(x + (p1.y - p0.y), p0.y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = state.stroke || C.mesh;
    ctx.lineWidth = state.lw;
    ctx.setLineDash(state.selected ? [] : [5, 3]);
    ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    ctx.setLineDash([]);
  }

  /* ── plech / patka ── */

  drawPlate(store, plate, ui) {
    const ctx = this.ctx;
    const v = this.view;
    const state = this.stateOf(store, plate.id, `${plate.id}:0`, ui);
    const mat = store.project.material(plate.materialId, store.library);
    const base = mat?.color || '#98a1ab';

    const pts = plate.points.map((q) => v.toScreen(q));
    if (pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = state.fill || hexA(base, 0.4);
    ctx.fill();
    ctx.strokeStyle = state.stroke || shade(base, -0.4);
    ctx.lineWidth = state.lw;
    ctx.stroke();

    for (const h of plate.holes || []) {
      const c = v.toScreen({ x: h.cx, y: h.cy });
      ctx.beginPath();
      if (h.kind === 'circle') {
        ctx.arc(c.x, c.y, Math.max(1.2, v.s(h.d / 2)), 0, Math.PI * 2);
      } else {
        roundedSlot(ctx, c.x, c.y, v.s(h.w), v.s(h.h));
      }
      ctx.fillStyle = C.white;
      ctx.fill();
      ctx.strokeStyle = shade(base, -0.5);
      ctx.lineWidth = 1.1;
      ctx.stroke();
      // Osový kříž otvoru
      const r = h.kind === 'circle' ? v.s(h.d / 2) : v.s(Math.max(h.w, h.h) / 2);
      if (r > 4) {
        ctx.save();
        ctx.strokeStyle = hexA(C.dimLine, 0.8);
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(c.x - r - 3, c.y);
        ctx.lineTo(c.x + r + 3, c.y);
        ctx.moveTo(c.x, c.y - r - 3);
        ctx.lineTo(c.x, c.y + r + 3);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /* ── okolí / zeď ── */

  drawRef(store, ref, ui) {
    const ctx = this.ctx;
    const v = this.view;
    if (!ref.points || ref.points.length < 2) return;
    const state = this.stateOf(store, ref.id, null, ui);
    const pts = ref.points.map((q) => v.toScreen(q));

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (ref.closed) ctx.closePath();
    ctx.strokeStyle = state.selected ? C.sel : C.ref;
    ctx.lineWidth = state.selected ? 2 : 1.4;
    ctx.setLineDash([9, 5]);
    ctx.stroke();
    ctx.restore();

    // Body okolí lze kótovat – ukážeme je jako malé značky.
    if (state.selected) {
      ctx.fillStyle = C.sel;
      for (const s of pts) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* ── stav prvku (výběr / najetí / zvýraznění / chyba) ── */

  stateOf(store, objectId, partKey, ui) {
    const selected = store.selection.has(objectId);
    const hovered = ui.hover === objectId;
    const highlighted =
      store.highlightPart && (store.highlightPart === partKey || store.highlightPart === objectId);
    const hasError = store.derived.issues.some(
      (i) => i.severity === 'error' && i.objectIds.includes(objectId)
    );
    const hasWarn = store.derived.issues.some(
      (i) => i.severity === 'warn' && i.objectIds.includes(objectId)
    );

    if (highlighted) return { fill: C.hiFill, stroke: C.hi, lw: 2.4, selected, highlighted: true };
    if (selected) return { fill: C.selFill, stroke: C.sel, lw: 2.2, selected: true };
    if (hasError) return { fill: C.errFill, stroke: C.err, lw: 1.8, selected };
    if (hovered) return { fill: 'rgba(91,147,221,.14)', stroke: C.hover, lw: 1.7, selected };
    if (hasWarn) return { fill: 'rgba(181,118,26,.13)', stroke: '#b5761a', lw: 1.4, selected };
    return { fill: null, stroke: null, lw: 1.3, selected };
  }

  /* ────────────────────────────────────────────────────────── kóty ── */

  /** Odsazení kóty: uživatelské přetažení má přednost před výchozím (FR-DIM-004). */
  dimOffset(obj, field, fallback) {
    const v = obj.dimOffsets?.[field];
    return Number.isFinite(v) ? v : fallback;
  }

  drawDimensions(store, ui) {
    const p = store.project;
    const sel = store.selection;

    for (const f of p.ofType('frame')) {
      if (!p.isVisible(f)) continue;
      // Rozměry rámu jsou vidět stále; ostatní kóty až po vybrání prvku.
      if (sel.size && !sel.has(f.id)) continue;
      this.dimLinear(
        { x: f.x, y: f.y },
        { x: f.x + f.w, y: f.y },
        this.dimOffset(f, 'w', 78),
        fmtLen(f.w),
        { objectId: f.id, field: 'w', value: f.w, label: 'Šířka rámu', draggable: true }
      );
      this.dimLinear(
        { x: f.x, y: f.y + f.h },
        { x: f.x, y: f.y },
        this.dimOffset(f, 'h', 78),
        fmtLen(f.h),
        { objectId: f.id, field: 'h', value: f.h, label: 'Výška rámu', draggable: true }
      );
    }

    for (const pl of p.ofType('plate')) {
      if (!p.isVisible(pl) || !sel.has(pl.id)) continue;
      const bb = G.bboxOf(pl.points);
      this.dimLinear({ x: bb.minX, y: bb.minY }, { x: bb.maxX, y: bb.minY },
        this.dimOffset(pl, 'plateW', 48), fmtLen(bb.w), {
          objectId: pl.id, field: 'plateW', value: bb.w, label: 'Šířka plechu', draggable: true,
        });
      this.dimLinear({ x: bb.minX, y: bb.maxY }, { x: bb.minX, y: bb.minY },
        this.dimOffset(pl, 'plateH', 48), fmtLen(bb.h), {
          objectId: pl.id, field: 'plateH', value: bb.h, label: 'Výška plechu', draggable: true,
        });
    }

    for (const pr of p.ofType('profile')) {
      if (!p.isVisible(pr) || !sel.has(pr.id)) continue;
      this.drawChainDims(pr);
    }

    for (const m of p.ofType('mesh')) {
      if (!p.isVisible(m) || !sel.has(m.id)) continue;
      const r = meshRect(p, m, store.library);
      this.dimLinear({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
        this.dimOffset(m, 'meshW', 42), fmtLen(r.w), {
          objectId: m.id, field: 'meshW', value: r.w, label: 'Šířka pletiva', draggable: true,
        });
      this.dimLinear({ x: r.x, y: r.y + r.h }, { x: r.x, y: r.y },
        this.dimOffset(m, 'meshH', 42), fmtLen(r.h), {
          objectId: m.id, field: 'meshH', value: r.h, label: 'Výška pletiva', draggable: true,
        });
    }

    for (const rf of p.ofType('ref')) {
      if (!p.isVisible(rf) || !sel.has(rf.id)) continue;
      for (let i = 0; i < rf.points.length - 1; i++) {
        const a = rf.points[i];
        const b = rf.points[i + 1];
        this.dimLinear(a, b, this.dimOffset(rf, `refSeg${i}`, 34), fmtLen(G.dist(a, b)), {
          objectId: rf.id, field: `refSeg${i}`, value: G.dist(a, b), label: `Úsek ${i + 1}`,
          subtle: true, draggable: true,
        });
      }
    }
  }

  /** Délky úseků a úhly lomů u lomeného profilu (§13). */
  drawChainDims(prof) {
    const pts = prof.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      this.dimLinear(a, b, this.dimOffset(prof, `seg${i}`, 40), fmtLen(G.dist(a, b)), {
        objectId: prof.id, field: `seg${i}`, value: G.round1(G.dist(a, b)),
        label: `Délka úseku ${i + 1}`, draggable: true,
      });
    }
    for (let i = 1; i < pts.length - 1; i++) {
      const a1 = G.angleOf(G.sub(pts[i], pts[i - 1]));
      const a2 = G.angleOf(G.sub(pts[i + 1], pts[i]));
      const bend = G.round1(G.normAngle(a2 - a1));
      this.angleMark(pts[i - 1], pts[i], pts[i + 1], bend, {
        objectId: prof.id, field: `bend${i - 1}`, value: Math.abs(bend), label: `Úhel lomu ${i}`,
      });
    }
  }

  /**
   * Kóta mezi dvěma body. Offset je v px kolmo k ose (kladný = vlevo od směru).
   * Text se registruje jako klikací oblast pro přímou úpravu (FR-DIM-001).
   */
  dimLinear(a, b, offsetPx, text, meta = {}) {
    const ctx = this.ctx;
    const v = this.view;
    const A = v.toScreen(a);
    const B = v.toScreen(b);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const L = Math.hypot(dx, dy);
    if (L < 3) return;
    const ux = dx / L;
    const uy = dy / L;
    const nx = -uy;
    const ny = ux;

    const off = offsetPx + (meta.extraOffset || 0);
    const A2 = { x: A.x + nx * off, y: A.y + ny * off };
    const B2 = { x: B.x + nx * off, y: B.y + ny * off };

    ctx.save();
    ctx.strokeStyle = meta.subtle ? hexA(C.dimLine, 0.6) : C.dimLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    // Vynášecí čáry
    ctx.beginPath();
    ctx.moveTo(A.x + nx * Math.sign(off) * 4, A.y + ny * Math.sign(off) * 4);
    ctx.lineTo(A2.x + nx * 5, A2.y + ny * 5);
    ctx.moveTo(B.x + nx * Math.sign(off) * 4, B.y + ny * Math.sign(off) * 4);
    ctx.lineTo(B2.x + nx * 5, B2.y + ny * 5);
    ctx.stroke();

    // Kótovací čára se šipkami
    ctx.beginPath();
    ctx.moveTo(A2.x, A2.y);
    ctx.lineTo(B2.x, B2.y);
    ctx.stroke();
    arrow(ctx, A2, { x: ux, y: uy }, C.dimLine);
    arrow(ctx, B2, { x: -ux, y: -uy }, C.dimLine);

    // Text
    const M = { x: (A2.x + B2.x) / 2, y: (A2.y + B2.y) / 2 };
    ctx.font = '12px "Segoe UI", sans-serif';
    const tw = ctx.measureText(text).width;
    let ang = Math.atan2(dy, dx);
    if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;

    ctx.translate(M.x, M.y);
    ctx.rotate(ang);
    ctx.fillStyle = C.white;
    ctx.fillRect(-tw / 2 - 4, -9, tw + 8, 16);
    ctx.fillStyle = meta.subtle ? C.dimLine : C.dim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();

    if (meta.objectId) {
      this.dimHits.push({
        x: M.x - tw / 2 - 5, y: M.y - 10, w: tw + 10, h: 20, cx: M.x, cy: M.y,
        // Směr, ve kterém kóta odjíždí od prvku – pro tažení myší.
        normal: { x: nx, y: ny }, offset: off, ...meta,
      });
    }
  }

  /** Obloučkem vyznačený úhel lomu s číselnou hodnotou. */
  angleMark(prev, vertex, next, bendDeg, meta = {}) {
    const ctx = this.ctx;
    const v = this.view;
    const V = v.toScreen(vertex);
    const a1 = Math.atan2(v.toScreen(prev).y - V.y, v.toScreen(prev).x - V.x);
    const a2 = Math.atan2(v.toScreen(next).y - V.y, v.toScreen(next).x - V.x);
    const r = 30;

    ctx.save();
    ctx.strokeStyle = C.dimLine;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    let d = a2 - a1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    ctx.arc(V.x, V.y, r, a1, a1 + d, d < 0);
    ctx.stroke();

    const mid = a1 + d / 2;
    const tx = V.x + Math.cos(mid) * (r + 15);
    const ty = V.y + Math.sin(mid) * (r + 15);
    const text = fmtAngle(Math.abs(bendDeg));
    ctx.font = '12px "Segoe UI", sans-serif';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = C.white;
    ctx.fillRect(tx - tw / 2 - 4, ty - 9, tw + 8, 17);
    ctx.fillStyle = C.dim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tx, ty);
    ctx.restore();

    if (meta.objectId) {
      this.dimHits.push({ x: tx - tw / 2 - 5, y: ty - 10, w: tw + 10, h: 20, cx: tx, cy: ty, isAngle: true, ...meta });
    }
  }

  /** Ručně vložená kóta (nástroj Kóta). */
  drawManualDim(store, dim, ui) {
    const text = fmtLen(G.dist(dim.a, dim.b));
    const sel = store.selection.has(dim.id);
    this.dimLinear(dim.a, dim.b, dim.offset, text, {
      objectId: dim.id, field: 'manual', value: G.dist(dim.a, dim.b), label: 'Kóta',
      subtle: !sel,
    });
  }

  /* ───────────────────────────────────────────── rozpracované tvary ── */

  drawSketch(points) {
    const ctx = this.ctx;
    const v = this.view;
    ctx.save();
    ctx.strokeStyle = 'rgba(27,100,196,.75)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const s0 = v.toScreen(points[0]);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < points.length; i++) {
      const s = v.toScreen(points[i]);
      ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawPreview(prev) {
    const ctx = this.ctx;
    const v = this.view;
    ctx.save();
    ctx.strokeStyle = C.sel;
    ctx.fillStyle = 'rgba(27,100,196,.10)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 4]);

    if (prev.kind === 'rect') {
      const a = v.toScreen({ x: prev.x, y: prev.y + prev.h });
      const b = v.toScreen({ x: prev.x + prev.w, y: prev.y });
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      this.dashLabel(`${fmtLen(prev.w)} × ${fmtLen(prev.h)} mm`, (a.x + b.x) / 2, Math.min(a.y, b.y) - 12);
    } else if (prev.kind === 'line' || prev.kind === 'poly') {
      const pts = prev.points.map((q) => v.toScreen(q));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (prev.closed) ctx.closePath();
      ctx.stroke();
      if (prev.label) {
        const last = pts[pts.length - 1];
        this.dashLabel(prev.label, last.x, last.y - 16);
      }
    } else if (prev.kind === 'circle') {
      const c = v.toScreen(prev.c);
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(2, v.s(prev.r)), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      this.dashLabel(`Ø ${fmtLen(prev.r * 2)} mm`, c.x, c.y - v.s(prev.r) - 12);
    }
    ctx.restore();
  }

  dashLabel(text, x, y) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([]);
    ctx.font = '12px "Segoe UI", sans-serif';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(27,100,196,.94)';
    roundRect(ctx, x - tw / 2 - 6, y - 10, tw + 12, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  drawMarquee(m) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = C.sel;
    ctx.fillStyle = 'rgba(27,100,196,.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    const x = Math.min(m.x0, m.x1);
    const y = Math.min(m.y0, m.y1);
    ctx.fillRect(x, y, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
    ctx.strokeRect(x, y, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
    ctx.restore();
  }

  drawSnapMarker(modelPt, kind) {
    const ctx = this.ctx;
    const s = this.view.toScreen(modelPt);
    ctx.save();
    ctx.strokeStyle = '#e07b1a';
    ctx.fillStyle = 'rgba(224,123,26,.18)';
    ctx.lineWidth = 1.6;
    const r = 6;
    ctx.beginPath();
    if (kind === 'mid') {
      ctx.moveTo(s.x, s.y - r);
      ctx.lineTo(s.x + r, s.y + r);
      ctx.lineTo(s.x - r, s.y + r);
      ctx.closePath();
    } else if (kind === 'center') {
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    } else if (kind === 'grid') {
      ctx.moveTo(s.x - r, s.y);
      ctx.lineTo(s.x + r, s.y);
      ctx.moveTo(s.x, s.y - r);
      ctx.lineTo(s.x, s.y + r);
    } else {
      ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawScaleBar() {
    const ctx = this.ctx;
    const v = this.view;
    const targetPx = 120;
    const raw = v.d(targetPx);
    const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].reduce((a, b) =>
      Math.abs(b - raw) < Math.abs(a - raw) ? b : a
    );
    const px = v.s(nice);
    const x = this.width - px - 18;
    const y = this.height - 22;

    ctx.save();
    ctx.strokeStyle = C.dimLine;
    ctx.fillStyle = C.dimLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + px, y);
    ctx.lineTo(x + px, y - 4);
    ctx.stroke();
    ctx.font = '10.5px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${nice} mm`, x + px / 2, y - 3);
    ctx.restore();
  }

  /** Najde kóty pod kurzorem (pro klik a úpravu hodnoty). */
  dimAt(sx, sy) {
    for (let i = this.dimHits.length - 1; i >= 0; i--) {
      const d = this.dimHits[i];
      if (sx >= d.x && sx <= d.x + d.w && sy >= d.y && sy <= d.y + d.h) return d;
    }
    return null;
  }
}

/* ────────────────────────────────────────────────────────── pomocné ── */

function arrow(ctx, at, dir, color) {
  const s = 7;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(at.x + dir.x * s - dir.y * 2.6, at.y + dir.y * s + dir.x * 2.6);
  ctx.lineTo(at.x + dir.x * s + dir.y * 2.6, at.y + dir.y * s - dir.x * 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function roundedSlot(ctx, cx, cy, w, h) {
  const r = Math.min(w, h) / 2;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
}

/** Zmenší konvexní obrys dovnitř o d (pro naznačení stěny profilu). */
function insetPolygon(poly, d) {
  const c = poly.reduce((s, p) => ({ x: s.x + p.x / poly.length, y: s.y + p.y / poly.length }), { x: 0, y: 0 });
  const out = poly.map((p) => {
    const dir = G.norm(G.sub(c, p));
    return G.add(p, G.mul(dir, d * 1.42));
  });
  return out;
}

function hexA(hex, a) {
  const c = hexToRgb(hex);
  return c ? `rgba(${c.r},${c.g},${c.b},${a})` : `rgba(139,152,166,${a})`;
}

function shade(hex, amt) {
  const c = hexToRgb(hex);
  if (!c) return hex;
  const f = (x) => Math.round(G.clamp(amt < 0 ? x * (1 + amt) : x + (255 - x) * amt, 0, 255));
  return `rgb(${f(c.r)},${f(c.g)},${f(c.b)})`;
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

export { C as COLORS, hexA, shade };
