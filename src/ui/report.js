import {spatialObjects} from '../core/spatial-plates.js';
import {spatialEnvelope} from '../core/spatial-collisions.js';
import {plateDetail} from './spatial-solids.js';
/**
 * Tisk a export do PDF (§19).
 *
 * Sestaví samostatný HTML dokument, který hlavní proces vykreslí do PDF
 * nebo pošle na tiskárnu. Tisk i PDF tak používají shodnou grafiku.
 */
import { fmtLen, fmtAngle, fmtDate, fmtPercent } from '../core/units.js';
import { barSVG, cutGlyph, pieceDetailSVG, cutLegendHTML } from './cutdraw.js';
import { materialSummary } from '../core/build.js';
import { dimensionText, noteText } from './bom.js';
import { Renderer, View } from './render2d.js';
import * as G from '../core/geom.js';
import { objectBBox } from '../core/model.js';
import {members3,endpoints3} from '../core/spatial.js';
import {fabricationDetail} from './spatial-workshop.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Vykreslí 2D výkres do obrázku pro tisk.
 *
 * Renderer sází texty v logických jednotkách, proto kreslíme v rozměru
 * blízkém tiskové ploše a rozlišení zvýšíme až násobičem `scale`. Kdyby se
 * kreslilo rovnou ve velkém rozlišení, kóty by po zmenšení na A4 byly drobné.
 *
 * @returns {string} data URL (PNG)
 */
export function renderDrawingImage(store, logicalW = 1300, logicalH = 620, scale = 2.4) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(logicalW * scale);
  canvas.height = Math.round(logicalH * scale);

  const view = new View();
  const renderer = new Renderer(canvas, view);
  renderer.dpr = scale;
  renderer.w = logicalW;
  renderer.h = logicalH;

  let bb = null;
  for (const o of store.project.objects) {
    const b = objectBBox(store.project, o, store.library);
    if (b) bb = G.bboxUnion(bb, b);
  }
  if (bb) view.fit(bb, logicalW, logicalH, 110);

  // Do výkresu patří kóty, ne mřížka ani zvýraznění výběru.
  const savedSel = new Set(store.selection);
  const savedHi = store.highlightPart;
  const s = store.project.settings;
  const saved = { dims: s.showDims, grid: s.showGrid };
  store.selection.clear();
  store.highlightPart = null;
  s.showDims = true;
  s.showGrid = false;

  renderer.draw(store, {});

  s.showDims = saved.dims;
  s.showGrid = saved.grid;
  for (const id of savedSel) store.selection.add(id);
  store.highlightPart = savedHi;

  return canvas.toDataURL('image/png');
}

/* ─────────────────────────────────────────────────────── dokument ──── */

const CSS = `
@page { size: A4 landscape; margin: 10mm 10mm 12mm; }
* { box-sizing: border-box; }
body {
  font-family: "Segoe UI", Tahoma, sans-serif; font-size: 9.5pt; color: #1c2530;
  margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.sheet { page-break-after: always; }
.sheet:last-child { page-break-after: auto; }
.hdr {
  display: flex; justify-content: space-between; align-items: flex-end;
  border-bottom: 1.6pt solid #1c2530; padding-bottom: 4pt; margin-bottom: 8pt;
}
.hdr h1 { font-size: 15pt; margin: 0; }
.hdr .meta { text-align: right; font-size: 8.5pt; color: #5d6b7a; line-height: 1.5; }
h2 { font-size: 11.5pt; margin: 10pt 0 5pt; border-bottom: .8pt solid #c3ccd6; padding-bottom: 2pt; }
.drawing { width: 100%; border: .8pt solid #c3ccd6; }
.drawing img { width: 100%; max-height: 145mm; object-fit: contain; display: block; }
table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
th, td { border: .6pt solid #c3ccd6; padding: 2.6pt 4pt; text-align: left; }
th { background: #eef1f5; font-weight: 600; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tr.grp td { background: #f4f6f9; font-weight: 600; }
tfoot td { background: #eef1f5; font-weight: 600; }
.bar { display: flex; align-items: center; gap: 6pt; margin-bottom: 5pt; page-break-inside: avoid; }
.bar .lbl { width: 74pt; flex: none; font-size: 8pt; line-height: 1.3; }
.bar .svg { flex: 1; height: 52pt; }
.bar .svg svg { width: 100%; height: 100%; }
.bar .u { width: 30pt; flex: none; text-align: right; font-size: 8pt; }
.matblock { margin-bottom: 10pt; page-break-inside: avoid; }
.matblock .title { font-weight: 600; font-size: 10pt; margin-bottom: 1pt; }
.matblock .sub { color: #5d6b7a; font-size: 8.5pt; margin-bottom: 5pt; }
.legend { display: flex; gap: 14pt; flex-wrap: wrap; font-size: 8pt; color: #5d6b7a;
  border-top: .6pt solid #c3ccd6; padding-top: 4pt; margin-top: 6pt; }
.legend span { display: inline-flex; align-items: center; gap: 3pt; }
.pieces { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5pt; margin-top: 6pt; }
.piece { border: .6pt solid #c3ccd6; padding: 3pt 4pt; page-break-inside: avoid; }
.piece b { font-size: 8.5pt; display: block; }
.piece small { color: #5d6b7a; font-size: 7.5pt; }
.piece svg { width: 100%; height: 44pt; }
.note { font-size: 8pt; color: #5d6b7a; margin-top: 5pt; line-height: 1.5; }
.warnbox { border: .8pt solid #e0b48a; background: #fdf6ea; padding: 5pt 7pt; margin: 6pt 0; font-size: 8.5pt; }
.warnbox b { color: #8a5a12; }
.errbox { border-color: #e2b0aa; background: #fdeeec; }
.errbox b { color: #9c3125; }
`;

function header(project, subtitle) {
  return `<div class="hdr">
    <div><h1>${esc(project.name || 'Projekt')}</h1>
      <div style="font-size:9pt;color:#5d6b7a">${esc(subtitle)}</div></div>
    <div class="meta">
      ${project.customer ? esc(project.customer) + '<br>' : ''}
      KovoTingl CAD · ${esc(fmtDate())}
    </div>
  </div>`;
}

/* ── výkres ── */

function drawingSheet(store, img) {
  const p = store.project;
  return `<div class="sheet">
    ${header(p, 'Výkres konstrukce')}
    <div class="drawing"><img src="${img}" alt="Výkres"></div>
    ${p.note ? `<div class="note"><b>Poznámka:</b> ${esc(p.note)}</div>` : ''}
    <div class="note">Rozměry v milimetrech. Okolí a referenční geometrie jsou kresleny čárkovaně
      a nevstupují do kusovníku.</div>
  </div>`;
}

/* ── kusovník ── */

function bomSheet(store) {
  const p = store.project;
  const rows = store.derived.bom;
  const groups = new Map();
  for (const r of rows) {
    const k = r.materialId || '__none__';
    if (!groups.has(k)) groups.set(k, { name: r.materialName || 'Bez materiálu', rows: [] });
    groups.get(k).rows.push(r);
  }

  let totalPieces = 0;
  let totalLength = 0;
  const body = [];
  for (const [, g] of groups) {
    body.push(`<tr class="grp"><td colspan="9">${esc(g.name)}</td></tr>`);
    for (const r of g.rows) {
      totalPieces += r.count;
      if (r.kind === 'profil') totalLength += (r.length || 0) * r.count;
      body.push(`<tr>
        <td class="num">${r.pos}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.assemblyName || '–')}</td>
        <td>${esc(r.materialName || '–')}</td>
        <td class="num">${dimensionText(r)}</td>
        <td class="num">${r.count}</td>
        <td>${r.productionReady===false?'Neurčeno':r.axis3d?'3D · viz detail':r.kind === 'profil' ? cutGlyph(r.cutL, 'left') + ' ' + fmtAngle(r.cutL.angle, 1) : '–'}</td>
        <td>${r.productionReady===false?'Neurčeno':r.axis3d?'3D · viz detail':r.kind === 'profil' ? cutGlyph(r.cutR, 'right') + ' ' + fmtAngle(r.cutR.angle, 1) : '–'}</td>
        <td>${esc(noteText(r))}</td>
      </tr>`);
    }
  }

  // Grafické náhledy dílů s řezy (§19).
  const previews = rows
    .filter((r) => r.kind === 'profil' && r.productionReady!==false)
    .map(
      (r) => `<div class="piece">
        <b>${esc(r.name)}</b>
        <small>${esc(r.materialName)} · ${fmtLen(r.length)} mm · ${r.count}×</small>
        ${pieceDetailSVG(r)}
      </div>`
    )
    .join('');

  return `<div class="sheet">
    ${header(p, 'Kusovník')}
    <table>
      <thead><tr>
        <th class="num" style="width:34pt">Pozice</th><th>Název dílu</th><th style="width:70pt">Sestava</th>
        <th style="width:90pt">Materiál</th><th class="num" style="width:80pt">Délka / rozměr</th>
        <th class="num" style="width:30pt">Počet</th><th style="width:52pt">Levý řez</th>
        <th style="width:52pt">Pravý řez</th><th style="width:110pt">Poznámka</th>
      </tr></thead>
      <tbody>${body.join('') || '<tr><td colspan="9">Kusovník je prázdný.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="4">Celkem</td><td class="num">${fmtLen(totalLength)} mm</td>
        <td class="num">${totalPieces} ks</td><td colspan="3"></td></tr></tfoot>
    </table>
    ${previews ? `<h2>Náhledy dílů s tvarem řezů</h2><div class="pieces">${previews}</div>` : ''}
  </div>`;
}

/* ── nářez ── */

function cutSheet(store) {
  const p = store.project;
  const plans = store.derived.plans;
  if (!plans.length) {
    return `<div class="sheet">${header(p, 'Nářezový plán')}
      <p>${members3(p).length?'U 3D návrhu je nejprve nutné dopočítat prostorové spoje a výrobní řezy. Osové délky jsou v kusovníku.':'Projekt neobsahuje profilové díly s materiálem, nářezový plán se nevytváří.'}</p></div>`;
  }

  const blocks = plans
    .map((plan) => {
      const bars = plan.bars
        .map(
          (bar, i) => `<div class="bar">
            <div class="lbl"><b>Tyč ${i + 1}</b><br>${fmtLen(plan.stockLength)} mm
              ${bar.manual ? '<br>ručně' : ''}${bar.overlong ? '<br>nevejde se' : ''}</div>
            <div class="svg">${barSVG(bar, plan)}</div>
            <div class="u">${fmtPercent(bar.utilization, 0)}</div>
          </div>`
        )
        .join('');
      return `<div class="matblock">
        <div class="title">${esc(plan.materialName)}</div>
        <div class="sub">${plan.barCount}× tyč ${fmtLen(plan.stockLength)} mm ·
          ${plan.totalPieces} dílů · prořez ${fmtLen(plan.kerf, 1)} mm ·
          využití ${fmtPercent(plan.utilization)} · odpad ${fmtLen(plan.waste)} mm
          ${plan.locked ? ' · ruční rozložení' : ''}</div>
        ${bars}
      </div>`;
    })
    .join('');

  const summary = materialSummary(store.derived.parts.filter(p=>p.productionReady!==false))
    .map(
      (m) => `<tr><td>${esc(m.materialName)}</td><td class="num">${m.pieces}</td>
        <td class="num">${fmtLen(m.totalLength)} mm</td>
        <td class="num">${fmtLen(m.stockLength)} mm</td>
        <td class="num">${plans.find((p2) => p2.materialId === m.materialId)?.barCount ?? '–'}</td></tr>`
    )
    .join('');

  return `<div class="sheet">
    ${header(p, 'Nářezový plán')}
    ${blocks}
    <div class="legend">${cutLegendHTML()}</div>
    <h2>Souhrn materiálu</h2>
    <table>
      <thead><tr><th>Materiál</th><th class="num">Dílů</th><th class="num">Celková délka</th>
        <th class="num">Skladová tyč</th><th class="num">Počet tyčí</th></tr></thead>
      <tbody>${summary}</tbody>
    </table>
    <div class="note">Sklon řezu je kreslen symbolicky ve správném směru; přesná hodnota úhlu
      je vypsaná pod každým koncem dílu. Prořez pily je vyšrafovaná mezera mezi kusy,
      zbytek tyče je vyšrafovaný na konci.</div>
  </div>`;
}

/* ── kontrolní list ── */

function issuesBlock(store) {
  const issues = store.derived.issues;
  if (!issues.length) return '';
  const errs = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  const item = (i) => `<div>• <b>${esc(i.title)}:</b> ${esc(i.message)}</div>`;
  return `
    ${errs.length ? `<div class="warnbox errbox"><b>Chyby (${errs.length})</b>${errs.map(item).join('')}</div>` : ''}
    ${warns.length ? `<div class="warnbox"><b>Varování (${warns.length})</b>${warns.map(item).join('')}</div>` : ''}`;
}

/* ─────────────────────────────────────────────────────── sestavení ── */

/**
 * @param {Store} store
 * @param {Array<'drawing'|'bom'|'cut'>} sections
 */
export function buildReport(store, sections) {
  const parts = [];
  if (sections.includes('drawing')) {
    if(store.project.objects.some(o=>!['member3d','plate3d'].includes(o.type))||!spatialObjects(store.project).length)parts.push(drawingSheet(store, renderDrawingImage(store)));
    if(spatialObjects(store.project).length)parts.push(spatialSheet(store));
  }
  if (sections.includes('bom')) parts.push(bomSheet(store));
  if (sections.includes('cut')) parts.push(cutSheet(store));
  if(sections.includes('cut')||sections.includes('bom'))for(const part of store.derived.parts.filter(p=>p.axis3d&&p.productionReady))parts.push(`<div class="sheet">${header(store.project,'Geometrie 3D řezů')}${fabricationDetail(part)}</div>`);

  if(sections.includes('drawing')||sections.includes('bom'))for(const part of store.derived.parts.filter(p=>p.plate3d))parts.push(`<div class="sheet">${header(store.project,'Výkres prostorového plechu')}${plateDetail(part)}</div>`);

  // Kontrolní list se přidá na konec první stránky, aby si ho nikdo nepřehlédl.
  const issues = issuesBlock(store);
  if (issues && parts.length) {
    parts[parts.length - 1] = parts[parts.length - 1].replace('</div>$', '');
    parts.push(`<div class="sheet">${header(store.project, 'Kontrola projektu')}${issues}
      <div class="note">Před výrobou vyřeš všechny chyby a zkontroluj varování.</div></div>`);
  }

  return `<!doctype html><html lang="cs"><head><meta charset="utf-8">
    <title>${esc(store.project.name)}</title><style>${CSS}</style></head>
    <body>${members3(store.project).length?'<p style="color:#854d20">3D: nářez obsahuje pouze díly s vyřešenými konci. Nákres tyče ukazuje polotovary; prostorové řezy určuje samostatný detail rohů průřezu. Nevyřešené díly mají pouze osové délky.</p>':''}${parts.join('')}</body></html>`;
}

function spatialSheet(store){
  const p=store.project,shapes=store.derived.parts.filter(part=>(part.axis3d||part.plate3d)&&p.isVisible(p.byId(part.objectId))).map(part=>spatialEnvelope(p,part)).filter(Boolean);
  const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const views=[['Půdorys · X / Z','x','z'],['Čelo · X / Y','x','y'],['Bok · Z / Y','z','y']];
  const drawings=views.map(([label,u,v])=>{
    const pts=shapes.flatMap(s=>s.vertices);if(!pts.length)return '';
    const minU=Math.min(...pts.map(n=>n[u])),maxU=Math.max(...pts.map(n=>n[u])),minV=Math.min(...pts.map(n=>n[v])),maxV=Math.max(...pts.map(n=>n[v]));
    const scale=Math.min(320/Math.max(maxU-minU,1),320/Math.max(maxV-minV,1));
    const x=n=>40+(320-(maxU-minU)*scale)/2+(n[u]-minU)*scale,y=n=>60+(320-(maxV-minV)*scale)/2+(maxV-n[v])*scale;
    return `<svg viewBox="0 0 400 450" style="width:32%;display:inline-block"><text x="200" y="25" text-anchor="middle" font-family="sans-serif" font-size="17">${label}</text>${shapes.map(s=>edges.map(([i,j])=>`<line x1="${x(s.vertices[i])}" y1="${y(s.vertices[i])}" x2="${x(s.vertices[j])}" y2="${y(s.vertices[j])}" stroke="#355c54" stroke-width="1"/>`).join('')).join('')}<text x="200" y="422" text-anchor="middle" font-family="sans-serif" font-size="14">Vnější rozměr ${Math.round((maxU-minU)*10)/10} × ${Math.round((maxV-minV)*10)/10} mm</text></svg>`;
  }).join('');
  return `<div class="sheet">${header(p,'3D konstrukce – hranové pohledy')}<p>Vnější hrany včetně skrytých. Detaily řezů a otvorů jsou na samostatných listech. X = šířka, Y = výška, Z = hloubka.</p>${drawings}</div>`;
}

export const REPORT_TITLES = {
  drawing: 'vykres',
  bom: 'kusovnik',
  cut: 'narez',
  all: 'dokumentace',
};
