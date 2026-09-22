/**
 * Rozpoznání volného náčrtu (§6.1).
 *
 * Vrací seřazený seznam možných interpretací. Když je nejlepší shoda nejistá,
 * uživateli se nabídnou 2–3 varianty a program nerozhodne sám (FR-DRAW-003).
 */
import * as G from './geom.js';

/** Významné směry, na které se čára narovnává (FR-DRAW-005). */
const CARDINALS = [0, 45, 90, 135];
/** Tolerance přichycení úhlu ke kardinálnímu směru. */
const CARDINAL_TOL = 7;
/** Nad touto jistotou program interpretaci použije rovnou. */
export const CONFIDENT = 0.8;

/**
 * @param {Array<{x,y}>} raw stopa myši v modelových souřadnicích (mm)
 * @param {{gridStep?:number, allowClose?:boolean}} opts
 * @returns {{candidates: Array}}
 */
export function recognize(raw, opts = {}) {
  const gridStep = opts.gridStep || 10;
  const pts = G.dedupe(raw, 0.4);
  if (pts.length < 2) return { candidates: [] };

  const bb = G.bboxOf(pts);
  const diag = Math.hypot(bb.w, bb.h);
  if (diag < 1) return { candidates: [] };

  const total = G.pathLength(pts);
  const gap = G.dist(pts[0], pts[pts.length - 1]);
  // Uzavřenost: konec blízko začátku a stopa výrazně delší než ta mezera.
  const closed = gap < Math.max(diag * 0.22, 12) && total > diag * 1.6;

  const tol = Math.max(diag * 0.035, 1.5);
  let simp = G.simplify(pts, tol);
  if (closed && simp.length > 2 && G.dist(simp[0], simp[simp.length - 1]) < tol * 2) simp = simp.slice(0, -1);

  const candidates = [];

  if (closed) {
    candidates.push(...closedCandidates(pts, simp, bb, diag, gridStep));
  } else {
    candidates.push(...openCandidates(pts, simp, bb, diag, gridStep));
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return { candidates: candidates.slice(0, 3), closed, raw: pts };
}

/* ------------------------------------------------------ uzavřené tvary --- */

function closedCandidates(pts, simp, bb, diag, gridStep) {
  const out = [];

  /* --- obdélník --- */
  const rect = snapRect(bb, gridStep);
  const rectFit = fitToRectPerimeter(pts, bb) / diag;
  let rectConf = G.clamp(1 - rectFit * 7, 0, 1);
  // Čtyři rohy s pravými úhly jistotu zvyšují, jiný počet ji sráží.
  const corners = cornerAngles(simp);
  if (simp.length === 4 && corners.every((a) => Math.abs(a - 90) < 22)) rectConf = Math.min(1, rectConf + 0.22);
  else if (simp.length > 5) rectConf *= 0.55;
  if (rect.w > 0.5 && rect.h > 0.5) {
    out.push({
      kind: 'rect',
      confidence: rectConf,
      label: 'Obdélník',
      hint: `${Math.round(rect.w)} × ${Math.round(rect.h)} mm`,
      data: rect,
    });
  }

  /* --- kruh --- */
  const circ = fitCircle(pts);
  if (circ) {
    const err = circleError(pts, circ) / Math.max(circ.r, 1);
    const conf = G.clamp(1 - err * 6, 0, 1) * (Math.abs(bb.w - bb.h) / diag < 0.18 ? 1 : 0.5);
    out.push({
      kind: 'circle',
      confidence: conf,
      label: 'Kruh',
      hint: `Ø ${Math.round(snapTo(circ.r * 2, gridStep))} mm`,
      data: { c: circ.c, r: snapTo(circ.r, gridStep / 2) },
    });
  }

  /* --- obecný mnohoúhelník --- */
  if (simp.length >= 3 && simp.length <= 12) {
    const poly = simp.map((p) => snapPoint(p, gridStep));
    out.push({
      kind: 'polygon',
      confidence: G.clamp(0.5 + (simp.length === 4 ? 0 : 0.12), 0, 0.72),
      label: `Uzavřený tvar (${simp.length} vrcholů)`,
      hint: 'Zachová nakreslené vrcholy',
      data: { points: G.ensureCCW(poly) },
    });
  }

  return out;
}

/* -------------------------------------------------------- otevřené ------ */

function openCandidates(pts, simp, bb, diag, gridStep) {
  const out = [];

  /* --- přímá čára --- */
  const a0 = pts[0];
  const b0 = pts[pts.length - 1];
  const lineErr = meanDistToSegment(pts, a0, b0) / diag;
  const lineConf = G.clamp(1 - lineErr * 12, 0, 1);
  const lineData = straightenLine(a0, b0, gridStep);
  out.push({
    kind: 'line',
    confidence: lineConf * (simp.length <= 3 ? 1 : 0.75),
    label: lineData.snapped ? `Čára ${fmtDir(lineData.angle)}` : 'Čára (vlastní úhel)',
    hint: `${Math.round(lineData.length)} mm, ${fmtAngleShort(lineData.angle)}`,
    data: lineData,
  });

  // Varianta bez přichycení úhlu, pokud se přichycení projevilo.
  if (lineData.snapped) {
    const freeLen = G.dist(a0, b0);
    out.push({
      kind: 'line',
      confidence: lineConf * 0.62,
      label: 'Čára – ponechat nakreslený úhel',
      hint: `${Math.round(freeLen)} mm, ${fmtAngleShort(G.angleOf(G.sub(b0, a0)))}`,
      data: {
        a: snapPoint(a0, gridStep),
        b: { x: a0.x + (b0.x - a0.x), y: a0.y + (b0.y - a0.y) },
        angle: G.angleOf(G.sub(b0, a0)),
        length: freeLen,
        snapped: false,
      },
    });
  }

  /* --- lomený tvar (Z, L, …) --- */
  if (simp.length >= 3) {
    const chain = straightenChain(simp, gridStep);
    const chainErr = meanDistToPolyline(pts, simp) / diag;
    const conf = G.clamp(1 - chainErr * 10, 0, 1) * (simp.length <= 6 ? 1 : 0.8);
    out.push({
      kind: 'polyline',
      confidence: conf + (simp.length >= 3 ? 0.1 : 0),
      label: `Lomený profil (${chain.segments.length} úseků)`,
      hint: chain.segments.map((s) => Math.round(s.length)).join(' – ') + ' mm',
      data: chain,
    });
  }

  return out;
}

/* ------------------------------------------------------- narovnávání ---- */

/** Narovná čáru na nejbližší významný směr (0/45/90/135°). */
export function straightenLine(a, b, gridStep = 10) {
  const d = G.sub(b, a);
  const rawAngle = G.angleOf(d);
  const length = G.len(d);
  const dir = G.normAngle180(rawAngle);

  let best = null;
  let bestDiff = Infinity;
  for (const c of CARDINALS) {
    const diff = Math.min(Math.abs(dir - c), 180 - Math.abs(dir - c));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }

  const start = snapPoint(a, gridStep);
  if (bestDiff <= CARDINAL_TOL) {
    // Zachovej směr chodu (vpřed/vzad) a přichyť délku na krok mřížky.
    const targetAngle = Math.abs(G.normAngle(rawAngle - best)) < 90 ? best : best + 180;
    const L = snapTo(length, gridStep);
    const r = targetAngle * G.RAD;
    return {
      a: start,
      b: { x: start.x + Math.cos(r) * L, y: start.y + Math.sin(r) * L },
      angle: G.normAngle(targetAngle),
      length: L,
      snapped: true,
    };
  }
  const L = snapTo(length, gridStep);
  const r = rawAngle * G.RAD;
  return {
    a: start,
    b: { x: start.x + Math.cos(r) * L, y: start.y + Math.sin(r) * L },
    angle: G.round1(rawAngle),
    length: L,
    snapped: false,
  };
}

/**
 * Narovná lomený řetězec: každý úsek dostane vlastní délku a úhel,
 * navazování se zachová od prvního bodu (§13).
 */
export function straightenChain(vertices, gridStep = 10) {
  const segsRaw = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const d = G.sub(vertices[i + 1], vertices[i]);
    let angle = G.angleOf(d);
    const dir = G.normAngle180(angle);
    for (const c of CARDINALS) {
      const diff = Math.min(Math.abs(dir - c), 180 - Math.abs(dir - c));
      if (diff <= CARDINAL_TOL) {
        angle = Math.abs(G.normAngle(angle - c)) < 90 ? c : c + 180;
        break;
      }
    }
    segsRaw.push({ length: snapTo(G.len(d), gridStep) || gridStep, angle: G.round1(G.normAngle(angle)) });
  }

  const start = snapPoint(vertices[0], gridStep);
  const points = [start];
  for (const s of segsRaw) {
    const p = points[points.length - 1];
    const r = s.angle * G.RAD;
    points.push({ x: G.round1(p.x + Math.cos(r) * s.length), y: G.round1(p.y + Math.sin(r) * s.length) });
  }

  // Úhly lomů = odchylka mezi navazujícími úseky.
  const bends = [];
  for (let i = 1; i < segsRaw.length; i++) {
    bends.push(G.round1(Math.abs(G.normAngle(segsRaw[i].angle - segsRaw[i - 1].angle))));
  }

  return { points, segments: segsRaw, bends };
}

/** Přepočítá body řetězce z délek úseků a úhlů lomů (parametrická úprava, §13). */
export function chainToPoints(start, segments) {
  const points = [{ x: start.x, y: start.y }];
  for (const s of segments) {
    const p = points[points.length - 1];
    const r = s.angle * G.RAD;
    points.push({ x: p.x + Math.cos(r) * s.length, y: p.y + Math.sin(r) * s.length });
  }
  return points;
}

/** Rozloží body řetězce zpět na délky a úhly úseků. */
export function pointsToChain(points) {
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const d = G.sub(points[i + 1], points[i]);
    segments.push({ length: G.round1(G.len(d)), angle: G.round1(G.angleOf(d)) });
  }
  const bends = [];
  for (let i = 1; i < segments.length; i++) {
    bends.push(G.round1(Math.abs(G.normAngle(segments[i].angle - segments[i - 1].angle))));
  }
  return { points, segments, bends };
}

/* --------------------------------------------------------- pomocné ------ */

function snapTo(v, step) {
  if (!step || step <= 0) return G.round1(v);
  return Math.round(v / step) * step;
}

function snapPoint(p, step) {
  return { x: snapTo(p.x, step), y: snapTo(p.y, step) };
}

function snapRect(bb, step) {
  const x = snapTo(bb.minX, step);
  const y = snapTo(bb.minY, step);
  const w = Math.max(step, snapTo(bb.w, step));
  const h = Math.max(step, snapTo(bb.h, step));
  return { x, y, w, h };
}

function cornerAngles(poly) {
  const n = poly.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const cur = poly[i];
    const next = poly[(i + 1) % n];
    const a = G.angleOf(G.sub(prev, cur));
    const b = G.angleOf(G.sub(next, cur));
    out.push(Math.abs(G.normAngle(b - a)));
  }
  return out;
}

function fitToRectPerimeter(pts, bb) {
  const corners = [
    { x: bb.minX, y: bb.minY },
    { x: bb.maxX, y: bb.minY },
    { x: bb.maxX, y: bb.maxY },
    { x: bb.minX, y: bb.maxY },
  ];
  let sum = 0;
  for (const p of pts) sum += G.distToPolyline(p, corners, true);
  return sum / pts.length;
}

function meanDistToSegment(pts, a, b) {
  let sum = 0;
  for (const p of pts) sum += G.distToSegment(p, a, b);
  return sum / pts.length;
}

function meanDistToPolyline(pts, poly) {
  let sum = 0;
  for (const p of pts) sum += G.distToPolyline(p, poly, false);
  return sum / pts.length;
}

/** Nejmenší čtverce – střed a poloměr kružnice. */
function fitCircle(pts) {
  const n = pts.length;
  if (n < 5) return null;
  let sx = 0, sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  const mx = sx / n, my = sy / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of pts) {
    const u = p.x - mx;
    const w = p.y - my;
    suu += u * u;
    svv += w * w;
    suv += u * w;
    suuu += u * u * u;
    svvv += w * w * w;
    suvv += u * w * w;
    svuu += w * u * u;
  }
  const den = 2 * (suu * svv - suv * suv);
  if (Math.abs(den) < 1e-9) return null;
  const uc = (svv * (suuu + suvv) - suv * (svvv + svuu)) / den;
  const vc = (suu * (svvv + svuu) - suv * (suuu + suvv)) / den;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  if (!Number.isFinite(r) || r <= 0) return null;
  return { c: { x: uc + mx, y: vc + my }, r };
}

function circleError(pts, circ) {
  let sum = 0;
  for (const p of pts) sum += Math.abs(G.dist(p, circ.c) - circ.r);
  return sum / pts.length;
}

function fmtDir(angle) {
  const a = G.normAngle180(angle);
  if (a < 1 || a > 179) return 'vodorovná';
  if (Math.abs(a - 90) < 1) return 'svislá';
  if (Math.abs(a - 45) < 1) return '45°';
  if (Math.abs(a - 135) < 1) return '135°';
  return `${Math.round(a)}°`;
}

function fmtAngleShort(a) {
  return `${Math.round(G.normAngle(a) * 10) / 10}°`.replace('.', ',');
}
