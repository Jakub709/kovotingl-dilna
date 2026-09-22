/**
 * Nářezový plán (§16).
 *
 * Rozložení dílů na skladové tyče. Algoritmus je First-Fit Decreasing
 * s pevným řazením, takže stejné zadání vždy dá stejný výsledek (FR-CUT-005).
 * Prořez se počítá mezi sousedními kusy: použito = Σdélek + prořez·(počet−1).
 */
import * as G from './geom.js';
import { deviationOf } from './build.js';
const span = p => p.stockSpan ?? p.length;

/**
 * Mohou dva sousední konce vzniknout jedním společným řezem? (§16.2)
 * Jediný šikmý řez vytvoří u levého kusu delší jednu hranu a u pravého
 * kusu delší hranu protilehlou – proto opačná orientace.
 */
export function sharedMiterCompatible(cutRight, cutLeft) {
  if (!cutRight || !cutLeft) return false;
  const d1 = deviationOf(cutRight);
  const d2 = deviationOf(cutLeft);
  if (Math.abs(d1) < 0.05 || Math.abs(d2) < 0.05) return false;
  if (Math.abs(Math.abs(d1) - Math.abs(d2)) > 0.05) return false;
  return (cutRight.orient || 0) !== 0 && (cutRight.orient || 0) === -(cutLeft.orient || 0);
}

/**
 * Sestaví nářezové plány pro všechny profilové materiály.
 * @param {Project} project
 * @param {Array} parts díly z buildParts()
 * @returns {Array} plány, jeden na materiál
 */
export function buildCutPlans(project, parts) {
  const kerf = Math.max(0, project.settings.kerf ?? 3);
  const useShared = !!project.settings.sharedMiter;

  const groups = new Map();
  for (const p of parts) {
    if (p.kind !== 'profil') continue; // plech ani pletivo se z tyčí neřežou (§10, §9.3)
    if (!p.materialId || !(p.length > 0)) continue;
    if (!groups.has(p.materialId)) groups.set(p.materialId, []);
    groups.get(p.materialId).push(p);
  }

  const plans = [];
  for (const [materialId, list] of groups) {
    plans.push(planForMaterial(project, materialId, list, kerf, useShared));
  }
  // Stabilní pořadí plánů podle názvu materiálu.
  plans.sort((a, b) => a.materialName.localeCompare(b.materialName, 'cs'));
  return plans;
}

function planForMaterial(project, materialId, list, kerf, useShared) {
  const stock = list[0].stockLength || 6000;
  const materialName = list[0].materialName || '';
  const lock = project.cutLocks?.[materialId];

  const overlong = list.filter((p) => span(p) > stock + 1e-6);
  const fitting = list.filter((p) => span(p) <= stock + 1e-6);

  let bars;
  if (lock && lock.locked && Array.isArray(lock.bars)) {
    bars = applyLock(fitting, lock.bars, stock, kerf);
  } else {
    bars = packFFD(fitting, stock, kerf);
  }

  // Díly delší než tyč dostanou vlastní tyč a jsou označené jako chyba (§17).
  for (const p of overlong) {
    bars.push({ pieces: [{ part: p, shared: false }], overlong: true });
  }

  const barsOut = bars.map((bar, i) => finishBar(bar, i, stock, kerf, useShared));
  const totalUsed = barsOut.reduce((s, b) => s + b.used, 0);
  const totalStock = barsOut.length * stock;

  return {
    materialId,
    materialName,
    stockLength: stock,
    kerf,
    bars: barsOut,
    barCount: barsOut.length,
    totalPieces: list.length,
    totalLength: list.reduce((s, p) => s + p.length, 0),
    waste: Math.max(0, totalStock - totalUsed),
    utilization: totalStock > 0 ? totalUsed / totalStock : 0,
    locked: !!(lock && lock.locked),
    hasOverlong: barsOut.some(b => b.overlong),
  };
}

/** Deterministické řazení: delší první, pak podle názvu a klíče. */
function sortForPacking(list) {
  return list.slice().sort((a, b) => {
    if (Math.abs(b.length - a.length) > 1e-6) return b.length - a.length;
    const n = a.name.localeCompare(b.name, 'cs');
    if (n !== 0) return n;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/** First-Fit Decreasing. */
function packFFD(list, stock, kerf) {
  const sorted = sortForPacking(list);
  const bars = [];
  for (const part of sorted) {
    let placed = false;
    for (const bar of bars) {
      if (fitsIn(bar, part, stock, kerf)) {
        bar.pieces.push({ part, shared: false });
        placed = true;
        break;
      }
    }
    if (!placed) bars.push({ pieces: [{ part, shared: false }] });
  }
  return bars;
}

function usedLength(pieces, kerf) {
  if (!pieces.length) return 0;
  const sum = pieces.reduce((s, p) => s + span(p.part), 0);
  return sum + kerf * (pieces.length - 1);
}

function fitsIn(bar, part, stock, kerf) {
  return usedLength([...bar.pieces, { part }], kerf) <= stock + 1e-6;
}

/** Obnoví ruční rozložení; nové díly se doplní, zmizelé se vynechají (FR-CUT-006). */
function applyLock(list, lockedBars, stock, kerf) {
  const byKey = new Map(list.map((p) => [p.key, p]));
  const bars = [];
  const used = new Set();

  for (const keys of lockedBars) {
    const pieces = [];
    for (const k of keys) {
      const p = byKey.get(k);
      if (p && !used.has(k)) {
        pieces.push({ part: p, shared: false });
        used.add(k);
      }
    }
    if (pieces.length) bars.push({ pieces, manual: true });
  }

  // Díly, které v zámku nejsou (např. nově přidané), doplníme FFD.
  const rest = list.filter((p) => !used.has(p.key));
  for (const part of sortForPacking(rest)) {
    let placed = false;
    for (const bar of bars) {
      if (fitsIn(bar, part, stock, kerf)) {
        bar.pieces.push({ part, shared: false });
        placed = true;
        break;
      }
    }
    if (!placed) bars.push({ pieces: [{ part, shared: false }], manual: true });
  }
  return bars;
}

/** Dopočítá pozice, prořezy, zbytek a možnosti společných pokosů. */
function finishBar(bar, index, stock, kerf, useShared) {
  const pieces = [];
  let cursor = 0;

  bar.pieces.forEach((entry, i) => {
    const part = entry.part;
    const prev = i > 0 ? bar.pieces[i - 1].part : null;
    // Společný pokos šetří jeden prořez, ale jen když je výslovně zapnutý (§16.2).
    const canShare = prev ? sharedMiterCompatible(prev.cutR, part.cutL) : false;
    const shared = i > 0 && useShared && canShare;
    const gap = i === 0 ? 0 : kerf;
    cursor += gap;
    pieces.push({
      part,
      key: part.key,
      start: G.round1(cursor),
      end: G.round1(cursor + span(part)),
      length: part.length,
      kerfBefore: gap,
      sharedWithPrev: shared,
      sharedPossible: canShare && !shared,
    });
    cursor += span(part);
  });

  const used = G.round1(cursor);
  return {
    index,
    pieces,
    used,
    stock,
    remainder: G.round1(Math.max(0, stock - used)),
    utilization: stock > 0 ? used / stock : 0,
    manual: !!bar.manual,
    overlong: !!bar.overlong || used > stock + 0.01,
  };
}

/* -------------------------------------------------------- ruční úpravy -- */

/** Uloží současné rozložení jako ruční zámek. */
export function lockPlan(project, plan) {
  project.cutLocks[plan.materialId] = {
    locked: true,
    bars: plan.bars.filter((b) => !b.overlong).map((b) => b.pieces.map((p) => p.key)),
  };
}

export function unlockPlan(project, materialId) {
  delete project.cutLocks[materialId];
}

/**
 * Přesune díl na jinou tyč. Vrací true při úspěchu.
 * Rozložení se tím automaticky uzamkne.
 */
export function movePiece(project, plan, partKey, targetBarIndex) {
  const bars = plan.bars.filter((b) => !b.overlong).map((b) => b.pieces.map((p) => p.key));
  let from = -1;
  let at = -1;
  bars.forEach((keys, bi) => {
    const i = keys.indexOf(partKey);
    if (i >= 0) {
      from = bi;
      at = i;
    }
  });
  if (from < 0) return false;
  while (bars.length <= targetBarIndex) bars.push([]);
  if (targetBarIndex === from) return false;

  const targetKeys = [...bars[targetBarIndex], partKey];
  const byKey = new Map(plan.bars.flatMap(b => b.pieces.map(x => [x.key, x.part])));
  if (targetKeys.reduce((n,k)=>n+span(byKey.get(k)),0) + plan.kerf * (targetKeys.length-1) > plan.stockLength + 0.01) return false;
  bars[from].splice(at, 1);
  bars[targetBarIndex].push(partKey);
  const cleaned = bars.filter((b) => b.length);
  project.cutLocks[plan.materialId] = { locked: true, bars: cleaned };
  return true;
}

/** Posune díl v rámci tyče o jednu pozici. */
export function reorderPiece(project, plan, partKey, delta) {
  const bars = plan.bars.filter((b) => !b.overlong).map((b) => b.pieces.map((p) => p.key));
  for (const keys of bars) {
    const i = keys.indexOf(partKey);
    if (i < 0) continue;
    const j = G.clamp(i + delta, 0, keys.length - 1);
    if (i === j) return false;
    keys.splice(i, 1);
    keys.splice(j, 0, partKey);
    project.cutLocks[plan.materialId] = { locked: true, bars: bars.filter((b) => b.length) };
    return true;
  }
  return false;
}
