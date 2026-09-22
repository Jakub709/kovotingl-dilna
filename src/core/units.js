/**
 * Jednotky. Interně vždy milimetry a stupně (§20).
 * Uživatel může psát "90 cm", "1,2 m", "900" – vše se převede na mm.
 */

const FACTORS = { mm: 1, cm: 10, dm: 100, m: 1000 };

/**
 * Rozparsuje délkový vstup na milimetry.
 * @returns {number|null} null když je vstup nesrozumitelný
 */
export function parseLength(input, fallback = null) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : fallback;
  if (input == null) return fallback;
  let s = String(input).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return fallback;
  s = s.replace(',', '.');

  // jednoduché sčítání/odčítání: "900+2*40" nepodporujeme, ale "900-12" ano
  const m = s.match(/^(-?\d*\.?\d+)(mm|cm|dm|m)?$/);
  if (m) {
    const v = parseFloat(m[1]);
    if (!Number.isFinite(v)) return fallback;
    return round(v * (FACTORS[m[2] || 'mm'] ?? 1), 4);
  }

  const sum = s.match(/^(-?\d*\.?\d+)(mm|cm|dm|m)?([+-]\d*\.?\d+)(mm|cm|dm|m)?$/);
  if (sum) {
    const a = parseFloat(sum[1]) * (FACTORS[sum[2] || 'mm'] ?? 1);
    const b = parseFloat(sum[3]) * (FACTORS[sum[4] || sum[2] || 'mm'] ?? 1);
    return round(a + b, 4);
  }
  return fallback;
}

/** Rozparsuje úhel ve stupních ("45", "45°", "44,5 st"). */
export function parseAngle(input, fallback = null) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : fallback;
  if (input == null) return fallback;
  const s = String(input).trim().replace(',', '.').replace(/[°\s]|st|deg/gi, '');
  if (!s) return fallback;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : fallback;
}

export function parseCount(input, fallback = null) {
  const v = parseInt(String(input ?? '').replace(/\D+/g, ''), 10);
  return Number.isFinite(v) ? v : fallback;
}

export function round(v, decimals = 1) {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

/** Délka pro zobrazení – celé mm bez zbytečných desetinných míst. */
export function fmtLen(mm, decimals = 0) {
  if (mm == null || !Number.isFinite(mm)) return '–';
  const r = round(mm, decimals);
  return decimals > 0 ? String(r).replace('.', ',') : String(Math.round(r));
}

export function fmtLenUnit(mm, decimals = 0) {
  return fmtLen(mm, decimals) + ' mm';
}

/** Úhel pro zobrazení: 45°, 34,6° */
export function fmtAngle(deg, decimals = 1) {
  if (deg == null || !Number.isFinite(deg)) return '–';
  const r = round(deg, decimals);
  const s = Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
  return s + '°';
}

export function fmtPercent(ratio, decimals = 1) {
  return String(round(ratio * 100, decimals)).replace('.', ',') + ' %';
}

/** Datum pro hlavičky výstupů. */
export function fmtDate(d = new Date()) {
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

export function fmtDateTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${fmtDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
