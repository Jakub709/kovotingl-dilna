/**
 * Grafika nářezového plánu (§16.2, §16.3).
 *
 * Vše se kreslí jako SVG, takže stejný kód slouží pro obrazovku i pro PDF
 * a tisk vypadá shodně s náhledem (§19).
 *
 * Poznámka ke kreslení úhlů: tyč 6000 mm a profil 40 mm nelze zobrazit ve
 * společném měřítku. Sklon řezu se proto kreslí symbolicky – vždy ve správném
 * směru – a přesná hodnota je vypsaná číslem pod koncem dílu.
 */
import { deviationOf } from '../core/build.js';
import { fmtLen, fmtAngle, fmtPercent } from '../core/units.js';

const W = 1000; // šířka výkresu tyče v jednotkách viewBoxu
const BAR_TOP = 44;
const BAR_H = 34;
const BAR_BOT = BAR_TOP + BAR_H;
const SLANT = 7; // symbolický sklon šikmého řezu
const TOTAL_H = 112;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Vodorovné posunutí horní/dolní hrany na jednom konci dílu. */
function slantOf(cut, atStart) {
  if(cut?.spatial)return {top:0,bottom:0};
  const dev = deviationOf(cut);
  if (Math.abs(dev) < 0.05) return { top: 0, bottom: 0 };
  const o = cut.orient || 0;
  if (o === 0) return { top: 0, bottom: 0 };
  // orient +1 = delší je horní hrana
  const sign = atStart ? -1 : 1;
  return o > 0 ? { top: sign * SLANT, bottom: -sign * SLANT } : { top: -sign * SLANT, bottom: sign * SLANT };
}

/**
 * Vykreslí jednu skladovou tyč.
 * @param {object} bar  tyč z buildCutPlans()
 * @param {object} plan plán materiálu
 * @param {{showNames?:boolean, compact?:boolean}} opts
 * @returns {string} SVG
 */
export function barSVG(bar, plan, opts = {}) {
  const stock = plan.stockLength || bar.stock || 6000;
  const kerf = plan.kerf || 0;
  const gaps = Math.max(0, bar.pieces.filter((p) => p.kerfBefore > 0).length);

  // Prořez musí být vidět i na dlouhé tyči – dostane minimální šířku.
  const rawScale = W / stock;
  const minGap = 3;
  const extraPerGap = Math.max(0, minGap - kerf * rawScale);
  const scale = (W - gaps * extraPerGap) / stock;

  const xOf = (mm, gapsBefore) => mm * scale + gapsBefore * extraPerGap;

  const parts = [];
  const labels = [];
  const angles = [];
  let gapsBefore = 0;

  parts.push(
    `<rect x="0" y="${BAR_TOP}" width="${W}" height="${BAR_H}" fill="#f4f6f9" stroke="#c3ccd6" stroke-width="1"/>`
  );

  bar.pieces.forEach((piece, i) => {
    if (piece.kerfBefore > 0) gapsBefore += 1;
    const x0 = xOf(piece.start, gapsBefore);
    const x1 = xOf(piece.end, gapsBefore);
    const sA = slantOf(piece.part.cutL, true);
    const sB = slantOf(piece.part.cutR, false);

    const poly = [
      [x0 + sA.top, BAR_TOP],
      [x1 + sB.top, BAR_TOP],
      [x1 + sB.bottom, BAR_BOT],
      [x0 + sA.bottom, BAR_BOT],
    ]
      .map(([x, y]) => `${round(x)},${y}`)
      .join(' ');

    const color = i % 2 === 0 ? '#b9c8d8' : '#a9bacd';
    parts.push(
      `<polygon points="${poly}" fill="${color}" stroke="#4d5966" stroke-width="1.2"
        data-part="${esc(piece.key)}" class="cut-piece"><title>${esc(piece.part.name)} – ${fmtLen(
        piece.length
      )} mm</title></polygon>`
    );

    // Prořez jako úzká mezera se šrafou.
    if (piece.kerfBefore > 0) {
      const gx0 = xOf(piece.start - piece.kerfBefore, gapsBefore - 1);
      const gx1 = x0;
      parts.push(
        `<rect x="${round(gx0)}" y="${BAR_TOP}" width="${round(Math.max(gx1 - gx0, 1.2))}" height="${BAR_H}"
           fill="url(#kerfHatch)" stroke="none"/>`
      );
    }
    if (piece.sharedWithPrev) {
      parts.push(
        `<text x="${round(x0)}" y="${BAR_TOP - 2}" font-size="10" fill="#1c7c4a" text-anchor="middle">společný řez</text>`
      );
    }

    // Popis nad dílem: název a délka (§16.3).
    const cx = (x0 + x1) / 2;
    const wide = x1 - x0;
    if (wide > 44) {
      labels.push(
        `<text x="${round(cx)}" y="16" font-size="12" font-weight="600" text-anchor="middle" fill="#1c2530">${esc(
          shorten(piece.part.name, wide)
        )}</text>`,
        `<text x="${round(cx)}" y="31" font-size="12" text-anchor="middle" fill="#5d6b7a">${fmtLen(
          piece.length
        )}</text>`
      );
    } else if (wide > 16) {
      labels.push(
        `<text x="${round(cx)}" y="31" font-size="11" text-anchor="middle" fill="#5d6b7a">${fmtLen(
          piece.length
        )}</text>`
      );
    }

    // Úhly pod konci dílu.
    const aTxt = piece.part.axis3d ? '3D detail' : fmtAngle(piece.part.cutL.angle, 1);
    const bTxt = piece.part.axis3d ? '3D detail' : fmtAngle(piece.part.cutR.angle, 1);
    angles.push(
      `<text x="${round(x0 + 1)}" y="${BAR_BOT + 14}" font-size="11" text-anchor="start" fill="${
        deviationOf(piece.part.cutL) ? '#b5761a' : '#5d6b7a'
      }">${aTxt}</text>`
    );
    if (wide > 40) {
      angles.push(
        `<text x="${round(x1 - 1)}" y="${BAR_BOT + 14}" font-size="11" text-anchor="end" fill="${
          deviationOf(piece.part.cutR) ? '#b5761a' : '#5d6b7a'
        }">${bTxt}</text>`
      );
    }

    // Šipka lokálního směru dílu (§16.3).
    if (wide > 70 && opts.showDirection !== false) {
      const ax0 = cx - 13;
      const ax1 = cx + 13;
      const ay = BAR_TOP + BAR_H / 2;
      parts.push(
        `<g opacity="0.55"><line x1="${round(ax0)}" y1="${ay}" x2="${round(ax1)}" y2="${ay}"
           stroke="#37424f" stroke-width="1"/>
         <polygon points="${round(ax1)},${ay} ${round(ax1 - 5)},${ay - 2.6} ${round(ax1 - 5)},${ay + 2.6}"
           fill="#37424f"/></g>`
      );
    }
  });

  // Zbytek tyče.
  if (bar.remainder > 0.5) {
    const rx = xOf(bar.used, gapsBefore);
    parts.push(
      `<rect x="${round(rx)}" y="${BAR_TOP}" width="${round(W - rx)}" height="${BAR_H}"
         fill="url(#restHatch)" stroke="#c3ccd6" stroke-width="1"/>`,
      `<text x="${round(Math.min(W - 3, rx + (W - rx) / 2))}" y="${BAR_TOP + BAR_H / 2 + 4}" font-size="11"
         text-anchor="middle" fill="#5d6b7a">zbytek ${fmtLen(bar.remainder)}</text>`
    );
  }

  const title = bar.overlong
    ? `<text x="0" y="${TOTAL_H - 2}" font-size="11" fill="#c0392b">Díl je delší než skladová tyč – nelze naříznout.</text>`
    : '';

  return `<svg viewBox="0 0 ${W} ${TOTAL_H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"
     class="bar-svg" style="width:100%;height:100%">
  <defs>
    <pattern id="kerfHatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="4" height="4" fill="#e2b98a"/>
      <line x1="0" y1="0" x2="0" y2="4" stroke="#b5761a" stroke-width="1.6"/>
    </pattern>
    <pattern id="restHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="7" height="7" fill="#eef1f5"/>
      <line x1="0" y1="0" x2="0" y2="7" stroke="#c3ccd6" stroke-width="1.4"/>
    </pattern>
  </defs>
  ${parts.join('\n  ')}
  ${labels.join('\n  ')}
  ${angles.join('\n  ')}
  ${title}
</svg>`;
}

/**
 * Malý symbol tvaru řezu pro tabulku kusovníku.
 * Sklon musí souhlasit s kresbou tyče – proto vychází ze stejné funkce slantOf.
 */
export function cutGlyph(cut, side = 'left') {
  if(cut?.spatial)return '3D · ';
  const s = slantOf(cut, side === 'left');
  const scale = 4 / SLANT;
  const d =
    s.top === 0 && s.bottom === 0
      ? 'M8 2 L8 16'
      : `M${8 + s.top * scale} 2 L${8 + s.bottom * scale} 16`;
  return `<svg width="16" height="18" viewBox="0 0 16 18" style="vertical-align:-4px">
    <rect x="1" y="2" width="14" height="14" fill="#eef1f5" stroke="#c3ccd6" stroke-width="0.8"/>
    <path d="${d}" stroke="#37424f" stroke-width="1.8" fill="none"/></svg>`;
}

/** Detailní náhled jednoho dílu s oběma řezy (panel vlastností, §16.3). */
export function pieceDetailSVG(part) {
  const w = 300;
  const h = 66;
  const top = 18;
  const bot = 48;
  const x0 = 40;
  const x1 = w - 40;
  const sA = slantOf(part.cutL, true);
  const sB = slantOf(part.cutR, false);
  const k = 1.6; // zvýrazněný sklon v detailu

  const poly = [
    [x0 + sA.top * k, top],
    [x1 + sB.top * k, top],
    [x1 + sB.bottom * k, bot],
    [x0 + sA.bottom * k, bot],
  ]
    .map(([x, y]) => `${round(x)},${y}`)
    .join(' ');

  return `<svg viewBox="0 0 ${w} ${h}" class="cut-preview" xmlns="http://www.w3.org/2000/svg">
    <polygon points="${poly}" fill="#c8d4e0" stroke="#4d5966" stroke-width="1.4"/>
    <line x1="${x0 - 26}" y1="${(top + bot) / 2}" x2="${x1 + 26}" y2="${(top + bot) / 2}"
      stroke="#7e8b99" stroke-width="0.8" stroke-dasharray="5 3"/>
    <polygon points="${x1 + 26},${(top + bot) / 2} ${x1 + 19},${(top + bot) / 2 - 3.2} ${x1 + 19},${
    (top + bot) / 2 + 3.2
  }" fill="#7e8b99"/>
    <text x="${x0 - 4}" y="12" font-size="11" text-anchor="end" fill="#5d6b7a">levý</text>
    <text x="${x1 + 4}" y="12" font-size="11" text-anchor="start" fill="#5d6b7a">pravý</text>
    <text x="${x0 - 4}" y="${bot + 14}" font-size="12" font-weight="600" text-anchor="end"
      fill="#1c2530">${part.axis3d?'3D detail':fmtAngle(part.cutL.angle, 1)}</text>
    <text x="${x1 + 4}" y="${bot + 14}" font-size="12" font-weight="600" text-anchor="start"
      fill="#1c2530">${part.axis3d?'3D detail':fmtAngle(part.cutR.angle, 1)}</text>
    <text x="${w / 2}" y="${bot + 14}" font-size="11" text-anchor="middle" fill="#5d6b7a">${fmtLen(
    part.length
  )} mm</text>
  </svg>`;
}

/** Legenda pod nářezovým plánem. */
export function cutLegendHTML() {
  return `
    <span><svg width="22" height="16"><rect x="1" y="1" width="20" height="14" fill="#b9c8d8" stroke="#4d5966"/>
      <line x1="11" y1="1" x2="11" y2="15" stroke="#37424f" stroke-width="1.6"/></svg> 90° řez rovný</span>
    <span><svg width="22" height="16"><rect x="1" y="1" width="20" height="14" fill="#b9c8d8" stroke="#4d5966"/>
      <line x1="7" y1="1" x2="15" y2="15" stroke="#37424f" stroke-width="1.6"/></svg> 45° řez šikmý</span>
    <span><svg width="22" height="16"><rect x="1" y="1" width="20" height="14" fill="#b9c8d8" stroke="#4d5966"/>
      <line x1="14" y1="1" x2="8" y2="15" stroke="#37424f" stroke-width="1.6"/></svg> vlastní úhlový řez</span>
    <span><svg width="22" height="16"><rect x="1" y="1" width="20" height="14" fill="#e2b98a" stroke="#b5761a"/>
      </svg> prořez pily</span>
    <span><svg width="22" height="16"><rect x="1" y="1" width="20" height="14" fill="#eef1f5" stroke="#c3ccd6"/>
      <line x1="1" y1="15" x2="21" y2="1" stroke="#c3ccd6" stroke-width="1.4"/></svg> zbytek tyče</span>`;
}

/** Souhrnný řádek materiálu. */
export function planSummaryText(plan) {
  return `${plan.barCount}× tyč ${fmtLen(plan.stockLength)} mm · ${plan.totalPieces} dílů · využití ${fmtPercent(
    plan.utilization
  )} · odpad ${fmtLen(plan.waste)} mm`;
}

function round(x) {
  return Math.round(x * 10) / 10;
}

function shorten(name, widthUnits) {
  const max = Math.max(4, Math.floor(widthUnits / 6.2));
  return name.length <= max ? name : name.slice(0, max - 1) + '…';
}
