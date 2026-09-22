/**
 * Automatický 3D náhled (§14).
 *
 * Model se skládá z odvozených dílů: průřez z databáze materiálů se vytáhne
 * podél osy dílu a konce se zkosí podle skutečných úhlů řezu. 3D je kontrolní
 * náhled – veškeré úpravy se dělají ve 2D (FR-3D-007).
 */
import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import * as G from '../core/geom.js';
import { sectionOutline, sectionWidth } from '../core/materials.js';
import { deviationOf } from '../core/build.js';
import { meshRect } from '../core/model.js';

export class View3D {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Store} store
   * @param {{interactive?:boolean, onPick?:Function}} opts
   */
  constructor(canvas, store, opts = {}) {
    this.canvas = canvas;
    this.store = store;
    this.opts = opts;
    this.enabled = false;
    this.showEdges = true;
    this.showRef = false;
    this.dirty = true;
    this._raf = null;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor(0xf2f5f8, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 400000);
    this.camera.position.set(2200, 1800, 3400);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.setupLights();
    this.setupGround();

    if (opts.interactive !== false) {
      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.12;
      this.controls.screenSpacePanning = true;
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      this.controls.addEventListener('change', () => this.requestRender());
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      if (opts.onPick) canvas.addEventListener('click', (e) => this.pick(e));
    }

    this.ro = new ResizeObserver(() => {
      this.resize();
      this.requestRender();
    });
    this.ro.observe(canvas.parentElement || canvas);

    store.subscribe((reason) => {
      if (reason === 'selection' || reason === 'highlight') this.refreshSelection();
      else this.dirty = true;
      this.requestRender();
    });
  }

  setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa5b0, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(1600, 2600, 2400);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(-2200, 900, -1500);
    this.scene.add(fill);
  }

  setupGround() {
    this.grid = new THREE.GridHelper(20000, 40, 0xc2ccd6, 0xdde4eb);
    this.grid.position.y = 0;
    this.scene.add(this.grid);
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) {
      this.resize();
      this.dirty = true;
      this.requestRender();
    }
  }

  resize() {
    const el = this.canvas.parentElement || this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  requestRender() {
    if (this._raf || !this.enabled) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      if (this.dirty) {
        this.rebuild();
        this.dirty = false;
      }
      const changed = this.controls?.update();
      this.renderer.render(this.scene, this.camera);
      // Tlumení kamery potřebuje další snímek.
      if (changed) this.requestRender();
    });
  }

  /* ─────────────────────────────────────────────────── stavba scény ── */

  clearRoot() {
    for (const child of [...this.root.children]) {
      this.root.remove(child);
      child.traverse?.((n) => {
        n.geometry?.dispose?.();
        if (Array.isArray(n.material)) n.material.forEach((m) => m.dispose());
        else n.material?.dispose?.();
      });
    }
  }

  rebuild() {
    this.clearRoot();
    const store = this.store;
    const p = store.project;

    for (const part of store.derived.parts) {
      if (!p.isVisible(p.byId(part.objectId))) continue;
      if (part.kind === 'profil') this.addProfilePart(part);
      else if (part.kind === 'plech') this.addPlatePart(part);
      else if (part.kind === 'pletivo') this.addMeshPart(part);
    }

    if (this.showRef) {
      for (const ref of p.ofType('ref')) if (p.isVisible(ref)) this.addRef(ref);
    }

    this.refreshSelection();
  }

  materialFor(part, base) {
    const key = `${base}`;
    this._matCache = this._matCache || new Map();
    if (!this._matCache.has(key)) {
      this._matCache.set(
        key,
        new THREE.MeshStandardMaterial({ color: new THREE.Color(base), metalness: 0.45, roughness: 0.55 })
      );
    }
    return this._matCache.get(key);
  }

  addProfilePart(part) {
    const store = this.store;
    const mat = store.project.material(part.materialId, store.library);
    if (!mat || !part.axis) return;

    const obj = store.project.byId(part.objectId);
    const bent = part.bendGeometry && obj?.type === 'profile' && obj.points.length > 2;

    if (bent) {
      // Ohýbaný díl skládáme z rovných úseků – konce zkosíme na polovinu lomu.
      const pts = obj.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const prevBend = i > 0 ? bendAt(pts, i) : 0;
        const nextBend = i < pts.length - 2 ? bendAt(pts, i + 1) : 0;
        const cutA = prevBend ? { angle: 90 - Math.abs(prevBend) / 2, orient: prevBend > 0 ? -1 : 1 } : { angle: 90, orient: 0 };
        const cutB = nextBend ? { angle: 90 - Math.abs(nextBend) / 2, orient: nextBend > 0 ? -1 : 1 } : { angle: 90, orient: 0 };
        this.addExtrusion(part, mat, pts[i], pts[i + 1], cutA, cutB);
      }
      return;
    }
    this.addExtrusion(part, mat, part.axis.a, part.axis.b, part.cutL, part.cutR);
  }

  /** Vytažení průřezu podél osy se zkosenými konci. */
  addExtrusion(part, mat, a, b, cutA, cutB) {
    const L = G.dist(a, b);
    if (L < 0.01) return;

    const outline = sectionOutline(mat);
    const shape = new THREE.Shape(outline.outer.map((q) => new THREE.Vector2(q.x, q.y)));
    for (const hole of outline.holes || []) {
      shape.holes.push(new THREE.Path(hole.map((q) => new THREE.Vector2(q.x, q.y))));
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false, curveSegments: 16 });
    const half = Math.max(sectionWidth(mat) / 2, 0.001);
    const extA = miterExt(cutA, half);
    const extB = miterExt(cutB, half);
    const oA = cutA?.orient || 0;
    const oB = cutB?.orient || 0;

    // Posun vrcholů na koncích podle roviny řezu – vznikne skutečný pokos.
    if (extA > 0 || extB > 0) {
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        if (z < 0.001) pos.setZ(i, -oA * (x / half) * extA);
        else if (z > L - 0.001) pos.setZ(i, L + oB * (x / half) * extB);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }

    const dir = G.norm(G.sub(b, a));
    const nrm = G.perp(dir);
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(nrm.x, nrm.y, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(dir.x, dir.y, 0)
    );
    basis.setPosition(a.x, a.y, 0);
    geo.applyMatrix4(basis);

    const mesh = new THREE.Mesh(geo, this.materialFor(part, mat.color || '#7d8b99'));
    mesh.userData = { objectId: part.objectId, partKey: part.key, baseColor: mat.color || '#7d8b99' };
    this.root.add(mesh);

    if (this.showEdges) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 25),
        new THREE.LineBasicMaterial({ color: 0x3c4854, transparent: true, opacity: 0.55 })
      );
      edges.userData.isEdge = true;
      this.root.add(edges);
    }
  }

  addPlatePart(part) {
    const store = this.store;
    const obj = store.project.byId(part.objectId);
    if (!obj) return;
    const mat = store.project.material(part.materialId, store.library);
    const th = part.thickness || 6;

    const shape = new THREE.Shape(obj.points.map((q) => new THREE.Vector2(q.x, q.y)));
    for (const h of obj.holes || []) {
      const path = new THREE.Path();
      if (h.kind === 'circle') {
        path.absarc(h.cx, h.cy, h.d / 2, 0, Math.PI * 2, true);
      } else {
        // Ovál jako obdélník se zaoblenými konci.
        const r = Math.min(h.w, h.h) / 2;
        if (h.w >= h.h) {
          const dx = h.w / 2 - r;
          path.absarc(h.cx + dx, h.cy, r, -Math.PI / 2, Math.PI / 2, false);
          path.absarc(h.cx - dx, h.cy, r, Math.PI / 2, Math.PI * 1.5, false);
        } else {
          const dy = h.h / 2 - r;
          path.absarc(h.cx, h.cy + dy, r, 0, Math.PI, false);
          path.absarc(h.cx, h.cy - dy, r, Math.PI, Math.PI * 2, false);
        }
      }
      shape.holes.push(path);
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false, curveSegments: 20 });
    geo.translate(0, 0, -th / 2);
    const mesh = new THREE.Mesh(geo, this.materialFor(part, mat?.color || '#98a1ab'));
    mesh.userData = { objectId: part.objectId, partKey: part.key, baseColor: mat?.color || '#98a1ab' };
    this.root.add(mesh);

    if (this.showEdges) {
      this.root.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(geo, 25),
          new THREE.LineBasicMaterial({ color: 0x3c4854, transparent: true, opacity: 0.5 })
        )
      );
    }
  }

  addMeshPart(part) {
    const store = this.store;
    const obj = store.project.byId(part.objectId);
    if (!obj) return;
    const r = meshRect(store.project, obj, store.library);
    if (!(r.w > 0) || !(r.h > 0)) return;

    const geo = new THREE.PlaneGeometry(r.w, r.h);
    const material = new THREE.MeshStandardMaterial({
      color: 0x7f9c7f,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      roughness: 0.8,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(r.x + r.w / 2, r.y + r.h / 2, 0);
    mesh.userData = { objectId: part.objectId, partKey: part.key, isMesh: true };
    this.root.add(mesh);

    // Naznačení oka pletiva mřížkou čar.
    const step = 50;
    const pts = [];
    for (let x = 0; x <= r.w; x += step) pts.push(r.x + x, r.y, 0.5, r.x + x, r.y + r.h, 0.5);
    for (let y = 0; y <= r.h; y += step) pts.push(r.x, r.y + y, 0.5, r.x + r.w, r.y + y, 0.5);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.root.add(
      new THREE.LineSegments(
        lineGeo,
        new THREE.LineBasicMaterial({ color: 0x5f7c5f, transparent: true, opacity: 0.45 })
      )
    );
  }

  addRef(ref) {
    if (!ref.points || ref.points.length < 2) return;
    const pts = [];
    for (let i = 0; i < ref.points.length - 1; i++) {
      pts.push(ref.points[i].x, ref.points[i].y, 0, ref.points[i + 1].x, ref.points[i + 1].y, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const line = new THREE.LineSegments(
      geo,
      new THREE.LineDashedMaterial({ color: 0x9aa6b2, dashSize: 60, gapSize: 40 })
    );
    line.computeLineDistances();
    this.root.add(line);
  }

  /* ────────────────────────────────────────────────── výběr a výřez ── */

  refreshSelection() {
    const sel = this.store.selection;
    const hi = this.store.highlightPart;
    for (const child of this.root.children) {
      const ud = child.userData;
      if (!ud?.objectId || !child.material || ud.isEdge) continue;
      const isSel = sel.has(ud.objectId);
      const isHi = hi && ud.partKey === hi;
      if (isHi) child.material = this.pickMaterial('#e07b1a');
      else if (isSel) child.material = this.pickMaterial('#1b64c4');
      else if (ud.isMesh) {
        /* pletivo si ponechá poloprůhledný materiál */
      } else child.material = this.materialFor(null, ud.baseColor || '#7d8b99');
    }
    this.requestRender();
  }

  pickMaterial(color) {
    this._selCache = this._selCache || new Map();
    if (!this._selCache.has(color)) {
      this._selCache.set(
        color,
        new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: 0.3, roughness: 0.5 })
      );
    }
    return this._selCache.get(color);
  }

  /** Kliknutí v 3D vybere stejný prvek ve 2D, vlastnostech i kusovníku (FR-3D-004). */
  pick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const targets = this.root.children.filter((c) => c.isMesh);
    const hits = ray.intersectObjects(targets, false);
    if (!hits.length) {
      this.store.clearSelection();
      return;
    }
    const ud = hits[0].object.userData;
    this.store.select(ud.objectId);
    if (ud.partKey) this.store.setHighlightPart(ud.partKey);
    this.opts.onPick?.(ud);
  }

  /* ───────────────────────────────────────────────────────── pohled ── */

  boundsOf() {
    const box = new THREE.Box3();
    let any = false;
    for (const c of this.root.children) {
      if (!c.geometry) continue;
      c.geometry.computeBoundingBox();
      box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld));
      any = true;
    }
    return any && !box.isEmpty() ? box : null;
  }

  /** Směry standardních pohledů. */
  static DIRS = {
    front: [0, 0, 1],
    iso: [0.55, 0.42, 1],
    top: [0, 1, 0.02],
    side: [1, 0.15, 0],
  };

  /**
   * Nastaví kameru tak, aby konstrukce vyplnila okno.
   *
   * Odhad z opsané koule nechává u ploché a široké konstrukce spoustu prázdna,
   * proto se vzdálenost doladí promítnutím rohů obálky: největší roh má skončit
   * na 88 % poloviny obrazu. Dvě až tři iterace stačí.
   */
  frameBox(box, dirArray) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const dir = new THREE.Vector3(...dirArray).normalize();
    const radius = Math.max(size.length() / 2, 50);
    let dist = radius / Math.sin((this.camera.fov * Math.PI) / 360);

    const corners = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));

    for (let i = 0; i < 4; i++) {
      this.camera.position.copy(center).addScaledVector(dir, dist);
      this.camera.near = Math.max(0.5, dist / 2000);
      this.camera.far = dist * 20;
      this.camera.lookAt(center);
      this.camera.updateMatrixWorld(true);
      this.camera.updateProjectionMatrix();

      let worst = 0;
      for (const c of corners) {
        const p = c.clone().project(this.camera);
        worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y));
      }
      if (!(worst > 1e-6)) break;
      const next = dist * (worst / 0.88);
      if (Math.abs(next - dist) < dist * 0.005) break;
      dist = next;
    }

    if (this.controls) {
      this.controls.target.copy(center);
      this.controls.update();
    } else this.camera.lookAt(center);

    this.grid.position.set(center.x, Math.min(0, box.min.y), 0);
    this.requestRender();
  }

  fit() {
    if (this.dirty) {
      this.rebuild();
      this.dirty = false;
    }
    const box = this.boundsOf();
    if (!box) return;
    this.frameBox(box, View3D.DIRS.iso);
  }

  setStandardView(which) {
    if (this.dirty) {
      this.rebuild();
      this.dirty = false;
    }
    const box = this.boundsOf();
    if (!box) return;
    this.frameBox(box, View3D.DIRS[which] || View3D.DIRS.iso);
  }

  setEdges(on) {
    this.showEdges = on;
    this.dirty = true;
    this.requestRender();
  }
  setRefVisible(on) {
    this.showRef = on;
    this.dirty = true;
    this.requestRender();
  }
}

/* ───────────────────────────────────────────────────────── pomocné ── */

function miterExt(cut, half) {
  const dev = G.clamp(deviationOf(cut), -85, 85);
  return Math.abs(dev) < 1e-6 ? 0 : Math.abs(half * Math.tan(dev * G.RAD));
}

/** Změna směru v i-tém vrcholu lomené osy. */
function bendAt(pts, i) {
  const a1 = G.angleOf(G.sub(pts[i], pts[i - 1]));
  const a2 = G.angleOf(G.sub(pts[i + 1], pts[i]));
  return G.normAngle(a2 - a1);
}
