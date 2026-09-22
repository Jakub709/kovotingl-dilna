/**
 * Základní 2D geometrie v modelových souřadnicích (mm, osa Y nahoru).
 */

export const EPS = 1e-6;
export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;

export const v = (x, y) => ({ x, y });
export const add = (a, b) => v(a.x + b.x, a.y + b.y);
export const sub = (a, b) => v(a.x - b.x, a.y - b.y);
export const mul = (a, s) => v(a.x * s, a.y * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const mid = (a, b) => v((a.x + b.x) / 2, (a.y + b.y) / 2);
export const clone = (a) => v(a.x, a.y);

export function norm(a) {
  const l = len(a);
  return l < EPS ? v(0, 0) : v(a.x / l, a.y / l);
}
/** Levá normála (otočení o +90°). */
export const perp = (a) => v(-a.y, a.x);

export function rotate(p, deg, about = v(0, 0)) {
  const r = deg * RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const d = sub(p, about);
  return v(about.x + d.x * c - d.y * s, about.y + d.x * s + d.y * c);
}

/** Úhel vektoru ve stupních, 0° = +X, proti směru hodinových ručiček. */
export const angleOf = (a) => Math.atan2(a.y, a.x) * DEG;

/** Normalizuje úhel do intervalu (-180, 180]. */
export function normAngle(deg) {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

/** Normalizuje úhel do intervalu [0, 180) – pro směr přímky bez orientace. */
export function normAngle180(deg) {
  let a = deg % 180;
  if (a < 0) a += 180;
  return a;
}

/** Nejmenší rozdíl dvou úhlů ve stupních. */
export function angleDiff(a, b) {
  return Math.abs(normAngle(a - b));
}

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Zaokrouhlení na jedno desetinné místo – potlačuje šum z výpočtů. */
export function round1(x) {
  return Math.round(x * 10) / 10;
}

export function round3(x) {
  return Math.round(x * 1000) / 1000;
}

/* ------------------------------------------------------------ obálky ----- */

export function bboxOf(points) {
  if (!points || !points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function bboxUnion(a, b) {
  if (!a) return b;
  if (!b) return a;
  const minX = Math.min(a.minX, b.minX);
  const minY = Math.min(a.minY, b.minY);
  const maxX = Math.max(a.maxX, b.maxX);
  const maxY = Math.max(a.maxY, b.maxY);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function bboxExpand(b, m) {
  if (!b) return null;
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m, w: b.w + 2 * m, h: b.h + 2 * m };
}

export function bboxContains(b, p) {
  return b && p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

export function bboxOverlap(a, b) {
  if (!a || !b) return false;
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}

/** Průnik dvou obdélníků, nebo null. */
export function bboxIntersection(a, b) {
  if (!bboxOverlap(a, b)) return null;
  const minX = Math.max(a.minX, b.minX);
  const minY = Math.max(a.minY, b.minY);
  const maxX = Math.min(a.maxX, b.maxX);
  const maxY = Math.min(a.maxY, b.maxY);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function rectPoints(x, y, w, h) {
  return [v(x, y), v(x + w, y), v(x + w, y + h), v(x, y + h)];
}

export function bboxToRect(b) {
  return { x: b.minX, y: b.minY, w: b.w, h: b.h };
}

/* ------------------------------------------------------- vzdálenosti ----- */

/** Nejbližší bod na úsečce ab k bodu p. */
export function closestOnSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return { point: clone(a), t: 0 };
  let t = dot(sub(p, a), ab) / l2;
  t = clamp(t, 0, 1);
  return { point: add(a, mul(ab, t)), t };
}

export function distToSegment(p, a, b) {
  return dist(p, closestOnSegment(p, a, b).point);
}

export function distToPolyline(p, pts, closed = false) {
  let best = Infinity;
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const d = distToSegment(p, pts[i], pts[(i + 1) % n]);
    if (d < best) best = d;
  }
  return best;
}

/** Průsečík dvou přímek (ne úseček). null = rovnoběžné. */
export function lineIntersect(p1, d1, p2, d2) {
  const den = cross(d1, d2);
  if (Math.abs(den) < EPS) return null;
  const t = cross(sub(p2, p1), d2) / den;
  return add(p1, mul(d1, t));
}

/** Průsečík dvou úseček včetně mezí, nebo null. */
export function segIntersect(a1, a2, b1, b2) {
  const d1 = sub(a2, a1);
  const d2 = sub(b2, b1);
  const den = cross(d1, d2);
  if (Math.abs(den) < EPS) return null;
  const t = cross(sub(b1, a1), d2) / den;
  const u = cross(sub(b1, a1), d1) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return add(a1, mul(d1, t));
}

/** Je bod uvnitř mnohoúhelníku (ray casting)? */
export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += cross(poly[j], poly[i]);
  return s / 2;
}

export function polylineLength(pts, closed = false) {
  let s = 0;
  const last = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < last; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}

/** Zajistí proti směru hodinových ručiček (kladná plocha). */
export function ensureCCW(poly) {
  return polygonArea(poly) < 0 ? poly.slice().reverse() : poly.slice();
}

/* ------------------------------------------------------- zjednodušení ---- */

/** Ramer–Douglas–Peucker – redukce bodů volného náčrtu. */
export function simplify(points, tolerance) {
  if (points.length <= 2) return points.slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(points[i], points[s], points[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tolerance && idx > 0) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Odstraní body blíž než minDist (šum z myši). */
export function dedupe(points, minDist = 0.5) {
  const out = [];
  for (const p of points) {
    if (!out.length || dist(out[out.length - 1], p) >= minDist) out.push(p);
  }
  if (out.length < 2 && points.length) out.push(points[points.length - 1]);
  return out;
}

/** Celková délka stopy. */
export function pathLength(points) {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += dist(points[i - 1], points[i]);
  return s;
}
