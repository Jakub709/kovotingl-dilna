/**
 * Zkoušky výpočetního jádra – akceptační scénáře ze zadání (§22).
 * Běží v Node, bez okna a bez Electronu:
 *
 *   npm test
 */
import { Store } from '../src/core/store.js';
import { makeFrame, makeFill, makeMesh, makePlate, makeHole, makeProfile, makeRef, makeAssembly, frameClearRect } from '../src/core/model.js';
import { fillLayout, outerLength, miterAngleForBend } from '../src/core/build.js';
import { recognize, straightenChain } from '../src/core/recognize.js';
import * as G from '../src/core/geom.js';

let pass = 0, fail = 0;
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
function ok(cond, label, extra = '') {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${extra}`); }
}
function eq(a, b, label, tol = 0.01) { ok(near(a, b, tol), label, `→ ${a} vs ${b}`); }
const H = (t) => console.log(`\n=== ${t}`);

const s = new Store();
const lib = s.library;
const jekl40 = lib.get('m_jekl_40_40_2');
const jekl20 = lib.get('m_jekl_20_20_2');
const plech10 = lib.get('m_plech_10_mm');
const L50 = lib.get('m_l_50_50_4');
console.log('materiály:', !!jekl40, !!jekl20, !!plech10, !!L50);

/* ─────────────────────────── A1 – jednoduchý rám s pokosem 45° ───── */
H('A1 – rám 900 × 1000, Jekl 40×40×2, pokos 45°');
const frame = makeFrame({ x: 0, y: 0, w: 900, h: 1000, materialId: jekl40.id, cornerMode: 'miter' });
s.commit('rám', (p) => { p.useMaterial(jekl40); p.add(frame); });

let parts = s.derived.parts;
ok(parts.length === 4, `vzniknou 4 díly (${parts.length})`);
const byName = (frag) => parts.find((p) => p.name.includes(frag));
eq(byName('levý svislý').length, 1000, 'levý svislý = 1000 mm (vnější hrana)');
eq(byName('pravý svislý').length, 1000, 'pravý svislý = 1000 mm');
eq(byName('horní').length, 900, 'horní = 900 mm');
eq(byName('spodní').length, 900, 'spodní = 900 mm');
ok(parts.every((p) => p.cutL.angle === 45 && p.cutR.angle === 45), 'všechny konce 45°');
ok(parts.every((p) => p.cutL.orient === -1 && p.cutR.orient === -1), 'shodná orientace pokosu (vnější hrana delší)');
const bom1 = s.derived.bom;
ok(bom1.length === 2, `kusovník sloučí shodné díly na 2 řádky (${bom1.length})`);
ok(bom1.every((r) => r.count === 2), 'každý řádek 2 ks');
ok(bom1.some((r) => r.name === 'R1, R2 – svislý rám'), `sloučený název: ${bom1.map(r=>r.name).join(' | ')}`);

/* kontrola vnější hrany výpočtem */
eq(outerLength(860, 40, { angle: 45 }, { angle: 45 }), 900, 'vzorec vnější délky: 860 + 20 + 20 = 900');

H('A1b – rovný spoj, vodorovné vložené');
s.commit('mode', (p) => { p.byId(frame.id).cornerMode = 'insertH'; });
parts = s.derived.parts;
eq(byName('levý svislý').length, 1000, 'svislice průběžné = 1000 mm');
eq(byName('horní').length, 820, 'vodorovné vsazené = 900 − 2×40 = 820 mm');
ok(parts.every((p) => p.cutL.angle === 90 && p.cutR.angle === 90), 'všechny řezy 90°');

H('A1c – rovný spoj, vodorovné průběžné');
s.commit('mode', (p) => { p.byId(frame.id).cornerMode = 'throughH'; });
parts = s.derived.parts;
eq(byName('horní').length, 900, 'vodorovné průběžné = 900 mm');
eq(byName('levý svislý').length, 920, 'svislice vsazené = 1000 − 2×40 = 920 mm');

s.commit('zpět na pokos', (p) => { p.byId(frame.id).cornerMode = 'miter'; });

/* ────────────────────────────── A2 – branka s výplní ────────────── */
H('A2 – 7 svislých výplní Jekl 20×20×2');
const fill = makeFill({ frameId: frame.id, dir: 'v', mode: 'count', count: 7, materialId: jekl20.id });
s.commit('výplň', (p) => { p.useMaterial(jekl20); p.add(fill); });
const fillParts = s.derived.parts.filter((p) => p.objectId === fill.id);
ok(fillParts.length === 7, `7 dílů výplně (${fillParts.length})`);
const clear = frameClearRect(s.project, frame, lib);
eq(clear.w, 820, 'světlost šířka 820');
eq(clear.h, 920, 'světlost výška 920');
eq(fillParts[0].length, 920, 'délka výplně = světlost rámu 920 mm');
const lay = fillLayout(820, 20, { mode: 'count', count: 7 });
eq(lay.gap, 85, 'mezera = (820 − 7×20) / 8 = 85 mm');
eq(lay.edge, 85, 'krajní mezera stejná jako vnitřní');
// osy výplní musí být symetrické kolem středu světlosti
const xs = fillParts.map((p) => p.axis.a.x);
eq((xs[0] + xs[6]) / 2, clear.x + clear.w / 2, 'rozmístění symetrické');
ok(s.derived.bom.length === 3, `kusovník: 2 řádky rámu + 1 řádek výplně (${s.derived.bom.length})`);
ok(s.derived.bom.find((r) => r.materialId === jekl20.id).count === 7, 'výplň má počet 7');

H('A2b – zadání maximální mezerou');
const lay2 = fillLayout(820, 20, { mode: 'gap', maxGap: 100 });
ok(lay2.gap <= 100, `mezera ${lay2.gap} ≤ 100`);
{ const l = fillLayout(820, 20, { mode: 'gap', maxGap: 100 });
  ok(l.count === 6, `z max. mezery 100 vyjde 6 kusů (${l.count}), mezera přesně ${l.gap}`);
  ok(fillLayout(820, 20, { mode: 'gap', maxGap: 99 }).count === 7, 'z max. mezery 99 vyjde 7 kusů'); }

/* ───────────────────────────────── A9 – kolize a chyby ──────────── */
H('A9 – neblokující varování');
s.commit('posun výplně do rámu', (p) => { p.byId(fill.id).overrides = { 0: { offset: -90 } }; });
const coll = s.derived.issues.filter((i) => i.code === 'COLLISION');
ok(coll.length > 0, 'kolize výplně s rámem je nahlášena');
ok(coll[0].severity === 'warn', 'kolize je varování, ne blokující chyba');
s.commit('zpět', (p) => { p.byId(fill.id).overrides = {}; });

H('Výplň se nevejde');
s.commit('moc výplní', (p) => { p.byId(fill.id).count = 60; });
ok(s.derived.issues.some((i) => i.code === 'FILL_NO_FIT'), '60 výplní do 820 mm se nevejde');
s.commit('zpět', (p) => { p.byId(fill.id).count = 7; });

/* ──────────────────────────────────── A3 – pletivo ──────────────── */
H('A3 – pletivo místo profilové výplně');
const pletivo = lib.meshes()[0];
const mesh = makeMesh({ frameId: frame.id, materialId: pletivo.id });
s.commit('pletivo', (p) => { p.useMaterial(pletivo); p.remove(fill.id); p.add(mesh); });
const meshParts = s.derived.parts.filter((p) => p.kind === 'pletivo');
ok(meshParts.length === 1, 'pletivo je jeden rozměrový díl');
eq(meshParts[0].width, 820, 'šířka pletiva = světlost 820');
eq(meshParts[0].height, 920, 'výška pletiva = světlost 920');
ok(s.derived.parts.filter((p) => p.objectId === fill.id).length === 0, 'profilové výplně zmizely');
ok(!s.derived.plans.some((pl) => pl.materialId === pletivo.id), 'pletivo nemá nářezový plán');

/* ──────────────────────────────────── A4 – patka ────────────────── */
H('A4 – patka 120 × 120 × 6 se 4 otvory Ø14');
const patka = makePlate({
  points: G.rectPoints(0, -300, 120, 120), thickness: 6, materialId: lib.get('m_plech_6_mm').id, plateKind: 'patka',
  holes: [[25, 25], [95, 25], [25, 95], [95, 95]].map(([dx, dy]) => makeHole({ kind: 'circle', d: 14, cx: dx, cy: -300 + dy })),
});
s.commit('patka', (p) => { p.useMaterial(lib.get('m_plech_6_mm')); p.add(patka); });
const pp = s.derived.parts.find((p) => p.kind === 'plech');
eq(pp.width, 120, 'šířka patky 120');
eq(pp.height, 120, 'výška patky 120');
eq(pp.thickness, 6, 'tloušťka 6');
ok(pp.holes.length === 4, '4 otvory');
ok(!s.derived.plans.some((pl) => pl.materialId === pp.materialId), 'plech nemá nářez z tyčí');

H('Otvor mimo plech');
s.commit('vyhodit otvor ven', (p) => { p.byId(patka.id).holes[0].cx = 300; });
ok(s.derived.issues.some((i) => i.code === 'HOLE_OUTSIDE'), 'otvor mimo plech nahlášen');
s.commit('zpět', (p) => { p.byId(patka.id).holes[0].cx = 25; });

/* ─────────────────────────────── A5 – samostatný L profil ───────── */
H('A5 – samostatný L 50×50×4, délka 1000 mm');
const lprof = makeProfile({ points: [G.v(1200, 0), G.v(1200, 1000)], materialId: L50.id, bend: 'cut' });
s.commit('L profil', (p) => { p.useMaterial(L50); p.add(lprof); });
const lp = s.derived.parts.find((p) => p.objectId === lprof.id);
eq(lp.length, 1000, 'délka L profilu 1000 mm');
ok(lp.cutL.angle === 90 && lp.cutR.angle === 90, 'oba konce rovné 90°');

/* ─────────────────────────────────────── A7 – tvar Z ───────────── */
H('A7 – Z profil 30 / 67° / 100 / 67° / 30');
const zpts = [G.v(0, 2000)];
{
  const segs = [{ length: 30, angle: 0 }, { length: 100, angle: -67 }, { length: 30, angle: 0 }];
  let cur = zpts[0];
  for (const sg of segs) {
    cur = { x: cur.x + Math.cos(sg.angle * G.RAD) * sg.length, y: cur.y + Math.sin(sg.angle * G.RAD) * sg.length };
    zpts.push(cur);
  }
}
const zprof = makeProfile({ points: zpts, materialId: jekl20.id, bend: 'bent' });
s.commit('Z', (p) => p.add(zprof));
const zp = s.derived.parts.filter((p) => p.objectId === zprof.id);
ok(zp.length === 1, 'ohýbaný Z je v kusovníku jeden díl');
eq(zp[0].length, 160, 'rozvinutá délka 30 + 100 + 30 = 160 mm');
ok(zp[0].bendGeometry && zp[0].bendGeometry.segments.join('/') === '30/100/30', 'geometrie ohybů 30/100/30');
eq(Math.abs(zp[0].bendGeometry.bends[0]), 67, 'první lom 67°');
eq(Math.abs(zp[0].bendGeometry.bends[1]), 67, 'druhý lom 67°');

H('A7b – Z skládaný z více kusů');
s.commit('cut', (p) => { p.byId(zprof.id).bend = 'cut'; });
const zc = s.derived.parts.filter((p) => p.objectId === zprof.id);
ok(zc.length === 3, `3 samostatné úseky (${zc.length})`);
eq(zc[0].cutR.angle, miterAngleForBend(67), 'pokos v lomu = 90 − 67/2 = 56,5°');
eq(miterAngleForBend(90), 45, 'roh 90° → pokos 45°');
s.commit('zpět', (p) => { p.byId(zprof.id).bend = 'bent'; });

/* ──────────────────────────────── A6 – okolí do kusovníku nejde ── */
H('A6 – okolí / zeď');
const before = s.derived.parts.length;
s.commit('zeď', (p) => p.add(makeRef({ points: [G.v(-200, 0), G.v(-200, 1200), G.v(-140, 1400)] })));
ok(s.derived.parts.length === before, 'okolí nepřidalo žádný díl do kusovníku');
ok(!s.derived.plans.some((pl) => pl.bars.some((b) => b.pieces.some((x) => x.part.objectId))) === false, 'nářez existuje');

/* ────────────────────────────────────── A11 – nářezový plán ────── */
H('A11 – nářez do 6m tyčí s prořezem 3 mm');
s.commit('vrátit výplň', (p) => { p.remove(mesh.id); p.add(makeFill({ frameId: frame.id, dir: 'v', count: 7, materialId: jekl20.id })); });
const plans = s.derived.plans;
ok(plans.length >= 2, `plány pro ${plans.length} materiály`);
const p40 = plans.find((p) => p.materialId === jekl40.id);
eq(p40.stockLength, 6000, 'skladová tyč 6000 mm');
eq(p40.kerf, 3, 'prořez 3 mm');
// 2×1000 + 2×900 = 3800 + 3 prořezy = 3809 → jedna tyč
ok(p40.barCount === 1, `rám se vejde na 1 tyč (${p40.barCount})`);
eq(p40.bars[0].used, 3809, 'využito 3800 + 3×3 prořez = 3809 mm');
eq(p40.bars[0].remainder, 2191, 'zbytek 2191 mm');
const seq = p40.bars[0].pieces.map((x) => x.length);
ok(seq.join(',') === '1000,1000,900,900', `pořadí od nejdelšího: ${seq.join(',')}`);

const p20 = plans.find((p) => p.materialId === jekl20.id);
// 7 × 920 = 6440 → nevejde se na jednu tyč
ok(p20.barCount === 2, `7 výplní po 920 mm → 2 tyče (${p20.barCount})`);
eq(p20.bars[0].used, 6 * 920 + 5 * 3 + 3 + 160, 'první tyč: 6 výplní + prořezy + doplněný Z profil 160 mm');
ok(p20.bars[0].used <= 6000, 'první tyč nepřesáhla skladovou délku');

H('Determinismus (FR-CUT-005)');
const snap1 = JSON.stringify(s.derived.plans.map((p) => p.bars.map((b) => b.pieces.map((x) => x.key))));
s.recompute();
const snap2 = JSON.stringify(s.derived.plans.map((p) => p.bars.map((b) => b.pieces.map((x) => x.key))));
ok(snap1 === snap2, 'opakovaný výpočet dá stejné rozložení');

H('Díl delší než tyč');
s.commit('dlouhý profil', (p) => p.add(makeProfile({ points: [G.v(0, 5000), G.v(7000, 5000)], materialId: jekl40.id })));
ok(s.derived.issues.some((i) => i.code === 'TOO_LONG'), 'díl 7000 mm > tyč 6000 mm nahlášen');

/* ───────────────────────────── A10 – uložení a načtení ─────────── */
H('A10 – uložení a znovuotevření projektu');
const json = JSON.stringify(s.project.toJSON());
const before10 = JSON.stringify(s.derived.bom.map((r) => [r.name, r.length, r.count, r.cutL.angle, r.cutR.angle]));
const s2 = new Store();
s2.library = lib;
const { Project } = await import('../src/core/model.js');
s2.setProject(Project.fromJSON(json), null);
const after10 = JSON.stringify(s2.derived.bom.map((r) => [r.name, r.length, r.count, r.cutL.angle, r.cutR.angle]));
ok(before10 === after10, 'kusovník je po znovunačtení totožný');
ok(JSON.stringify(s2.derived.plans.map((p) => p.barCount)) === JSON.stringify(s.derived.plans.map((p) => p.barCount)),
  'nářez je po znovunačtení totožný');
ok(Object.keys(s2.project.materials).length > 0, 'snapshot materiálů uložen v projektu');

H('Zpět / Znovu');
const n0 = s.project.objects.length;
s.commit('test', (p) => p.add(makeFrame({ x: 5000, y: 0, w: 100, h: 100 })));
ok(s.project.objects.length === n0 + 1, 'přidáno');
s.undo();
ok(s.project.objects.length === n0, 'zpět funguje');
s.redo();
ok(s.project.objects.length === n0 + 1, 'znovu funguje');
s.undo();

/* ──────────────────────────────── rozpoznávání náčrtu ──────────── */
H('Rozpoznání náčrtu (§6.1)');
const jitter = (x, y) => ({ x: x + (Math.sin(x * 12.9898 + y * 78.233) * 6), y: y + (Math.cos(x * 4.1414 + y * 21.31) * 6) });
const rectStroke = [];
for (let i = 0; i <= 20; i++) rectStroke.push(jitter(i * 40, 0));
for (let i = 0; i <= 15; i++) rectStroke.push(jitter(800, i * 40));
for (let i = 20; i >= 0; i--) rectStroke.push(jitter(i * 40, 600));
for (let i = 15; i >= 0; i--) rectStroke.push(jitter(0, i * 40));
const rres = recognize(rectStroke, { gridStep: 10 });
ok(rres.candidates[0].kind === 'rect', `obdélník rozpoznán (${rres.candidates[0].kind}, shoda ${Math.round(rres.candidates[0].confidence * 100)} %)`);
eq(rres.candidates[0].data.w, 810, 'šířka narovnána na krok mřížky', 30);

const lineStroke = [];
for (let i = 0; i <= 30; i++) lineStroke.push({ x: i * 20, y: i * 0.6 + Math.sin(i) * 2 });
const lres = recognize(lineStroke, { gridStep: 10 });
ok(lres.candidates[0].kind === 'line', 'čára rozpoznána');
eq(lres.candidates[0].data.angle, 0, 'téměř vodorovná čára narovnána na 0°');

const zStroke = [];
for (let i = 0; i <= 6; i++) zStroke.push({ x: i * 5, y: 0 });
for (let i = 1; i <= 20; i++) zStroke.push({ x: 30 + i * (100 * Math.cos(-67 * G.RAD)) / 20, y: i * (100 * Math.sin(-67 * G.RAD)) / 20 });
for (let i = 1; i <= 6; i++) zStroke.push({ x: 30 + 100 * Math.cos(-67 * G.RAD) + i * 5, y: 100 * Math.sin(-67 * G.RAD) });
const zres = recognize(zStroke, { gridStep: 5 });
ok(zres.candidates.some((c) => c.kind === 'polyline'), 'lomený tvar mezi nabídnutými variantami');
const zc2 = zres.candidates.find((c) => c.kind === 'polyline');
ok(zc2.data.segments.length === 3, `3 úseky (${zc2.data.segments.length})`);

/* ────────────────────────────────── jednotky ────────────────────── */
H('Jednotky (§20)');
const { parseLength, parseAngle } = await import('../src/core/units.js');
eq(parseLength('900'), 900, '900 → 900 mm');
eq(parseLength('90 cm'), 900, '90 cm → 900 mm');
eq(parseLength('1,2 m'), 1200, '1,2 m → 1200 mm');
eq(parseLength('1.5m'), 1500, '1.5m → 1500 mm');
ok(parseLength('nesmysl') === null, 'nesrozumitelný vstup vrátí null');
eq(parseAngle('45°'), 45, '45° → 45');
eq(parseAngle('56,5'), 56.5, '56,5 → 56.5');



/* ─────────────────────────────── nářez: ruční úpravy a sdílený pokos ── */
H('FR-CUT-006 – ruční přesun a zámek');
{
  const { movePiece, lockPlan, unlockPlan, sharedMiterCompatible } = await import('../src/core/cutplan.js');
  const st = new Store();
  const m = st.library.get('m_jekl_40_40_2');
  st.commit('rám', (p) => { p.useMaterial(m); p.add(makeFrame({ x:0,y:0,w:900,h:1000, materialId:m.id })); });
  let plan = st.derived.plans[0];
  ok(plan.barCount === 1, 'na začátku jedna tyč');
  const key = plan.bars[0].pieces[1].key;
  st.commit('přesun', () => movePiece(st.project, plan, key, 1));
  plan = st.derived.plans[0];
  ok(plan.barCount === 2, `po přesunu dvě tyče (${plan.barCount})`);
  ok(plan.locked, 'rozložení je uzamčené');
  ok(plan.bars[1].pieces.some((x) => x.key === key), 'díl je na druhé tyči');
  st.commit('odemknout', (p) => unlockPlan(p, plan.materialId));
  ok(st.derived.plans[0].barCount === 1, 'po odemknutí zpět na jednu tyč');

  // Sdílený pokos: kompatibilní jsou jen opačně skloněné konce se stejným úhlem
  ok(sharedMiterCompatible({ angle:45, orient:1 }, { angle:45, orient:-1 }), 'opačný sklon = lze sdílet');
  ok(!sharedMiterCompatible({ angle:45, orient:-1 }, { angle:45, orient:-1 }), 'stejný sklon = nelze sdílet');
  ok(!sharedMiterCompatible({ angle:90, orient:0 }, { angle:90, orient:0 }), 'rovné řezy se nesdílejí');
  ok(!sharedMiterCompatible({ angle:45, orient:1 }, { angle:30, orient:-1 }), 'různý úhel = nelze sdílet');

  // Pokosový rám sdílení nenabízí (všechny konce mají stejnou orientaci)
  const shared = st.derived.plans[0].bars[0].pieces.filter((x) => x.sharedPossible);
  ok(shared.length === 0, 'u pokosového rámu se sdílený řez nenabízí');
}

H('Pozice kusovníku jdou po sobě');
{
  const st = new Store();
  const j40 = st.library.get('m_jekl_40_40_2'), j20 = st.library.get('m_jekl_20_20_2');
  const f = makeFrame({ x:0,y:0,w:900,h:1000, materialId:j40.id });
  st.commit('x', (p) => {
    p.useMaterial(j40); p.useMaterial(j20);
    p.add(f);
    p.add(makeFill({ frameId:f.id, count:5, materialId:j20.id }));
    p.add(makeProfile({ points:[G.v(2000,0), G.v(2000,500)], materialId:j40.id }));
  });
  const pos = st.derived.bom.map((r) => r.pos);
  ok(JSON.stringify(pos) === JSON.stringify(pos.map((_, i) => i + 1)), `pozice 1..n (${pos.join(',')})`);
  const mats = st.derived.bom.map((r) => r.materialName);
  const firstIdx = mats.map((m2) => mats.indexOf(m2));
  ok(firstIdx.every((v, i) => i === 0 || v <= firstIdx[i - 1] || v === i), `stejný materiál je pohromadě (${mats.join(' | ')})`);
}

console.log(`\n══════════════════════════════\nVÝSLEDEK: ${pass} v pořádku, ${fail} chyb\n`);
process.exit(fail ? 1 : 0);
