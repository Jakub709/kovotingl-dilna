/** Jednoduché čárové ikony – žádné externí fonty ani obrázky. */

const S = (body, w = 24) =>
  `<svg viewBox="0 0 ${w} ${w}" fill="none" stroke="currentColor" stroke-width="1.6"
        stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%">${body}</svg>`;

export const ICONS = {
  cube: S('<path d="M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10M7.5 4.5l9 5"/>'),
  new: S('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M12 12v6M9 15h6"/>'),
  open: S('<path d="M3 7h6l2 2h10v10H3z"/><path d="M3 7V5h5l2 2"/>'),
  save: S('<path d="M4 4h13l3 3v13H4z"/><path d="M8 4v6h8V4"/><rect x="8" y="13" width="8" height="7"/>'),
  undo: S('<path d="M4 11h11a5 5 0 0 1 0 10h-3"/><path d="M8 7l-4 4 4 4"/>'),
  redo: S('<path d="M20 11H9a5 5 0 0 0 0 10h3"/><path d="M16 7l4 4-4 4"/>'),
  fit: S('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M8 9v6M16 9v6M8 12h8"/>'),
  bom: S('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M9 9v11M3 14h18"/>'),
  cut: S('<rect x="2" y="9" width="20" height="6" rx="1"/><path d="M9 9v6M15 7l-2 10"/>'),
  pdf: S('<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M9 17v-4h1.6a1.4 1.4 0 0 1 0 2.8H9M14 17v-4h1.4a1.6 1.6 0 0 1 0 4z"/>'),
  warn: S('<path d="M12 3 1.8 20.5h20.4z"/><path d="M12 9v5M12 17.2v.1"/>'),

  cursor: S('<path d="M5 3l14 8-6 1.6L10 19z"/>'),
  pencil: S('<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>'),
  line: S('<path d="M4 19L20 5"/><circle cx="4" cy="19" r="1.6"/><circle cx="20" cy="5" r="1.6"/>'),
  rect: S('<rect x="3.5" y="5.5" width="17" height="13"/><path d="M3.5 8.5h17M3.5 15.5h17"/>'),
  fill: S('<rect x="3.5" y="4.5" width="17" height="15"/><path d="M8 4.5v15M12 4.5v15M16 4.5v15"/>'),
  mesh: S('<rect x="3.5" y="4.5" width="17" height="15"/><path d="M3.5 9.5h17M3.5 14.5h17M8.5 4.5v15M15.5 4.5v15"/>'),
  plate: S('<rect x="3.5" y="6.5" width="17" height="11" rx="1"/><circle cx="7.5" cy="9.5" r="1.2"/><circle cx="16.5" cy="9.5" r="1.2"/><circle cx="7.5" cy="14.5" r="1.2"/><circle cx="16.5" cy="14.5" r="1.2"/>'),
  hole: S('<circle cx="12" cy="12" r="5.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
  wall: S('<path d="M3 20V9l6-4 6 4v11"/><path d="M15 20V13h6v7z"/><path d="M3 20h18"/>'),
  dim: S('<path d="M3 8v8M21 8v8M3 12h18"/><path d="M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  group: S('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
};

/** Doplní ikony do všech prvků s atributem data-ico. */
export function mountIcons(root = document) {
  for (const el of root.querySelectorAll('[data-ico]')) {
    const svg = ICONS[el.dataset.ico];
    if (svg) el.innerHTML = svg;
  }
}
