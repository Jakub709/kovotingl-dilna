/**
 * Pravý panel vlastností (§5.1).
 * Úpravy se dělají krátkými poli, ne složitými dialogy (§5.2).
 */
import * as G from '../core/geom.js';
import { parseLength, parseAngle, parseCount, fmtLen, fmtAngle } from '../core/units.js';
import { CORNER_MODES, OBJECT_LABELS, makeCut, frameClearRect, meshRect, makeHole, objectBBox, translateObject } from '../core/model.js';
import { categoryKind, sectionText, sectionWidth } from '../core/materials.js';
import { fillLayout, deviationOf } from '../core/build.js';
import { pointsToChain, chainToPoints } from '../core/recognize.js';
import { pieceDetailSVG } from './cutdraw.js';
import { applyAnchoredResize } from './canvas2d.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ANCHORS = [
  ['bl', 'Levý dolní roh'],
  ['br', 'Pravý dolní roh'],
  ['tl', 'Levý horní roh'],
  ['tr', 'Pravý horní roh'],
  ['center', 'Střed'],
];

export class PropsPanel {
  constructor(el, store, host) {
    this.el = el;
    this.store = store;
    this.host = host;
    store.subscribe(reason => { if (!['highlight','hover','drag'].includes(reason)) this.render(); });
    this.el.addEventListener('change', (e) => this.onChange(e));
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
    });
  }

  render() {
    const sel = this.store.selectedObjects();
    if (!sel.length) {
      this.el.innerHTML =
        '<div class="empty">Vyber prvek ve výkresu.<br><br>' +
        'Tip: nástrojem <b>Kreslení</b> načrtni obdélník od ruky – program ho narovná a nabídne kóty.</div>';
      return;
    }
    if (sel.length > 1) {
      this.el.innerHTML = this.multiHTML(sel);
      return;
    }
    this.el.innerHTML = this.singleHTML(sel[0]);
  }

  /* ─────────────────────────────────────────────── více vybraných ─── */

  multiHTML(objs) {
    const types = [...new Set(objs.map((o) => OBJECT_LABELS[o.type] || o.type))];
    return `
      <div class="grp">
        <div class="grp-title">Vybráno ${objs.length} prvků</div>
        <p class="hint">${esc(types.join(', '))}</p>
      </div>
      <div class="grp">
        <div class="grp-title">Materiál pro všechny</div>
        ${this.matSelectHTML('multiMat', null, ['profil'])}
        <p class="hint">Nastaví stejný profil všem vybraným profilovým prvkům.</p>
      </div>
      <div class="grp">
        <div class="grp-title">Zarovnání</div>
        <div class="btn-row">
          <button class="btn" data-act="align" data-dir="left">Vlevo</button>
          <button class="btn" data-act="align" data-dir="hcenter">Na střed ↔</button>
          <button class="btn" data-act="align" data-dir="right">Vpravo</button>
        </div>
        <div class="btn-row">
          <button class="btn" data-act="align" data-dir="top">Nahoru</button>
          <button class="btn" data-act="align" data-dir="vcenter">Na střed ↕</button>
          <button class="btn" data-act="align" data-dir="bottom">Dolů</button>
        </div>
        <div class="btn-row">
          <button class="btn" data-act="distribute" data-dir="h">Rozložit vodorovně</button>
          <button class="btn" data-act="distribute" data-dir="v">Rozložit svisle</button>
        </div>
      </div>
      <div class="grp">
        <div class="grp-title">Sestava</div>
        <div class="btn-row">
          <button class="btn primary" data-act="group">Seskupit do sestavy</button>
          <button class="btn" data-act="ungroup">Zrušit seskupení</button>
        </div>
      </div>
      <div class="grp">
        <div class="btn-row">
          <button class="btn" data-act="duplicate">Duplikovat</button>
          <button class="btn danger" data-act="delete">Odstranit</button>
        </div>
      </div>`;
  }

  /* ─────────────────────────────────────────────── jeden prvek ────── */

  singleHTML(o) {
    const p = this.store.project;
    const parts = this.store.partsOfObject(o.id);
    const issues = this.store.issuesOfObject(o.id);

    const head = `
      <div class="grp">
        <div class="row"><label>Typ prvku</label>
          <input type="text" value="${esc(OBJECT_LABELS[o.type] || o.type)}" readonly /></div>
        <div class="row"><label>Označení</label>
          <input type="text" data-field="name" value="${esc(o.name)}" placeholder="${esc(defaultLabel(o, parts))}" /></div>
        <div class="row"><label>Sestava</label>${this.assemblySelectHTML(o)}</div>
      </div>`;

    let body = '';
    switch (o.type) {
      case 'frame': body = this.frameHTML(o); break;
      case 'fill': body = this.fillHTML(o); break;
      case 'mesh': body = this.meshHTML(o); break;
      case 'plate': body = this.plateHTML(o); break;
      case 'profile': body = this.profileHTML(o); break;
      case 'ref': body = this.refHTML(o); break;
      case 'dim': body = this.dimHTML(o); break;
      default: break;
    }

    const visibility = `
      <div class="grp">
        <div class="grp-title">Zobrazení</div>
        <label class="chk"><input type="checkbox" data-field="visible" ${o.visible ? 'checked' : ''}/> Viditelný</label>
        <label class="chk"><input type="checkbox" data-field="locked" ${o.locked ? 'checked' : ''}/> Uzamčený proti posunu</label>
        <div class="row wide"><textarea data-field="note" placeholder="Poznámka k prvku">${esc(o.note)}</textarea></div>
        <div class="btn-row">
          <button class="btn" data-act="duplicate">Duplikovat</button>
          <button class="btn danger" data-act="delete">Odstranit</button>
        </div>
      </div>`;

    return head + body + this.partsHTML(parts) + this.issuesHTML(issues) + visibility;
  }

  /* ── rám ── */

  frameHTML(f) {
    const clear = frameClearRect(this.store.project, f, this.store.library);
    const modeHint = CORNER_MODES.find((m) => m.key === f.cornerMode)?.hint || '';
    const custom = f.cornerMode === 'custom' ? this.frameCustomCutsHTML(f) : '';
    return `
      <div class="grp">
        <div class="grp-title">Materiál</div>
        ${this.matSelectHTML('materialId', f.materialId, ['profil'])}
        <p class="hint">Světlost rámu ${fmtLen(clear.w)} × ${fmtLen(clear.h)} mm (profil ${fmtLen(clear.t)} mm).</p>
      </div>
      <div class="grp">
        <div class="grp-title">Rozměry</div>
        <div class="row"><label>Šířka</label><input type="text" data-field="w" value="${fmtLen(f.w)}" /></div>
        <div class="row"><label>Výška</label><input type="text" data-field="h" value="${fmtLen(f.h)}" /></div>
        <div class="row"><label>Pevný bod</label>
          <select data-field="anchor">
            ${ANCHORS.map(([k, l]) => `<option value="${k}" ${f.anchor === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <p class="hint">Při změně rozměru zůstane pevný bod na místě.</p>
      </div>
      <div class="grp">
        <div class="grp-title">Pozice</div>
        <div class="row"><label>X</label><input type="text" data-field="x" value="${fmtLen(f.x)}" /></div>
        <div class="row"><label>Y</label><input type="text" data-field="y" value="${fmtLen(f.y)}" /></div>
      </div>
      <div class="grp">
        <div class="grp-title">Spoje rohů</div>
        <div class="row wide">
          <select data-field="cornerMode">
            ${CORNER_MODES.map((m) => `<option value="${m.key}" ${f.cornerMode === m.key ? 'selected' : ''}>${m.label}</option>`).join('')}
          </select></div>
        <p class="hint">${esc(modeHint)}</p>
        ${custom}
      </div>
      <div class="grp">
        <div class="grp-title">Výplň</div>
        <div class="btn-row">
          <button class="btn" data-act="addFill" data-dir="v">Svislá výplň</button>
          <button class="btn" data-act="addFill" data-dir="h">Vodorovná výplň</button>
          <button class="btn" data-act="addMesh">Pletivo</button>
        </div>
      </div>`;
  }

  frameCustomCutsHTML(f) {
    const slots = [['left', 'Levý svislý'], ['right', 'Pravý svislý'], ['top', 'Horní'], ['bottom', 'Spodní']];
    return slots
      .map(([slot, label]) => {
        const mc = f.memberCuts?.[slot] || {};
        const s = mc.start || {};
        const e = mc.end || {};
        return `<div class="row two"><label>${label}</label>
          <input type="text" data-field="cut" data-slot="${slot}" data-end="start"
            value="${s.angle ?? 45}" title="Úhel levého řezu" />
          <input type="text" data-field="cut" data-slot="${slot}" data-end="end"
            value="${e.angle ?? 45}" title="Úhel pravého řezu" /></div>`;
      })
      .join('') + '<p class="hint">Levý a pravý úhel každého dílu ve stupních (90 = rovný řez).</p>';
  }

  /* ── výplň ── */

  fillHTML(fl) {
    const frame = this.store.project.byId(fl.frameId);
    const mat = this.store.project.material(fl.materialId, this.store.library);
    const bar = mat ? sectionWidth(mat) : 0;
    let info = '';
    if (frame && bar > 0) {
      const clear = frameClearRect(this.store.project, frame, this.store.library);
      const span = fl.dir === 'v' ? clear.w : clear.h;
      const run = fl.dir === 'v' ? clear.h : clear.w;
      const L = fillLayout(span, bar, fl);
      info = `<p class="hint">Světlost ${fmtLen(span)} mm · ${L.count}× profil ${fmtLen(bar)} mm ·
        mezera <b>${fmtLen(L.gap, 1)} mm</b> · krajní ${fmtLen(L.edge, 1)} mm ·
        délka výplně ${fmtLen(run)} mm.</p>`;
    }
    const manualCount = Object.keys(fl.overrides || {}).length;
    return `
      <div class="grp">
        <div class="grp-title">Rozmístění</div>
        <div class="row"><label>Směr</label>
          <select data-field="dir">
            <option value="v" ${fl.dir === 'v' ? 'selected' : ''}>Svislá</option>
            <option value="h" ${fl.dir === 'h' ? 'selected' : ''}>Vodorovná</option>
          </select></div>
        <div class="row"><label>Zadání</label>
          <select data-field="mode">
            <option value="count" ${fl.mode === 'count' ? 'selected' : ''}>Počet kusů</option>
            <option value="gap" ${fl.mode === 'gap' ? 'selected' : ''}>Maximální mezera</option>
          </select></div>
        ${
          fl.mode === 'count'
            ? `<div class="row"><label>Počet</label><input type="number" min="0" max="200" data-field="count" value="${fl.count}" /></div>`
            : `<div class="row"><label>Max. mezera</label><input type="text" data-field="maxGap" value="${fmtLen(fl.maxGap)}" /></div>`
        }
        <div class="row"><label>Krajní mezery</label>
          <select data-field="edgeGapMode">
            <option value="equal" ${fl.edgeGapMode === 'equal' ? 'selected' : ''}>Stejné jako mezi profily</option>
            <option value="custom" ${fl.edgeGapMode === 'custom' ? 'selected' : ''}>Vlastní hodnota</option>
          </select></div>
        ${
          fl.edgeGapMode === 'custom'
            ? `<div class="row"><label>Krajní mezera</label><input type="text" data-field="edgeGap" value="${fmtLen(fl.edgeGap ?? 0)}" /></div>`
            : ''
        }
        ${info}
      </div>
      <div class="grp">
        <div class="grp-title">Materiál výplně</div>
        ${this.matSelectHTML('materialId', fl.materialId, ['profil'])}
        <p class="hint">Výplň má vlastní materiál nezávislý na rámu.</p>
      </div>
      ${
        manualCount
          ? `<div class="grp"><div class="grp-title">Ruční úpravy</div>
              <p class="hint">${manualCount} výplní je upraveno ručně a nepodléhá automatickému rozložení.</p>
              <button class="btn full" data-act="resetFill">Vrátit vše do automatického rozložení</button></div>`
          : ''
      }
      <div class="grp">
        <div class="btn-row"><button class="btn" data-act="toMesh">Nahradit pletivem</button></div>
      </div>`;
  }

  /* ── pletivo ── */

  meshHTML(m) {
    const r = meshRect(this.store.project, m, this.store.library);
    return `
      <div class="grp">
        <div class="grp-title">Typ pletiva</div>
        ${this.matSelectHTML('materialId', m.materialId, ['pletivo'])}
        <div class="row wide"><input type="text" data-field="meshText" value="${esc(m.meshText)}"
          placeholder="Vlastní popis, např. pletivo 50×50 zelené" /></div>
      </div>
      <div class="grp">
        <div class="grp-title">Rozměry</div>
        ${m.frameId ? `<div class="row"><label>Odsazení od rámu</label><input type="text" data-field="inset" value="${fmtLen(m.inset)}" /></div>` : ''}
        <div class="row"><label>Šířka</label><input type="text" data-field="overrideW" value="${fmtLen(r.w)}" /></div>
        <div class="row"><label>Výška</label><input type="text" data-field="overrideH" value="${fmtLen(r.h)}" /></div>
        ${
          m.overrideW != null || m.overrideH != null
            ? '<button class="btn full" data-act="resetMesh">Dopočítat rozměr z rámu</button>'
            : '<p class="hint">Rozměr se dopočítává ze světlosti rámu. Přepsáním se zafixuje.</p>'
        }
      </div>
      <div class="grp">
        <div class="btn-row"><button class="btn" data-act="toFill">Nahradit profilovou výplní</button></div>
      </div>`;
  }

  /* ── plech / patka ── */

  plateHTML(pl) {
    const bb = G.bboxOf(pl.points);
    const holes = (pl.holes || [])
      .map(
        (h, i) => `
      <div class="row two" data-hole="${esc(h.id)}">
        <label>${h.kind === 'circle' ? 'Ø' : 'Ovál'} ${i + 1}</label>
        ${
          h.kind === 'circle'
            ? `<input type="text" data-field="holeD" data-hole="${esc(h.id)}" value="${fmtLen(h.d, 1)}" title="Průměr" />`
            : `<input type="text" data-field="holeW" data-hole="${esc(h.id)}" value="${fmtLen(h.w, 1)}" title="Délka" />`
        }
        <div class="inline">
          <input type="text" data-field="holeX" data-hole="${esc(h.id)}" value="${fmtLen(h.cx - bb.minX, 1)}" title="X od levé hrany" />
          <input type="text" data-field="holeY" data-hole="${esc(h.id)}" value="${fmtLen(h.cy - bb.minY, 1)}" title="Y od dolní hrany" />
          <button class="btn danger" data-act="delHole" data-hole="${esc(h.id)}" title="Odstranit otvor">×</button>
        </div>
      </div>`
      )
      .join('');

    return `
      <div class="grp">
        <div class="grp-title">Materiál a tloušťka</div>
        ${this.matSelectHTML('materialId', pl.materialId, ['plech'])}
        <div class="row"><label>Tloušťka</label><input type="text" data-field="thickness" value="${fmtLen(pl.thickness, 1)}" /></div>
        <div class="row"><label>Druh</label>
          <select data-field="plateKind">
            <option value="patka" ${pl.plateKind === 'patka' ? 'selected' : ''}>Patka</option>
            <option value="plech" ${pl.plateKind === 'plech' ? 'selected' : ''}>Plech</option>
          </select></div>
      </div>
      <div class="grp">
        <div class="grp-title">Rozměry</div>
        <div class="row"><label>Šířka</label><input type="text" data-field="plateW" value="${fmtLen(bb.w)}" /></div>
        <div class="row"><label>Výška</label><input type="text" data-field="plateH" value="${fmtLen(bb.h)}" /></div>
        <div class="row"><label>X</label><input type="text" data-field="plateX" value="${fmtLen(bb.minX)}" /></div>
        <div class="row"><label>Y</label><input type="text" data-field="plateY" value="${fmtLen(bb.minY)}" /></div>
      </div>
      <div class="grp">
        <div class="grp-title">Otvory (${(pl.holes || []).length})</div>
        ${holes || '<p class="hint">Zatím bez otvorů.</p>'}
        <div class="btn-row">
          <button class="btn" data-act="addHole" data-kind="circle">+ Kruhový</button>
          <button class="btn" data-act="addHole" data-kind="oval">+ Oválný</button>
          <button class="btn" data-act="holePattern">4× do rohů</button>
        </div>
        <p class="hint">Poloha otvoru se zadává od levé a spodní hrany plechu.</p>
      </div>`;
  }

  /* ── profil ── */

  profileHTML(pr) {
    const chain = pointsToChain(pr.points);
    const segs = chain.segments
      .map(
        (s, i) => `<div class="row"><label>Úsek ${i + 1}</label>
          <input type="text" data-field="segLen" data-idx="${i}" value="${fmtLen(s.length, 1)}" /></div>`
      )
      .join('');
    const bends = chain.bends
      .map(
        (b, i) => `<div class="row"><label>Úhel lomu ${i + 1}</label>
          <input type="text" data-field="bend" data-idx="${i}" value="${String(Math.abs(b)).replace('.', ',')}" /></div>`
      )
      .join('');
    const multi = pr.points.length > 2;

    return `
      <div class="grp">
        <div class="grp-title">Materiál</div>
        ${this.matSelectHTML('materialId', pr.materialId, ['profil'])}
      </div>
      <div class="grp">
        <div class="grp-title">Geometrie</div>
        ${segs}
        ${bends}
        ${!multi ? `<div class="row"><label>Úhel prvku</label><input type="text" data-field="profAngle" value="${fmtAngle(G.angleOf(G.sub(pr.points[1], pr.points[0])), 1)}" /></div>` : ''}
        <div class="row"><label>X začátku</label><input type="text" data-field="profX" value="${fmtLen(pr.points[0].x)}" /></div>
        <div class="row"><label>Y začátku</label><input type="text" data-field="profY" value="${fmtLen(pr.points[0].y)}" /></div>
      </div>
      ${
        multi
          ? `<div class="grp">
              <div class="grp-title">Provedení lomeného tvaru</div>
              <div class="row wide"><select data-field="bendMode">
                <option value="bent" ${pr.bend === 'bent' ? 'selected' : ''}>Jeden ohýbaný díl</option>
                <option value="cut" ${pr.bend === 'cut' ? 'selected' : ''}>Skládaný z více kusů</option>
              </select></div>
              <p class="hint">${
                pr.bend === 'bent'
                  ? 'V kusovníku je jeden prvek s rozvinutou délkou a geometrií ohybů.'
                  : 'Každý úsek je samostatný díl s pokosem v místě lomu.'
              }</p>
            </div>`
          : ''
      }
      <div class="grp">
        <div class="grp-title">Řezy konců</div>
        ${this.cutEditorHTML('start', pr.cuts?.start || makeCut(90, 0), 'Levý řez')}
        ${this.cutEditorHTML('end', pr.cuts?.end || makeCut(90, 0), 'Pravý řez')}
        <div class="row"><label>Měření délky</label>
          <select data-field="lengthMode">
            <option value="outer" ${pr.lengthMode === 'outer' ? 'selected' : ''}>Po nejdelší vnější hraně</option>
            <option value="center" ${pr.lengthMode === 'center' ? 'selected' : ''}>Po střednici</option>
          </select></div>
      </div>`;
  }

  cutEditorHTML(end, cut, label) {
    const dev = deviationOf(cut);
    return `
      <div class="row"><label>${label}</label>
        <select data-field="cutType" data-end="${end}">
          <option value="straight" ${cut.angle === 90 ? 'selected' : ''}>90° (rovný)</option>
          <option value="miter" ${cut.angle === 45 ? 'selected' : ''}>45° (pokos)</option>
          <option value="custom" ${cut.angle !== 90 && cut.angle !== 45 ? 'selected' : ''}>Vlastní úhel</option>
        </select></div>
      <div class="row"><label>Úhel</label>
        <div class="inline">
          <input type="text" data-field="cutAngle" data-end="${end}" value="${String(cut.angle).replace('.', ',')}" />
          <select data-field="cutOrient" data-end="${end}" ${Math.abs(dev) < 0.05 ? 'disabled' : ''} title="Směr sklonu">
            <option value="0" ${!cut.orient ? 'selected' : ''}>svislý</option>
            <option value="1" ${cut.orient === 1 ? 'selected' : ''}>delší nahoře</option>
            <option value="-1" ${cut.orient === -1 ? 'selected' : ''}>delší dole</option>
          </select>
        </div></div>`;
  }

  /* ── okolí ── */

  refHTML(rf) {
    const segs = [];
    for (let i = 0; i < rf.points.length - 1; i++) {
      segs.push(`<div class="row"><label>Úsek ${i + 1}</label>
        <input type="text" data-field="refSeg" data-idx="${i}" value="${fmtLen(G.dist(rf.points[i], rf.points[i + 1]), 1)}" /></div>`);
    }
    return `
      <div class="grp">
        <div class="grp-title">Referenční geometrie</div>
        <div class="row"><label>Druh</label>
          <select data-field="refKind">
            ${[['zed', 'Zeď'], ['podlaha', 'Podlaha / terén'], ['strop', 'Strop'], ['sloup', 'Sloup'], ['schody', 'Schody'], ['otvor', 'Stavební otvor']]
              .map(([k, l]) => `<option value="${k}" ${rf.refKind === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <label class="chk"><input type="checkbox" data-field="closed" ${rf.closed ? 'checked' : ''}/> Uzavřený obrys</label>
        <p class="hint">Okolí se nikdy nezapočítává do kusovníku ani nářezového plánu.</p>
      </div>
      <div class="grp">
        <div class="grp-title">Úseky (${Math.max(0, rf.points.length - 1)})</div>
        ${segs.join('') || '<p class="hint">Bez úseků.</p>'}
      </div>`;
  }

  dimHTML(d) {
    return `<div class="grp">
      <div class="grp-title">Kóta</div>
      <div class="row"><label>Hodnota</label><input type="text" data-field="dimValue" value="${fmtLen(G.dist(d.a, d.b), 1)}" /></div>
      <div class="row"><label>Odsazení</label><input type="number" data-field="offset" value="${Math.round(d.offset)}" /></div>
    </div>`;
  }

  /* ─────────────────────────────────────────── odvozené díly a chyby ─ */

  partsHTML(parts) {
    if (!parts.length) return '';
    const hi = this.store.highlightPart;
    const rows = parts
      .map((p) => {
        const active = hi === p.key;
        const dims =
          p.kind === 'profil'
            ? `${fmtLen(p.length)} mm · ${fmtAngle(p.cutL.angle, 1)} / ${fmtAngle(p.cutR.angle, 1)}`
            : p.kind === 'plech'
            ? `${fmtLen(p.width)} × ${fmtLen(p.height)} × ${fmtLen(p.thickness, 1)} mm`
            : `${fmtLen(p.width)} × ${fmtLen(p.height)} mm`;
        return `<div class="issue-item" style="background:${active ? '#fdf0e0' : '#f7f9fb'};color:#3c4a58;cursor:pointer"
            data-act="pickPart" data-key="${esc(p.key)}">
            <div><b>${esc(p.name)}</b><br>${dims}</div></div>
          ${active && p.kind === 'profil' ? pieceDetailSVG(p) : ''}`;
      })
      .join('');
    return `<div class="grp"><div class="grp-title">Díly v kusovníku (${parts.length})</div>${rows}</div>`;
  }

  issuesHTML(issues) {
    if (!issues.length) return '';
    return `<div class="grp"><div class="grp-title">Kontrola</div>
      ${issues
        .map(
          (i) =>
            `<div class="issue-item ${i.severity === 'error' ? 'err' : ''}"><div><b>${esc(i.title)}</b><br>${esc(i.message)}</div></div>`
        )
        .join('')}</div>`;
  }

  /* ─────────────────────────────────────────────────────── selecty ── */

  matSelectHTML(field, currentId, kinds) {
    const lib = this.store.library;
    const groups = new Map();
    for (const m of lib.active()) {
      if (kinds && !kinds.includes(categoryKind(m.category))) continue;
      const cat = m.category;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(m);
    }
    // Materiál použitý v projektu, který v knihovně chybí, musí zůstat vidět (§18).
    if (currentId && !lib.get(currentId)) {
      const snap = this.store.project.materials[currentId];
      if (snap) groups.set('_snap', [snap]);
    }
    const opts = [...groups]
      .map(
        ([cat, items]) =>
          `<optgroup label="${esc(cat === '_snap' ? 'Z projektu' : catLabel(cat))}">` +
          items
            .map(
              (m) =>
                `<option value="${esc(m.id)}" ${m.id === currentId ? 'selected' : ''}>${esc(m.name)}</option>`
            )
            .join('') +
          '</optgroup>'
      )
      .join('');
    return `<div class="row wide"><select data-field="${field}">
      <option value="">— bez materiálu —</option>${opts}</select></div>
      <div class="btn-row"><button class="btn" data-act="openMatDb">Databáze materiálů…</button></div>`;
  }

  assemblySelectHTML(o) {
    const list = this.store.project.assemblies;
    return `<select data-field="assemblyId">
      <option value="">— bez sestavy —</option>
      ${list.map((a) => `<option value="${esc(a.id)}" ${o.assemblyId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
    </select>`;
  }

  /* ─────────────────────────────────────────────────────── události ── */

  onChange(e) {
    const el = e.target;
    const field = el.dataset.field;
    if (!field) return;
    const objs = this.store.selectedObjects();
    if (!objs.length) return;

    if (field === 'multiMat') {
      const mat = this.store.library.get(el.value);
      this.store.commit('Změna materiálu', (p) => {
        if (mat) p.useMaterial(mat);
        for (const o of objs) if ('materialId' in o) p.byId(o.id).materialId = mat?.id || null;
      });
      return;
    }

    const o = objs[0];
    const val = el.type === 'checkbox' ? el.checked : el.value;
    try {
      this.applyField(o, field, val, el);
    } catch (err) {
      this.host.onToast?.(err.message, 'err');
      this.render();
    }
  }

  applyField(o, field, val, el) {
    const store = this.store;
    const num = () => {
      const v = parseLength(val);
      if (v == null) throw new Error('Nesrozumitelná hodnota. Zkus například 900 nebo 90 cm.');
      return v;
    };
    const ang = () => {
      const v = parseAngle(val);
      if (v == null) throw new Error('Nesrozumitelný úhel.');
      return v;
    };
    const pos = () => {
      const v = num();
      if (v <= 0) throw new Error('Rozměr musí být větší než nula.');
      return v;
    };

    store.commit(`Úprava – ${OBJECT_LABELS[o.type] || o.type}`, (p) => {
      const t = p.byId(o.id);
      if (!t) return;

      /* společné */
      if (field === 'name') return void (t.name = String(val));
      if (field === 'note') return void (t.note = String(val));
      if (field === 'visible') return void (t.visible = !!val);
      if (field === 'locked') return void (t.locked = !!val);
      if (field === 'assemblyId') return void (t.assemblyId = val || null);
      if (field === 'materialId') {
        const mat = store.library.get(val);
        if (mat) p.useMaterial(mat);
        t.materialId = mat?.id || (val || null);
        if (t.type === 'plate' && mat?.dims?.t) t.thickness = mat.dims.t;
        return;
      }

      /* rám */
      if (t.type === 'frame') {
        if (['w','h','x','y'].includes(field)) delete t.referenceFit;
        if (field === 'w' || field === 'h') return void applyAnchoredResize(t, field, pos());
        if (field === 'x') return void (t.x = num());
        if (field === 'y') return void (t.y = num());
        if (field === 'anchor') return void (t.anchor = val);
        if (field === 'cornerMode') {
          t.cornerMode = val;
          if (val === 'custom' && !t.memberCuts) {
            t.memberCuts = {};
            for (const s of ['left', 'right', 'top', 'bottom'])
              t.memberCuts[s] = { start: { angle: 45, orient: -1 }, end: { angle: 45, orient: -1 } };
          }
          return;
        }
        if (field === 'cut') {
          const a = ang();
          if (a < 15 || a > 90) throw new Error('Úhel řezu musí být mezi 15° a 90°.');
          t.memberCuts = t.memberCuts || {};
          const slot = (t.memberCuts[el.dataset.slot] = t.memberCuts[el.dataset.slot] || {});
          slot[el.dataset.end] = { angle: a, orient: a === 90 ? 0 : -1 };
          return;
        }
      }

      /* výplň */
      if (t.type === 'fill') {
        if (field === 'dir') return void (t.dir = val);
        if (field === 'mode') return void (t.mode = val);
        if (field === 'count') {
          const n = parseCount(val);
          if (n == null || n < 0) throw new Error('Počet musí být nezáporné celé číslo.');
          if (n > 200) throw new Error('Počet výplní je omezen na 200.');
          t.count = n;
          return;
        }
        if (field === 'maxGap') return void (t.maxGap = pos());
        if (field === 'edgeGapMode') {
          t.edgeGapMode = val;
          if (val === 'custom' && t.edgeGap == null) t.edgeGap = 50;
          return;
        }
        if (field === 'edgeGap') return void (t.edgeGap = num());
      }

      /* pletivo */
      if (t.type === 'mesh') {
        if (field === 'meshText') return void (t.meshText = String(val));
        if (field === 'inset') return void (t.inset = num());
        if (field === 'overrideW') return void (t.overrideW = pos());
        if (field === 'overrideH') return void (t.overrideH = pos());
      }

      /* plech */
      if (t.type === 'plate') {
        const bb = G.bboxOf(t.points);
        if (field === 'thickness') return void (t.thickness = pos());
        if (field === 'plateKind') return void (t.plateKind = val);
        if (field === 'plateW' || field === 'plateH') {
          const v = pos();
          const sx = field === 'plateW' ? v / Math.max(bb.w, 1e-6) : 1;
          const sy = field === 'plateH' ? v / Math.max(bb.h, 1e-6) : 1;
          t.points = t.points.map((q) => ({
            x: G.round1(bb.minX + (q.x - bb.minX) * sx),
            y: G.round1(bb.minY + (q.y - bb.minY) * sy),
          }));
          for (const h of t.holes || []) {
            h.cx = G.round1(bb.minX + (h.cx - bb.minX) * sx);
            h.cy = G.round1(bb.minY + (h.cy - bb.minY) * sy);
          }
          return;
        }
        if (field === 'plateX' || field === 'plateY') {
          const v = num();
          const dx = field === 'plateX' ? v - bb.minX : 0;
          const dy = field === 'plateY' ? v - bb.minY : 0;
          translateObject(t, dx, dy);
          return;
        }
        const hid = el.dataset.hole;
        const hole = (t.holes || []).find((h) => h.id === hid);
        if (hole) {
          if (field === 'holeD') return void (hole.d = pos());
          if (field === 'holeW') return void (hole.w = pos());
          if (field === 'holeX') return void (hole.cx = G.round1(bb.minX + num()));
          if (field === 'holeY') return void (hole.cy = G.round1(bb.minY + num()));
        }
      }

      /* profil */
      if (t.type === 'profile') {
        if (field === 'segLen') {
          const i = +el.dataset.idx;
          const chain = pointsToChain(t.points);
          if (!chain.segments[i]) return;
          chain.segments[i].length = pos();
          t.points = chainToPoints(t.points[0], chain.segments);
          return;
        }
        if (field === 'bend') {
          const i = +el.dataset.idx;
          const chain = pointsToChain(t.points);
          if (!chain.segments[i + 1]) return;
          const a = ang();
          const old = G.normAngle(chain.segments[i + 1].angle - chain.segments[i].angle);
          const sign = old >= 0 ? 1 : -1;
          const shift = sign * Math.abs(a) - old;
          for (let k = i + 1; k < chain.segments.length; k++)
            chain.segments[k].angle = G.round1(G.normAngle(chain.segments[k].angle + shift));
          t.points = chainToPoints(t.points[0], chain.segments);
          return;
        }
        if (field === 'profAngle') {
          const a = ang();
          const L = G.dist(t.points[0], t.points[1]);
          t.points[1] = {
            x: G.round1(t.points[0].x + Math.cos(a * G.RAD) * L),
            y: G.round1(t.points[0].y + Math.sin(a * G.RAD) * L),
          };
          return;
        }
        if (field === 'profX' || field === 'profY') {
          const v = num();
          const dx = field === 'profX' ? v - t.points[0].x : 0;
          const dy = field === 'profY' ? v - t.points[0].y : 0;
          translateObject(t, dx, dy);
          return;
        }
        if (field === 'bendMode') return void (t.bend = val);
        if (field === 'lengthMode') return void (t.lengthMode = val);
        if (field === 'cutType') {
          const end = el.dataset.end;
          t.cuts = t.cuts || { start: makeCut(90, 0), end: makeCut(90, 0) };
          const angle = val === 'straight' ? 90 : val === 'miter' ? 45 : t.cuts[end].angle;
          t.cuts[end] = { ...t.cuts[end], type: val, angle, orient: angle === 90 ? 0 : t.cuts[end].orient || -1 };
          return;
        }
        if (field === 'cutAngle') {
          const end = el.dataset.end;
          const a = ang();
          if (a < 15 || a > 90) throw new Error('Úhel řezu musí být mezi 15° a 90°.');
          t.cuts = t.cuts || { start: makeCut(90, 0), end: makeCut(90, 0) };
          t.cuts[end] = { ...t.cuts[end], angle: a, orient: a === 90 ? 0 : t.cuts[end].orient || -1 };
          return;
        }
        if (field === 'cutOrient') {
          const end = el.dataset.end;
          t.cuts[end] = { ...t.cuts[end], orient: parseInt(val, 10) || 0 };
          return;
        }
      }

      /* okolí */
      if (t.type === 'ref') {
        if (field === 'refKind') return void (t.refKind = val);
        if (field === 'closed') return void (t.closed = !!val);
        if (field === 'refSeg') {
          const i = +el.dataset.idx;
          if (!t.points[i + 1]) return;
          const d = G.norm(G.sub(t.points[i + 1], t.points[i]));
          const target = G.add(t.points[i], G.mul(d, pos()));
          const delta = G.sub(target, t.points[i + 1]);
          for (let k = i + 1; k < t.points.length; k++)
            t.points[k] = { x: G.round1(t.points[k].x + delta.x), y: G.round1(t.points[k].y + delta.y) };
          return;
        }
      }

      /* kóta */
      if (t.type === 'dim') {
        if (field === 'dimValue') {
          const d = G.norm(G.sub(t.b, t.a));
          const v = pos();
          t.b = { x: G.round1(t.a.x + d.x * v), y: G.round1(t.a.y + d.y * v) };
          return;
        }
        if (field === 'offset') return void (t.offset = parseFloat(val) || 0);
      }
    });
  }

  onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const objs = this.store.selectedObjects();
    const o = objs[0];

    switch (act) {
      case 'openMatDb':
        this.host.onOpenMaterials?.();
        break;
      case 'delete':
        this.host.onDelete?.();
        break;
      case 'duplicate':
        this.host.onDuplicate?.();
        break;
      case 'group':
        this.host.onGroupRequest?.();
        break;
      case 'ungroup':
        this.host.onUngroup?.();
        break;
      case 'pickPart':
        this.store.setHighlightPart(btn.dataset.key);
        break;
      case 'align':
        this.align(objs, btn.dataset.dir);
        break;
      case 'distribute':
        this.distribute(objs, btn.dataset.dir);
        break;
      case 'addFill':
        this.host.onAddFill?.(o, btn.dataset.dir);
        break;
      case 'addMesh':
        this.host.onAddMesh?.(o);
        break;
      case 'toMesh':
        this.host.onFillToMesh?.(o);
        break;
      case 'toFill':
        this.host.onMeshToFill?.(o);
        break;
      case 'resetFill':
        this.store.commit('Obnovení automatického rozložení výplně', (p) => {
          const t = p.byId(o.id);
          if (t) {
            t.overrides = {};
            t.manual = false;
          }
        });
        break;
      case 'resetMesh':
        this.store.commit('Dopočet rozměru pletiva', (p) => {
          const t = p.byId(o.id);
          if (t) {
            t.overrideW = null;
            t.overrideH = null;
          }
        });
        break;
      case 'addHole':
        this.addHole(o, btn.dataset.kind);
        break;
      case 'delHole':
        this.store.commit('Odstranění otvoru', (p) => {
          const t = p.byId(o.id);
          if (t) t.holes = t.holes.filter((h) => h.id !== btn.dataset.hole);
        });
        break;
      case 'holePattern':
        this.holePattern(o);
        break;
      default:
        break;
    }
  }

  addHole(plate, kind) {
    const bb = G.bboxOf(plate.points);
    this.store.commit('Vložení otvoru', (p) => {
      const t = p.byId(plate.id);
      if (!t) return;
      t.holes.push(
        makeHole({
          kind,
          cx: G.round1(bb.minX + bb.w / 2),
          cy: G.round1(bb.minY + bb.h / 2),
          d: 14,
          w: 20,
          h: 12,
        })
      );
    });
  }

  /** Čtyři otvory do rohů patky – typický případ z praxe (scénář A4). */
  holePattern(plate) {
    const bb = G.bboxOf(plate.points);
    const m = Math.min(25, Math.min(bb.w, bb.h) / 4);
    this.store.commit('Vložení 4 otvorů do rohů', (p) => {
      const t = p.byId(plate.id);
      if (!t) return;
      for (const [dx, dy] of [[m, m], [bb.w - m, m], [m, bb.h - m], [bb.w - m, bb.h - m]]) {
        t.holes.push(makeHole({ kind: 'circle', d: 14, cx: G.round1(bb.minX + dx), cy: G.round1(bb.minY + dy) }));
      }
    });
  }

  align(objs, dir) {
    const boxes = objs.map((o) => ({ o, bb: objectBBox(this.store.project, o, this.store.library) })).filter((x) => x.bb);
    if (boxes.length < 2) return;
    const all = boxes.reduce((a, x) => G.bboxUnion(a, x.bb), null);
    this.store.commit('Zarovnání prvků', (p) => {
      for (const { o, bb } of boxes) {
        const t = p.byId(o.id);
        if (!t) continue;
        let dx = 0;
        let dy = 0;
        if (dir === 'left') dx = all.minX - bb.minX;
        else if (dir === 'right') dx = all.maxX - bb.maxX;
        else if (dir === 'hcenter') dx = (all.minX + all.maxX) / 2 - (bb.minX + bb.maxX) / 2;
        else if (dir === 'bottom') dy = all.minY - bb.minY;
        else if (dir === 'top') dy = all.maxY - bb.maxY;
        else if (dir === 'vcenter') dy = (all.minY + all.maxY) / 2 - (bb.minY + bb.maxY) / 2;
        translateObject(t, G.round1(dx), G.round1(dy));
      }
    });
  }

  distribute(objs, dir) {
    const boxes = objs
      .map((o) => ({ o, bb: objectBBox(this.store.project, o, this.store.library) }))
      .filter((x) => x.bb)
      .sort((a, b) => (dir === 'h' ? a.bb.minX - b.bb.minX : a.bb.minY - b.bb.minY));
    if (boxes.length < 3) {
      this.host.onToast?.('Rovnoměrné rozložení potřebuje aspoň tři prvky.', 'warn');
      return;
    }
    const first = boxes[0].bb;
    const last = boxes[boxes.length - 1].bb;
    const totalSpan = dir === 'h' ? last.minX - first.minX : last.minY - first.minY;
    const step = totalSpan / (boxes.length - 1);
    this.store.commit('Rovnoměrné rozložení', (p) => {
      boxes.forEach((x, i) => {
        if (i === 0 || i === boxes.length - 1) return;
        const t = p.byId(x.o.id);
        if (!t) return;
        const target = (dir === 'h' ? first.minX : first.minY) + step * i;
        const cur = dir === 'h' ? x.bb.minX : x.bb.minY;
        translateObject(t, dir === 'h' ? G.round1(target - cur) : 0, dir === 'h' ? 0 : G.round1(target - cur));
      });
    });
  }
}

function defaultLabel(o, parts) {
  if (parts?.length) return parts[0].defaultName;
  return OBJECT_LABELS[o.type] || o.type;
}

function catLabel(key) {
  return (
    {
      jekl_ctverec: 'Jekl čtvercový',
      jekl_obdelnik: 'Jekl obdélníkový',
      trubka: 'Trubka kruhová',
      pasovina: 'Pásovina',
      uhelnik: 'Úhelník (L profil)',
      t_profil: 'T profil',
      u_profil: 'U profil',
      plech: 'Plech',
      pletivo: 'Pletivo',
      vlastni: 'Vlastní profil',
    }[key] || key
  );
}
