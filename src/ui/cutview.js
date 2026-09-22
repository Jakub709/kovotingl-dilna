/**
 * Panel nářezového plánu (§16). Díly lze mezi tyčemi ručně přesouvat
 * a rozložení uzamknout (FR-CUT-006).
 */
import { fmtLen, fmtPercent } from '../core/units.js';
import { barSVG, cutLegendHTML, planSummaryText } from './cutdraw.js';
import { movePiece, reorderPiece, unlockPlan } from '../core/cutplan.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class CutView {
  constructor(el, store, host) {
    this.el = el;
    this.store = store;
    this.host = host;
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('mouseover', (e) => this.onHover(e));
    store.subscribe(() => this.render());
  }

  render() {
    const plans = this.store.derived.plans;
    if (!plans.length) {
      this.el.innerHTML =
        '<div class="empty">Nářezový plán se vytvoří, jakmile budou v projektu profilové díly s materiálem.<br>' +
        'Plechy a pletivo se z tyčí neřežou, proto zde nejsou.</div>';
      return;
    }

    const html = plans.map((plan) => this.planHTML(plan)).join('');
    this.el.innerHTML = html + `<div class="cut-legend">${cutLegendHTML()}</div>`;
  }

  planHTML(plan) {
    const bars = plan.bars
      .map(
        (bar, i) => `
      <div class="cut-bar-row" data-mat="${esc(plan.materialId)}" data-bar="${i}">
        <div class="cut-bar-label">
          <b>Tyč ${i + 1}</b><br>${fmtLen(plan.stockLength)} mm
          ${bar.manual ? '<br><span class="pill">ručně</span>' : ''}
          ${bar.overlong ? '<br><span class="pill err">nevejde se</span>' : ''}
        </div>
        <div class="cut-bar-canvas">${barSVG(bar, plan)}</div>
        <div class="cut-util">${fmtPercent(bar.utilization, 0)}</div>
      </div>`
      )
      .join('');

    return `<div class="cut-mat" data-mat="${esc(plan.materialId)}">
      <div class="cut-mat-head">
        <span class="cut-mat-name">${esc(plan.materialName)}</span>
        <span class="cut-mat-info">${planSummaryText(plan)}</span>
        ${plan.locked ? '<span class="pill warn">ruční rozložení</span>' : ''}
        ${plan.hasOverlong ? '<span class="pill err">díl delší než tyč</span>' : ''}
      </div>
      ${bars}
    </div>`;
  }

  onHover(e) {
    const piece = e.target.closest('.cut-piece');
    if (piece) this.store.setHighlightPart(piece.dataset.part);
  }

  onClick(e) {
    const piece = e.target.closest('.cut-piece');
    if (!piece) return;
    const key = piece.dataset.part;
    const part = this.store.partByKey(key);
    if (part) {
      this.store.select(part.objectId);
      this.store.setHighlightPart(key);
    }
    const row = piece.closest('.cut-bar-row');
    if (row && e.shiftKey) this.host.onMovePiece?.(row.dataset.mat, key);
  }

  /** Přesune díl na jinou tyč a rozložení uzamkne. */
  movePieceTo(materialId, partKey, barIndex) {
    const plan = this.store.derived.plans.find((p) => p.materialId === materialId);
    if (!plan) return false;
    let ok = false;
    this.store.commit('Ruční přesun dílu v nářezu', () => {
      ok = movePiece(this.store.project, plan, partKey, barIndex);
    });
    return ok;
  }

  reorder(materialId, partKey, delta) {
    const plan = this.store.derived.plans.find((p) => p.materialId === materialId);
    if (!plan) return false;
    let ok = false;
    this.store.commit('Změna pořadí dílů na tyči', () => {
      ok = reorderPiece(this.store.project, plan, partKey, delta);
    });
    return ok;
  }

  unlockAll() {
    const ids = this.store.derived.plans.map((p) => p.materialId);
    this.store.commit('Obnovení automatického nářezu', (p) => {
      for (const id of ids) unlockPlan(p, id);
    });
  }
}
