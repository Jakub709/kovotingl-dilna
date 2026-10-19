/**
 * Kusovník (§15). Klik na řádek zvýrazní díl ve výkresu i ve 3D a naopak.
 */
import { fmtLen, fmtAngle } from '../core/units.js';
import { cutGlyph } from './cutdraw.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class BomView {
  constructor(el, store, host) {
    this.el = el;
    this.store = store;
    this.host = host;
    this.filterAsm = '';
    this.filterMat = '';
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('dblclick', (e) => this.onDblClick(e));
    store.subscribe(() => this.render());
  }

  setFilters(asm, mat) {
    this.filterAsm = asm ?? this.filterAsm;
    this.filterMat = mat ?? this.filterMat;
    this.render();
  }

  rows() {
    return this.store.derived.bom.filter((r) => {
      if (this.filterAsm && (r.assemblyId || '') !== this.filterAsm) return false;
      if (this.filterMat && (r.materialId || '') !== this.filterMat) return false;
      return true;
    });
  }

  render() {
    const rows = this.rows();
    if (!rows.length) {
      this.el.innerHTML =
        '<div class="empty">Kusovník je zatím prázdný.<br>Nakresli rám nebo profil a přiřaď mu materiál.</div>';
      return;
    }

    // Seskupení podle materiálu kvůli čitelnosti (§15.2).
    const groups = new Map();
    for (const r of rows) {
      const k = r.materialId || '__none__';
      if (!groups.has(k)) groups.set(k, { name: r.materialName || 'Bez materiálu', rows: [] });
      groups.get(k).rows.push(r);
    }

    const issues = this.store.derived.issues;
    const rowClass = (r) => {
      const has = (sev) =>
        issues.some((i) => i.severity === sev && (i.partKey === r.key || i.objectIds.includes(r.objectId)));
      if (has('error')) return 'err';
      if (has('warn')) return 'warn';
      return '';
    };

    let totalPieces = 0;
    let totalLength = 0;
    const body = [];

    for (const [, g] of groups) {
      body.push(
        `<tr class="bom-group"><td colspan="9">${esc(g.name)} · ${g.rows.reduce((s, r) => s + r.count, 0)} ks</td></tr>`
      );
      for (const r of g.rows) {
        totalPieces += r.count;
        if (r.kind === 'profil') totalLength += (r.length || 0) * r.count;
        const sel = this.store.highlightPart && r.sources.includes(this.store.highlightPart);
        body.push(`<tr class="${rowClass(r)} ${sel ? 'sel' : ''}" data-key="${esc(r.sources[0])}" data-obj="${esc(
          r.objectId
        )}">
          <td class="num">${r.pos}</td>
          <td title="Dvojklik přejmenuje díl">${esc(r.name)}</td>
          <td>${esc(r.assemblyName || '–')}</td>
          <td>${esc(r.materialName || '–')}</td>
          <td class="num">${dimensionText(r)}</td>
          <td class="num">${r.count}</td>
          <td>${cutCell(r, 'L')}</td>
          <td>${cutCell(r, 'R')}</td>
          <td>${esc(noteText(r))}</td>
        </tr>`);
      }
    }

    this.el.innerHTML = `<table class="bom">
      <thead><tr>
        <th class="num">Pozice</th><th>Název dílu</th><th>Sestava</th><th>Materiál</th>
        <th class="num">Délka / rozměr</th><th class="num">Počet</th>
        <th>Levý řez</th><th>Pravý řez</th><th>Poznámka</th>
      </tr></thead>
      <tbody>${body.join('')}</tbody>
      <tfoot><tr class="bom-foot">
        <td colspan="4">Celkem</td>
        <td class="num">${fmtLen(totalLength)} mm</td>
        <td class="num">${totalPieces} ks</td>
        <td colspan="3"></td>
      </tr></tfoot>
    </table>`;
  }

  onClick(e) {
    const tr = e.target.closest('tr[data-key]');
    if (!tr) return;
    this.store.select(tr.dataset.obj);
    this.store.setHighlightPart(tr.dataset.key);
  }

  onDblClick(e) {
    const tr = e.target.closest('tr[data-key]');
    if (!tr) return;
    const row = this.store.derived.bom.find((r) => r.sources[0] === tr.dataset.key);
    if (row) this.host.onRenamePart?.(row);
  }
}

function dimensionText(r) {
  if (r.kind === 'profil') return `${fmtLen(r.length)}`;
  if (r.kind === 'plech') return `${fmtLen(r.width)} × ${fmtLen(r.height)} × ${fmtLen(r.thickness, 1)}`;
  return `${fmtLen(r.width)} × ${fmtLen(r.height)}`;
}

function cutCell(r, side) {
  if(r.productionReady===false)return 'Neurčeno';
  if(r.axis3d)return '3D · viz detail';
  if (r.kind !== 'profil') return '–';
  const cut = side === 'L' ? r.cutL : r.cutR;
  return `<span class="cutcell">${cutGlyph(cut, side === 'L' ? 'left' : 'right')}${fmtAngle(cut.angle, 1)}</span>`;
}

function noteText(r) {
  const bits = [];
  if (r.kind === 'plech' && r.holes?.length) {
    const groups = new Map();
    for (const h of r.holes) {
      const k = h.kind === 'circle' ? `Ø${h.d}` : `${h.w}×${h.h}`;
      groups.set(k, (groups.get(k) || 0) + 1);
    }
    bits.push([...groups].map(([k, n]) => `${n}× ${k}`).join(', '));
  }
  if (r.bendGeometry) {
    bits.push(`ohyby ${r.bendGeometry.segments.join('/')} mm @ ${r.bendGeometry.bends.map((b) => Math.abs(b) + '°').join('/')}`);
  }
  if (r.note) bits.push(r.note);
  return bits.join(' · ');
}

export { dimensionText, noteText };
