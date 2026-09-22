/**
 * Náhrada za můstek do Electronu, když se stránka otevře v běžném prohlížeči.
 * Slouží k rychlému náhledu a testování; ostrý provoz běží v Electronu,
 * kde soubory zajišťuje hlavní proces (atomický zápis, zálohy, PDF).
 */
const LS = {
  materials: 'kt.materials',
  backup: 'kt.backup',
};

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function pickFile() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.kov,application/json';
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0];
      if (!f) return resolve({ ok: false });
      resolve({ ok: true, filePath: f.name, data: await f.text() });
    });
    inp.click();
  });
}

window.kt = {
  saveFile: async (filePath, data) => {
    download(filePath || 'projekt.kov', new Blob([data], { type: 'application/json' }));
    return { ok: true, filePath };
  },
  saveDialog: async (defaultName) => ({ ok: true, filePath: `${defaultName || 'projekt'}.kov` }),
  openDialog: () => pickFile(),
  readFile: async () => ({ ok: false, error: 'V prohlížeči lze soubor jen vybrat ručně.' }),

  backupWrite: async (name, data) => {
    try {
      localStorage.setItem(LS.backup, JSON.stringify({ name, data, mtime: Date.now() }));
    } catch {
      /* plné úložiště – záloha není kritická */
    }
    return { ok: true };
  },
  backupList: async () => {
    const raw = localStorage.getItem(LS.backup);
    if (!raw) return { ok: true, items: [] };
    const b = JSON.parse(raw);
    return { ok: true, items: [{ name: `${b.name}.autosave.json`, path: 'ls', mtime: b.mtime, size: b.data.length }] };
  },
  backupClear: async () => {
    localStorage.removeItem(LS.backup);
    return { ok: true };
  },

  materialsLoad: async () => {
    const data = localStorage.getItem(LS.materials);
    return data ? { ok: true, data } : { ok: false };
  },
  materialsSave: async (data) => {
    localStorage.setItem(LS.materials, data);
    return { ok: true };
  },

  exportPdf: async (html) => {
    const w = window.open('', '_blank');
    if (!w) return { ok: false, error: 'Prohlížeč zablokoval nové okno.' };
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
    return { ok: true };
  },
  printReport: (html) => window.kt.exportPdf(html),

  openPath: async () => ({ ok: true }),
  appInfo: async () => ({
    version: '1.0.0 (náhled v prohlížeči)',
    electron: '–',
    chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || '–',
    node: '–',
    platform: navigator.platform,
    userData: '(prohlížeč – localStorage)',
    documents: '(stahování prohlížeče)',
    log: '(konzole prohlížeče)',
  }),
  messageBox: async (opts) => {
    const txt = `${opts.message}\n\n${opts.detail || ''}`;
    if ((opts.buttons || []).length <= 2) return window.confirm(txt) ? 0 : 1;
    return window.confirm(`${txt}\n\nOK = ${opts.buttons[0]}, Zrušit = ${opts.buttons[opts.buttons.length - 1]}`)
      ? 0
      : opts.buttons.length - 1;
  },
  log: async (level, message) => {
    console[level === 'ERROR' ? 'error' : 'log'](`[${level}] ${message}`);
    return { ok: true };
  },
  pendingOpen: async () => null,
  setTitle: async (t) => {
    document.title = t;
    return { ok: true };
  },
  confirmQuit: () => {},
  onMenu: () => {},
  onBeforeQuit: () => {},
  onOpenFile: () => {},
};

console.info('KovoTingl CAD běží v režimu náhledu v prohlížeči (bez Electronu).');
