/**
 * Interaktivní 2D plátno – nástroje, výběr, přichytávání a úprava kót.
 */
import * as G from '../core/geom.js';
import { View, Renderer, partOutline, bentOutline } from './render2d.js';
import { recognize, CONFIDENT, chainToPoints, pointsToChain } from '../core/recognize.js';
import {
  makeFrame, makeFill, makeMesh, makeProfile, makePlate, makeHole, makeRef, makeDim,
  makeAssembly, frameClearRect, meshRect, objectBBox, translateObject, cloneObject,
} from '../core/model.js';
import { sectionWidth, categoryKind } from '../core/materials.js';
import { parseLength, parseAngle } from '../core/units.js';

const SNAP_PX = 13;
const CLICK_SLOP = 4;

export class Canvas2D {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Store} store
   * @param {object} host zpětná volání do aplikace
   */
  constructor(canvas, store, host) {
    this.canvas = canvas;
    this.store = store;
    this.host = host;
    this.view = new View();
    this.renderer = new Renderer(canvas, this.view);

    this.tool = 'select';
    this.hover = null;
    this.mouseModel = { x: 0, y: 0 };
    this.snapPoint = null;
    this.snapKind = null;
    this.sketch = null;
    this.preview = null;
    this.marquee = null;
    this.drag = null;
    this.chain = null; // rozkreslený lomený tvar / okolí
    this.dimEdit = null;
    this._raf = null;

    this.bind();
    this.observeResize();
    store.subscribe(() => this.requestDraw());
  }

  /* ────────────────────────────────────────────────── infrastruktura ── */

  observeResize() {
    const ro = new ResizeObserver(() => {
      this.renderer.resize();
      this.requestDraw();
    });
    ro.observe(this.canvas.parentElement || this.canvas);
    this.renderer.resize();
  }

  requestDraw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this.draw();
    });
  }

  draw() {
    this.renderer.draw(this.store, {
      tool: this.tool,
      hover: this.hover,
      sketch: this.sketch,
      preview: this.preview,
      marquee: this.marquee,
      snapPoint: this.snapPoint,
      snapKind: this.snapKind,
    });
  }

  setTool(tool) {
    this.cancelPending();
    this.tool = tool;
    this.canvas.className = tool === 'select' ? 'tool-select' : '';
    this.host.onToolChange?.(tool);
    this.requestDraw();
  }

  fit() {
    const bb = this.projectBBox();
    if (bb) this.view.fit(bb, this.renderer.width, this.renderer.height);
    else {
      this.view.scale = 0.35;
      this.view.ox = 90;
      this.view.oy = this.renderer.height - 90;
    }
    this.requestDraw();
  }

  projectBBox() {
    let bb = null;
    for (const o of this.store.project.objects) {
      const b = objectBBox(this.store.project, o, this.store.library);
      if (b) bb = G.bboxUnion(bb, b);
    }
    return bb;
  }

  /* ────────────────────────────────────────────────────── souřadnice ── */

  screenPt(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  modelPt(e) {
    return this.view.toModel(this.screenPt(e));
  }

  /* ───────────────────────────────────────────────────── přichytávání ── */

  /** Body, na které lze přichytávat (§6.3). */
  collectSnapPoints() {
    const p = this.store.project;
    const pts = [];
    const push = (pt, kind) => pts.push({ pt, kind });

    for (const o of p.objects) {
      if (!p.isVisible(o)) continue;
      if (o.type === 'frame') {
        const c = [
          { x: o.x, y: o.y }, { x: o.x + o.w, y: o.y },
          { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h },
        ];
        c.forEach((q) => push(q, 'end'));
        for (let i = 0; i < 4; i++) push(G.mid(c[i], c[(i + 1) % 4]), 'mid');
        push({ x: o.x + o.w / 2, y: o.y + o.h / 2 }, 'center');
        const cr = frameClearRect(p, o, this.store.library);
        [
          { x: cr.x, y: cr.y }, { x: cr.x + cr.w, y: cr.y },
          { x: cr.x + cr.w, y: cr.y + cr.h }, { x: cr.x, y: cr.y + cr.h },
        ].forEach((q) => push(q, 'end'));
      } else if (o.type === 'plate' || o.type === 'profile' || o.type === 'ref') {
        o.points.forEach((q) => push(q, 'end'));
        for (let i = 0; i < o.points.length - 1; i++) push(G.mid(o.points[i], o.points[i + 1]), 'mid');
        if (o.type === 'plate') {
          const bb = G.bboxOf(o.points);
          push({ x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 }, 'center');
          for (const h of o.holes || []) push({ x: h.cx, y: h.cy }, 'center');
        }
      } else if (o.type === 'mesh') {
        const r = meshRect(p, o, this.store.library);
        [
          { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
        ].forEach((q) => push(q, 'end'));
      }
    }
    // Konce a středy skutečných dílů (např. konec sloupku pro patku).
    for (const part of this.store.derived.parts) {
      if (part.kind !== 'profil' || !part.axis) continue;
      push(part.axis.a, 'end');
      push(part.axis.b, 'end');
      push(G.mid(part.axis.a, part.axis.b), 'mid');
    }
    return pts;
  }

  /** Vrátí přichycený bod nebo původní, když nic není blízko. */
  snap(model, opts = {}) {
    const st = this.store.project.settings;
    if (!st.snap || opts.off) {
      this.snapPoint = null;
      this.snapKind = null;
      return model;
    }
    const tolMm = this.view.d(SNAP_PX);
    let best = null;
    let bestD = tolMm;

    for (const { pt, kind } of this.collectSnapPoints()) {
      const d = G.dist(pt, model);
      if (d < bestD) {
        bestD = d;
        best = { pt, kind };
      }
    }

    // Hrany objektů
    if (!best) {
      let ebest = null;
      let ed = tolMm;
      for (const o of this.store.project.objects) {
        if (!this.store.project.isVisible(o)) continue;
        const segs = this.objectSegments(o);
        for (const [a, b] of segs) {
          const c = G.closestOnSegment(model, a, b);
          const d = G.dist(c.point, model);
          if (d < ed) {
            ed = d;
            ebest = c.point;
          }
        }
      }
      if (ebest) best = { pt: ebest, kind: 'edge' };
    }

    if (best) {
      this.snapPoint = best.pt;
      this.snapKind = best.kind;
      return { ...best.pt };
    }

    // Mřížka
    const step = st.gridStep || 10;
    const g = { x: Math.round(model.x / step) * step, y: Math.round(model.y / step) * step };
    if (G.dist(g, model) < tolMm) {
      this.snapPoint = g;
      this.snapKind = 'grid';
      return g;
    }
    this.snapPoint = null;
    this.snapKind = null;
    return model;
  }

  objectSegments(o) {
    const p = this.store.project;
    if (o.type === 'frame') {
      const c = [
        { x: o.x, y: o.y }, { x: o.x + o.w, y: o.y },
        { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h },
      ];
      return c.map((q, i) => [q, c[(i + 1) % 4]]);
    }
    if (o.type === 'plate' || o.type === 'ref') {
      const segs = [];
      for (let i = 0; i < o.points.length - 1; i++) segs.push([o.points[i], o.points[i + 1]]);
      if (o.type === 'plate' || o.closed) segs.push([o.points[o.points.length - 1], o.points[0]]);
      return segs;
    }
    if (o.type === 'profile') {
      const segs = [];
      for (let i = 0; i < o.points.length - 1; i++) segs.push([o.points[i], o.points[i + 1]]);
      return segs;
    }
    if (o.type === 'mesh') {
      const r = meshRect(p, o, this.store.library);
      const c = [
        { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
        { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
      ];
      return c.map((q, i) => [q, c[(i + 1) % 4]]);
    }
    return [];
  }

  /* ─────────────────────────────────────────────────────── zásahy ──── */

  /** Objekt pod bodem (v modelových souřadnicích). */
  hitTest(model) {
    const p = this.store.project;
    const tol = this.view.d(5);

    // Nejdřív díly profilů (kreslí se navrchu).
    for (let i = this.store.derived.parts.length - 1; i >= 0; i--) {
      const part = this.store.derived.parts[i];
      if (part.kind !== 'profil') continue;
      const obj = p.byId(part.objectId);
      if (!obj || !p.isVisible(obj)) continue;
      const poly =
        part.bendGeometry && obj.type === 'profile' && obj.points.length > 2
          ? bentOutline(obj.points, part.profileWidth)
          : partOutline(part);
      if (poly && G.pointInPolygon(model, poly)) return { objectId: part.objectId, partKey: part.key };
    }

    // Plechy a otvory
    for (let i = p.objects.length - 1; i >= 0; i--) {
      const o = p.objects[i];
      if (!p.isVisible(o)) continue;
      if (o.type === 'plate' && G.pointInPolygon(model, o.points)) {
        const hole = (o.holes || []).find((h) => {
          const r = h.kind === 'circle' ? h.d / 2 : Math.max(h.w, h.h) / 2;
          return G.dist({ x: h.cx, y: h.cy }, model) <= r;
        });
        return { objectId: o.id, partKey: `${o.id}:0`, holeId: hole?.id || null };
      }
      if (o.type === 'mesh') {
        const r = meshRect(p, o, this.store.library);
        if (model.x >= r.x && model.x <= r.x + r.w && model.y >= r.y && model.y <= r.y + r.h)
          return { objectId: o.id, partKey: `${o.id}:0` };
      }
      if (o.type === 'ref' && o.points.length > 1) {
        if (G.distToPolyline(model, o.points, o.closed) < tol + this.view.d(3))
          return { objectId: o.id, partKey: null };
      }
      if (o.type === 'dim') {
        if (G.distToSegment(model, o.a, o.b) < tol + this.view.d(4)) return { objectId: o.id, partKey: null };
      }
    }
    return null;
  }

  /** Rám, v jehož světlosti bod leží. */
  frameAt(model) {
    const p = this.store.project;
    for (let i = p.objects.length - 1; i >= 0; i--) {
      const o = p.objects[i];
      if (o.type !== 'frame' || !p.isVisible(o)) continue;
      if (model.x >= o.x && model.x <= o.x + o.w && model.y >= o.y && model.y <= o.y + o.h) return o;
    }
    return null;
  }

  plateAt(model) {
    const p = this.store.project;
    for (let i = p.objects.length - 1; i >= 0; i--) {
      const o = p.objects[i];
      if (o.type !== 'plate' || !p.isVisible(o)) continue;
      if (G.pointInPolygon(model, o.points)) return o;
    }
    return null;
  }

  /* ─────────────────────────────────────────────────────── události ── */

  bind() {
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', (e) => this.onUp(e));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('dblclick', (e) => this.onDblClick(e));
    c.addEventListener('mouseleave', () => {
      this.hover = null;
      this.requestDraw();
    });
  }

  onWheel(e) {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.view.zoomAt(this.screenPt(e), f);
    this.host.onZoom?.(this.view.scale);
    this.requestDraw();
  }

  onDown(e) {
    const sp = this.screenPt(e);
    const mp = this.view.toModel(sp);

    // Prostřední tlačítko nebo mezerník = posun pohledu.
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      this.drag = { mode: 'pan', last: sp };
      this.canvas.classList.add('panning');
      return;
    }

    if (e.button === 2) {
      const hit = this.hitTest(mp);
      if (hit && !this.store.selection.has(hit.objectId)) this.store.select(hit.objectId);
      this.host.onContextMenu?.(e, hit);
      return;
    }
    if (e.button !== 0) return;

    // Kóta: klepnutí přepíše hodnotu (FR-DIM-001), tažení ji odsune (FR-DIM-004).
    const dim = this.renderer.dimAt(sp.x, sp.y);
    if (dim && ['select','sketch'].includes(this.tool)) {
      this.drag = { mode: 'dim', hit: dim, startScreen: sp, moved: false };
      return;
    }

    this.closeDimEdit();

    switch (this.tool) {
      case 'select':
        this.startSelect(e, mp, sp);
        break;
      case 'sketch':
        this.sketch = [mp];
        this.drag = { mode: 'sketch' };
        break;
      case 'line':
      case 'ref':
        this.chainClick(this.snap(mp), this.tool);
        break;
      case 'rect':
      case 'plate':
      case 'mesh':
        this.drag = { mode: 'rect', start: this.snap(mp), kind: this.tool };
        break;
      case 'fill':
        this.placeFill(mp);
        break;
      case 'hole':
        this.placeHole(this.snap(mp));
        break;
      case 'dim':
        this.dimClick(this.snap(mp));
        break;
      case 'group':
        this.host.onGroupRequest?.();
        break;
      default:
        break;
    }
    this.requestDraw();
  }

  onMove(e) {
    const sp = this.screenPt(e);
    const mp = this.view.toModel(sp);
    this.mouseModel = mp;
    this.host.onCursor?.(mp);

    if (this.drag?.mode === 'pan') {
      this.view.pan(sp.x - this.drag.last.x, sp.y - this.drag.last.y);
      this.drag.last = sp;
      this.requestDraw();
      return;
    }

    if (this.drag?.mode === 'sketch') {
      this.sketch.push(mp);
      this.requestDraw();
      return;
    }

    if (this.drag?.mode === 'rect') {
      const cur = this.snap(mp);
      const s = this.drag.start;
      this.preview = {
        kind: 'rect',
        x: Math.min(s.x, cur.x), y: Math.min(s.y, cur.y),
        w: Math.abs(cur.x - s.x), h: Math.abs(cur.y - s.y),
      };
      this.requestDraw();
      return;
    }

    if (this.drag?.mode === 'move') {
      const cur = this.snap(mp, { off: e.ctrlKey });
      let dx = cur.x - this.drag.start.x;
      let dy = cur.y - this.drag.start.y;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      this.store.touch((p) => {
        for (const [id, orig] of this.drag.origins) {
          const o = p.byId(id);
          if (!o) continue;
          restoreObject(o, orig);
          translateObject(o, dx, dy);
        }
      }, 'drag');
      return;
    }

    if (this.drag?.mode === 'marquee') {
      this.marquee = { x0: this.drag.startScreen.x, y0: this.drag.startScreen.y, x1: sp.x, y1: sp.y };
      this.requestDraw();
      return;
    }

    if (this.drag?.mode === 'dim') {
      const d = this.drag;
      const dx = sp.x - d.startScreen.x;
      const dy = sp.y - d.startScreen.y;
      if (!d.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
      if (!d.moved) {
        d.moved = true;
        if (!d.hit.draggable) {
          this.drag = null;
          return;
        }
        this.store.beginInteraction();
      }
      // Posun jen ve směru kolmém na kótu.
      const delta = dx * d.hit.normal.x + dy * d.hit.normal.y;
      const target = d.hit.offset + delta;
      this.store.touch((p) => {
        const o = p.byId(d.hit.objectId);
        if (!o) return;
        o.dimOffsets = o.dimOffsets || {};
        o.dimOffsets[d.hit.field] = G.round1(target);
      }, 'dim');
      return;
    }

    if (this.chain) {
      const cur = this.snap(mp);
      const pts = [...this.chain.points, cur];
      const last = this.chain.points[this.chain.points.length - 1];
      const d = G.dist(last, cur);
      const ang = G.round1(G.angleOf(G.sub(cur, last)));
      this.preview = {
        kind: 'poly', points: pts, closed: false,
        label: `${Math.round(d)} mm · ${String(ang).replace('.', ',')}°`,
      };
      this.requestDraw();
      return;
    }

    // Zvýraznění pod kurzorem
    this.snap(mp);
    const hit = this.hitTest(mp);
    const newHover = hit?.objectId || null;
    if (newHover !== this.hover) {
      this.hover = newHover;
      this.host.onHover?.(hit);
    }
    this.requestDraw();
  }

  onUp(e) {
    if (!this.drag) return;
    const sp = this.screenPt(e);
    const mp = this.view.toModel(sp);
    const mode = this.drag.mode;

    if (mode === 'pan') {
      this.canvas.classList.remove('panning');
      this.drag = null;
      return;
    }

    if (mode === 'sketch') {
      const stroke = this.sketch || [];
      this.sketch = null;
      this.drag = null;
      this.finishSketch(stroke);
      return;
    }

    if (mode === 'rect') {
      const cur = this.snap(mp);
      const s = this.drag.start;
      const kind = this.drag.kind;
      this.preview = null;
      this.drag = null;
      const rect = {
        x: Math.min(s.x, cur.x), y: Math.min(s.y, cur.y),
        w: Math.abs(cur.x - s.x), h: Math.abs(cur.y - s.y),
      };
      if (rect.w < 5 || rect.h < 5) {
        this.requestDraw();
        return;
      }
      if (kind === 'rect') this.createFrame(rect);
      else if (kind === 'plate') this.createPlate(rect);
      else if (kind === 'mesh') this.createFreeMesh(rect);
      return;
    }

    if (mode === 'move') {
      this.store.endInteraction('Přesun prvku');
      this.drag = null;
      return;
    }

    if (mode === 'marquee') {
      const a = this.view.toModel({ x: this.drag.startScreen.x, y: this.drag.startScreen.y });
      const b = mp;
      const box = {
        minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
      };
      const ids = [];
      for (const o of this.store.project.objects) {
        if (!this.store.project.isVisible(o)) continue;
        const bb = objectBBox(this.store.project, o, this.store.library);
        if (bb && bb.minX >= box.minX && bb.maxX <= box.maxX && bb.minY >= box.minY && bb.maxY <= box.maxY)
          ids.push(o.id);
      }
      this.store.select(ids, e.shiftKey);
      this.marquee = null;
      this.drag = null;
      this.requestDraw();
      return;
    }

    if (mode === 'dim') {
      const d = this.drag;
      this.drag = null;
      if (d.moved) this.store.endInteraction('Posun kóty');
      else this.beginDimEdit(d.hit); // pouhé klepnutí → úprava hodnoty
      return;
    }

    if (mode === 'click') {
      this.drag = null;
      this.requestDraw();
      return;
    }
    this.drag = null;
  }

  onDblClick(e) {
    const mp = this.modelPt(e);
    if (this.chain) {
      this.finishChain(true);
      return;
    }
    const hit = this.hitTest(mp);
    if (hit) this.host.onOpenDetail?.(hit);
  }

  /* ───────────────────────────────────────────────────────── výběr ─── */

  startSelect(e, mp, sp) {
    const hit = this.hitTest(mp);
    if (!hit) {
      if (!e.shiftKey) this.store.clearSelection();
      this.drag = { mode: 'marquee', startScreen: sp };
      return;
    }
    if (e.shiftKey) {
      this.store.toggleSelect(hit.objectId);
      this.drag = { mode: 'click' };
      return;
    }
    if (!this.store.selection.has(hit.objectId)) this.store.select(hit.objectId);
    if (hit.partKey) this.store.setHighlightPart(hit.partKey);

    // Zámek objektu nebo sestavy zabrání posunu.
    const objs = this.store.selectedObjects();
    if (objs.some((o) => o.locked || this.store.project.assembly(o.assemblyId)?.locked)) {
      this.drag = { mode: 'click' };
      return;
    }

    // Posun celé sestavy, když je prvek její součástí (§9.4).
    const ids = new Set();
    for (const o of objs) {
      ids.add(o.id);
      if (o.assemblyId && !e.ctrlKey && !this.editAssembly) {
        for (const s of this.store.project.inAssembly(o.assemblyId)) ids.add(s.id);
      }
    }

    this.store.beginInteraction();
    const origins = new Map();
    for (const id of ids) {
      const o = this.store.project.byId(id);
      if (o) origins.set(id, snapshotObject(o));
    }
    this.drag = { mode: 'move', start: this.snap(mp), origins };
  }

  /* ────────────────────────────────────────────────────── náčrt ────── */

  finishSketch(stroke) {
    if (!stroke || stroke.length < 3) {
      this.requestDraw();
      return;
    }
    const res = recognize(stroke, { gridStep: this.store.project.settings.gridStep });
    if (!res.candidates.length) {
      this.host.onToast?.('Náčrt se nepodařilo rozpoznat. Zkus tah znovu.', 'warn');
      this.requestDraw();
      return;
    }
    const top = res.candidates[0];
    // Jistou interpretaci použijeme rovnou, jinak se zeptáme (FR-DRAW-003).
    if (top.confidence >= CONFIDENT && res.candidates.length === 1) {
      this.applyRecognized(top);
      return;
    }
    if (top.confidence >= CONFIDENT && top.confidence - (res.candidates[1]?.confidence ?? 0) > 0.25) {
      this.applyRecognized(top);
      return;
    }
    const last = stroke[stroke.length - 1];
    this.host.onRecognizeChoice?.(res.candidates, this.view.toScreen(last), (cand) => {
      if (cand) this.applyRecognized(cand);
      else this.requestDraw();
    });
  }

  applyRecognized(cand) {
    switch (cand.kind) {
      case 'rect':
        this.createFrame(cand.data);
        break;
      case 'line':
        this.createProfile([cand.data.a, cand.data.b]);
        break;
      case 'polyline':
        this.createProfile(cand.data.points);
        break;
      case 'polygon':
        this.host.onPolygon?.(cand.data.points);
        break;
      case 'circle': {
        const plate = this.plateAt(cand.data.c);
        if (plate) {
          this.addHoleToPlate(plate, cand.data.c, Math.round(cand.data.r * 2));
        } else {
          this.host.onToast?.('Kruh lze zatím vložit jen jako otvor do plechu nebo patky.', 'warn');
        }
        break;
      }
      default:
        break;
    }
  }

  /* ──────────────────────────────────────────────── tvorba objektů ── */

  defaultMaterialFor(kind) {
    const lib = this.store.library;
    if (kind === 'plech') return lib.plates()[4] || lib.plates()[0] || null;
    if (kind === 'pletivo') return lib.meshes()[0] || null;
    return lib.get('m_jekl_40_40_2') || lib.profiles()[0] || null;
  }

  createFrame(rect) {
    const mat = this.defaultMaterialFor('profil');
    const frame = makeFrame({ ...rect, materialId: mat?.id || null, name: '' });
    this.store.commit('Vložení rámu', (p) => {
      if (mat) p.useMaterial(mat);
      p.add(frame);
    });
    this.store.select(frame.id);
    this.host.onToast?.(`Rám ${Math.round(rect.w)} × ${Math.round(rect.h)} mm – klepni na kótu a přepiš rozměr.`, 'ok');
  }

  createProfile(points) {
    const mat = this.defaultMaterialFor('profil');
    const prof = makeProfile({ points, materialId: mat?.id || null, bend: points.length > 2 ? 'bent' : 'cut' });
    this.store.commit('Vložení profilu', (p) => {
      if (mat) p.useMaterial(mat);
      p.add(prof);
    });
    this.store.select(prof.id);
  }

  createPlate(rect, points = null) {
    const mat = this.defaultMaterialFor('plech');
    const pts = points || G.rectPoints(rect.x, rect.y, rect.w, rect.h);
    const plate = makePlate({
      points: pts,
      materialId: mat?.id || null,
      thickness: mat?.dims?.t ?? 6,
      plateKind: 'patka',
    });
    this.store.commit('Vložení plechu / patky', (p) => {
      if (mat) p.useMaterial(mat);
      p.add(plate);
    });
    this.store.select(plate.id);
  }

  createFreeMesh(rect) {
    const frame = this.frameAt({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
    if (frame) {
      this.placeMeshInFrame(frame);
      return;
    }
    const mat = this.defaultMaterialFor('pletivo');
    const mesh = makeMesh({ ...rect, materialId: mat?.id || null });
    this.store.commit('Vložení pletiva', (p) => {
      if (mat) p.useMaterial(mat);
      p.add(mesh);
    });
    this.store.select(mesh.id);
  }

  placeMeshInFrame(frame) {
    const mat = this.defaultMaterialFor('pletivo');
    const existing = this.store.project.ofType('mesh').find((m) => m.frameId === frame.id);
    if (existing) {
      this.store.select(existing.id);
      this.host.onToast?.('Tento rám už pletivo má.', 'warn');
      return;
    }
    const mesh = makeMesh({ frameId: frame.id, inset: 0, materialId: mat?.id || null });
    this.store.commit('Vložení pletiva do rámu', (p) => {
      if (mat) p.useMaterial(mat);
      // Pletivo nahrazuje profilovou výplň téhož rámu (§9.3 / scénář A3).
      const fills = p.ofType('fill').filter((f) => f.frameId === frame.id);
      for (const f of fills) p.remove(f.id);
      p.add(mesh);
    });
    this.store.select(mesh.id);
  }

  placeFill(model) {
    const frame = this.frameAt(model);
    if (!frame) {
      this.host.onToast?.('Klepni dovnitř rámu, do kterého má výplň patřit.', 'warn');
      return;
    }
    const existing = this.store.project.ofType('fill').find((f) => f.frameId === frame.id);
    if (existing) {
      this.store.select(existing.id);
      this.host.onToast?.('Rám už výplň má – uprav ji v panelu vlastností.', 'warn');
      return;
    }
    const mat = this.store.library.get('m_jekl_20_20_2') || this.defaultMaterialFor('profil');
    const fill = makeFill({ frameId: frame.id, dir: 'v', mode: 'count', count: 7, materialId: mat?.id || null });
    this.store.commit('Vložení výplně', (p) => {
      if (mat) p.useMaterial(mat);
      const meshes = p.ofType('mesh').filter((m) => m.frameId === frame.id);
      for (const m of meshes) p.remove(m.id);
      fill.assemblyId = frame.assemblyId;
      p.add(fill);
    });
    this.store.select(fill.id);
  }

  placeHole(model) {
    const plate = this.plateAt(model);
    if (!plate) {
      this.host.onToast?.('Otvor lze vložit jen do plechu nebo patky.', 'warn');
      return;
    }
    this.addHoleToPlate(plate, model, 14);
  }

  addHoleToPlate(plate, center, d) {
    const hole = makeHole({ cx: G.round1(center.x), cy: G.round1(center.y), d, kind: 'circle' });
    this.store.commit('Vložení otvoru', (p) => {
      const pl = p.byId(plate.id);
      if (pl) pl.holes.push(hole);
    });
    this.store.select(plate.id);
  }

  /* ────────────────────────────────────────── lomený tvar / okolí ─── */

  chainClick(pt, kind) {
    if (!this.chain) {
      this.chain = { points: [pt], kind };
      this.host.onToast?.(
        kind === 'ref'
          ? 'Klepáním přidávej body okolí. Dvojklik nebo Enter ukončí, Esc zruší.'
          : 'Klepni na druhý bod. Další klepnutí přidá lom. Dvojklik nebo Enter ukončí.',
        'ok'
      );
      return;
    }
    const last = this.chain.points[this.chain.points.length - 1];
    if (G.dist(last, pt) < 1) return;
    this.chain.points.push(pt);
    // Čára ze dvou bodů se dokončí sama, lomený tvar pokračuje.
    if (kind === 'line' && this.chain.points.length === 2 && !this.chain.multi) {
      this.chain.multi = true;
    }
  }

  finishChain(fromDblClick = false) {
    if (!this.chain) return;
    const pts = this.chain.points.slice();
    const kind = this.chain.kind;
    this.chain = null;
    this.preview = null;
    // Dvojklik zopakuje poslední bod – zahodíme ho.
    if (fromDblClick && pts.length > 2 && G.dist(pts[pts.length - 1], pts[pts.length - 2]) < 1) pts.pop();
    if (pts.length < 2) {
      this.requestDraw();
      return;
    }
    if (kind === 'line') this.createProfile(pts);
    else this.createRef(pts);
    this.requestDraw();
  }

  createRef(points) {
    const ref = makeRef({ points, closed: false, refKind: 'zed' });
    this.store.commit('Vložení okolí', (p) => p.add(ref));
    this.store.select(ref.id);
    this.host.onToast?.('Okolí nevstupuje do kusovníku ani nářezu.', 'ok');
  }

  /* ─────────────────────────────────────────────────── ruční kóta ─── */

  dimClick(pt) {
    if (!this.dimStart) {
      this.dimStart = pt;
      this.host.onToast?.('Klepni na druhý bod kóty.', 'ok');
      return;
    }
    const a = this.dimStart;
    this.dimStart = null;
    if (G.dist(a, pt) < 1) return;
    const dim = makeDim({ a, b: pt, offset: 60 });
    this.store.commit('Vložení kóty', (p) => p.add(dim));
    this.store.select(dim.id);
  }

  /* ───────────────────────────────────────────────── úprava kóty ──── */

  beginDimEdit(hit) {
    const el = this.host.dimEditorEl;
    const input = this.host.dimInputEl;
    if (!el || !input) return;
    this.dimEdit = hit;
    el.classList.remove('hidden');
    el.style.left = `${hit.cx - 52}px`;
    el.style.top = `${hit.cy - 13}px`;
    this.host.dimUnitEl.textContent = hit.isAngle ? '°' : 'mm';
    input.value = String(G.round1(hit.value)).replace('.', ',');
    input.select();
    input.focus();
  }

  closeDimEdit() {
    if (!this.dimEdit) return;
    this.dimEdit = null;
    this.host.dimEditorEl?.classList.add('hidden');
  }

  commitDimEdit(raw) {
    const hit = this.dimEdit;
    if (!hit) return;
    const val = hit.isAngle ? parseAngle(raw) : parseLength(raw);
    this.closeDimEdit();
    if (val == null) {
      this.host.onToast?.('Nesrozumitelná hodnota. Zkus například 900 nebo 90 cm.', 'warn');
      return;
    }
    try {
      this.applyDimEdit(hit, val);
    } catch (err) {
      this.host.onToast?.(err.message, 'err');
    }
  }

  /** Přepočet geometrie po přepsání kóty (FR-DIM-001, FR-DIM-002). */
  applyDimEdit(hit, value) {
    const store = this.store;
    const obj = store.project.byId(hit.objectId);
    if (!obj) return;

    store.commit(`Úprava kóty – ${hit.label || 'rozměr'}`, (p) => {
      const o = p.byId(hit.objectId);
      if (!o) return;

      if (o.type === 'frame' && (hit.field === 'w' || hit.field === 'h')) {
        if (value <= 0) throw new Error('Rozměr musí být větší než nula.');
        applyAnchoredResize(o, hit.field, value);
        return;
      }

      if (o.type === 'profile' && hit.field.startsWith('seg')) {
        const i = parseInt(hit.field.slice(3), 10);
        const chain = pointsToChain(o.points);
        if (!chain.segments[i]) return;
        if (value <= 0) throw new Error('Délka úseku musí být větší než nula.');
        chain.segments[i].length = value;
        o.points = chainToPoints(o.points[0], chain.segments);
        return;
      }

      if (o.type === 'profile' && hit.field.startsWith('bend')) {
        const i = parseInt(hit.field.slice(4), 10);
        const chain = pointsToChain(o.points);
        if (!chain.segments[i + 1]) return;
        // Zachováme znaménko lomu, měníme jen velikost úhlu.
        const prevAngle = chain.segments[i].angle;
        const oldDelta = G.normAngle(chain.segments[i + 1].angle - prevAngle);
        const sign = oldDelta >= 0 ? 1 : -1;
        const delta = sign * Math.abs(value);
        const shift = delta - oldDelta;
        for (let k = i + 1; k < chain.segments.length; k++) {
          chain.segments[k].angle = G.round1(G.normAngle(chain.segments[k].angle + shift));
        }
        o.points = chainToPoints(o.points[0], chain.segments);
        return;
      }

      if (o.type === 'plate' && (hit.field === 'plateW' || hit.field === 'plateH')) {
        const bb = G.bboxOf(o.points);
        if (value <= 0) throw new Error('Rozměr musí být větší než nula.');
        const sx = hit.field === 'plateW' ? value / Math.max(bb.w, 1e-6) : 1;
        const sy = hit.field === 'plateH' ? value / Math.max(bb.h, 1e-6) : 1;
        o.points = o.points.map((q) => ({
          x: G.round1(bb.minX + (q.x - bb.minX) * sx),
          y: G.round1(bb.minY + (q.y - bb.minY) * sy),
        }));
        // Otvory se posunou úměrně, aby zůstaly na svém místě v plechu.
        for (const h of o.holes || []) {
          h.cx = G.round1(bb.minX + (h.cx - bb.minX) * sx);
          h.cy = G.round1(bb.minY + (h.cy - bb.minY) * sy);
        }
        return;
      }

      if (o.type === 'mesh' && (hit.field === 'meshW' || hit.field === 'meshH')) {
        if (value <= 0) throw new Error('Rozměr musí být větší než nula.');
        if (hit.field === 'meshW') o.overrideW = value;
        else o.overrideH = value;
        return;
      }

      if (o.type === 'ref' && hit.field.startsWith('refSeg')) {
        const i = parseInt(hit.field.slice(6), 10);
        if (!o.points[i + 1]) return;
        const d = G.norm(G.sub(o.points[i + 1], o.points[i]));
        const delta = G.sub(G.add(o.points[i], G.mul(d, value)), o.points[i + 1]);
        for (let k = i + 1; k < o.points.length; k++) {
          o.points[k] = { x: G.round1(o.points[k].x + delta.x), y: G.round1(o.points[k].y + delta.y) };
        }
        return;
      }

      if (o.type === 'dim') {
        const d = G.norm(G.sub(o.b, o.a));
        o.b = { x: G.round1(o.a.x + d.x * value), y: G.round1(o.a.y + d.y * value) };
      }
    });
  }

  /* ─────────────────────────────────────────────────────── ostatní ── */

  cancelPending() {
    this.sketch = null;
    this.preview = null;
    this.chain = null;
    this.dimStart = null;
    this.marquee = null;
    this.closeDimEdit();
    if (this.drag?.mode === 'move') this.store.cancelInteraction();
    this.drag = null;
    this.requestDraw();
  }

  zoom(factor) {
    this.view.zoomAt({ x: this.renderer.width / 2, y: this.renderer.height / 2 }, factor);
    this.host.onZoom?.(this.view.scale);
    this.requestDraw();
  }
}

/* ──────────────────────────────────────────────── pomocné funkce ──── */

function snapshotObject(o) {
  return JSON.parse(JSON.stringify(o));
}

function restoreObject(target, source) {
  if ('x' in source) target.x = source.x;
  if ('y' in source) target.y = source.y;
  if (source.points) target.points = source.points.map((q) => ({ ...q }));
  if (source.a) target.a = { ...source.a };
  if (source.b) target.b = { ...source.b };
  if (source.holes) target.holes = source.holes.map((h) => ({ ...h }));
}

/**
 * Změna rozměru rámu při zachování pevného bodu (FR-DIM-003).
 * Výchozí kotva je levý dolní roh – první nakreslený bod.
 */
export function applyAnchoredResize(frame, field, value) {
  const a = frame.anchor || 'bl';
  if (field === 'w') {
    const old = frame.w;
    frame.w = value;
    if (a === 'br' || a === 'tr') frame.x -= value - old;
    else if (a === 'center') frame.x -= (value - old) / 2;
  } else if (field === 'h') {
    const old = frame.h;
    frame.h = value;
    if (a === 'tl' || a === 'tr') frame.y -= value - old;
    else if (a === 'center') frame.y -= (value - old) / 2;
  }
}
