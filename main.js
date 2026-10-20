'use strict';
/**
 * KovoTingl Dílna – hlavní proces (Electron).
 * Zodpovídá za okno, nabídku, souborové operace (atomický zápis, autozáloha)
 * a tisk / export do PDF.
 */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const {randomUUID} = require('crypto');

app.setName('KovoTingl Dilna');
app.setPath('userData', process.env.KOVO_TEST_DATA || path.join(app.getPath('appData'), 'KovoTingl-Dilna'));
const IS_DEV = process.argv.includes('--dev');
const PROJECT_EXT = 'kov';
// app.getVersion() vrací verzi Electronu, pokud se spouští skript mimo kořen
// projektu – verzi programu proto čteme přímo z package.json.
const APP_VERSION = (() => {
  try {
    return require(path.join(__dirname, 'package.json')).version;
  } catch {
    return app.getVersion();
  }
})();

const userDataDir = () => app.getPath('userData');
const backupDir = () => path.join(userDataDir(), 'zalohy');
const materialsFile = () => path.join(userDataDir(), 'materialy.json');
const logFile = () => path.join(userDataDir(), 'kovotingl.log');

let mainWindow = null;
/** Cesta k souboru čekající na otevření (dvojklik na .kov). */
let pendingOpenPath = filePathFromArgv(process.argv);

function filePathFromArgv(argv) {
  const hit = argv.slice(1).find((a) => a.toLowerCase().endsWith('.' + PROJECT_EXT));
  return hit && fs.existsSync(hit) ? hit : null;
}

/* ------------------------------------------------------------------ log --- */

function logLine(level, message) {
  const line = `${new Date().toISOString()} [${level}] ${message}\n`;
  try {
    fs.mkdirSync(userDataDir(), { recursive: true });
    fs.appendFileSync(logFile(), line);
  } catch {
    /* logování nesmí shodit aplikaci */
  }
  if (IS_DEV) process.stdout.write(line);
}

process.on('uncaughtException', (err) => {
  logLine('FATAL', `${err && err.stack ? err.stack : err}`);
});
process.on('unhandledRejection', (err) => {
  logLine('FATAL', `unhandledRejection: ${err && err.stack ? err.stack : err}`);
});

/* --------------------------------------------------------------- okno ---- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1000,
    minWidth: 1000,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f6f9',
    title: 'KovoTingl Dílna',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  // Zavření okna se nejdřív zeptá rendereru na neuložené změny.
  let allowClose = false;
  mainWindow.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    mainWindow.webContents.send('app:before-quit');
    ipcMain.once('app:confirm-quit', (_e, ok) => {
      if (ok) {
        allowClose = true;
        mainWindow.close();
      }
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* -------------------------------------------------------------- nabídka -- */

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function buildMenu() {
  const cmd = (id) => () => send('menu:command', id);
  const template = [
    {
      label: 'Soubor',
      submenu: [
        { label: 'Nový projekt', accelerator: 'CmdOrCtrl+N', click: cmd('file.new') },
        { label: 'Otevřít projekt…', accelerator: 'CmdOrCtrl+O', click: cmd('file.open') },
        { type: 'separator' },
        { label: 'Uložit', accelerator: 'CmdOrCtrl+S', click: cmd('file.save') },
        { label: 'Uložit jako…', accelerator: 'CmdOrCtrl+Shift+S', click: cmd('file.saveAs') },
        { type: 'separator' },
        { label: 'Složka projektů…', click: cmd('file.revealData') },
        { type: 'separator' },
        { label: 'Konec', role: 'quit', label: 'Konec' },
      ],
    },
    {
      label: 'Úpravy',
      submenu: [
        { label: 'Zpět', accelerator: 'CmdOrCtrl+Z', click: cmd('edit.undo') },
        { label: 'Znovu', accelerator: 'CmdOrCtrl+Y', click: cmd('edit.redo') },
        { type: 'separator' },
        { label: 'Duplikovat', accelerator: 'CmdOrCtrl+D', click: cmd('edit.duplicate') },
        { label: 'Odstranit', accelerator: 'Delete', click: cmd('edit.delete') },
        { type: 'separator' },
        { label: 'Vybrat vše', accelerator: 'CmdOrCtrl+A', click: cmd('edit.selectAll') },
        { label: 'Seskupit do sestavy', accelerator: 'CmdOrCtrl+G', click: cmd('edit.group') },
        { label: 'Zrušit seskupení', accelerator: 'CmdOrCtrl+Shift+G', click: cmd('edit.ungroup') },
      ],
    },
    {
      label: 'Zobrazení',
      submenu: [
        { label: '2D výkres', accelerator: 'F2', click: cmd('view.2d') },
        { label: '3D náhled', accelerator: 'F3', click: cmd('view.3d') },
        { type: 'separator' },
        { label: 'Přizpůsobit pohled', click: cmd('view.fit') },
        { label: 'Přiblížit', accelerator: 'CmdOrCtrl+Plus', click: cmd('view.zoomIn') },
        { label: 'Oddálit', accelerator: 'CmdOrCtrl+-', click: cmd('view.zoomOut') },
        { type: 'separator' },
        { label: 'Mřížka', click: cmd('view.grid') },
        { label: 'Přichytávání', click: cmd('view.snap') },
        { label: 'Kóty', click: cmd('view.dims') },
        { type: 'separator' },
        { label: 'Celá obrazovka', role: 'togglefullscreen' },
        ...(IS_DEV ? [{ label: 'Nástroje vývojáře', role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Projekt',
      submenu: [
        { label: 'Vlastnosti projektu…', click: cmd('project.settings') },
        { label: 'Nastavení nářezu…', click: cmd('project.cutSettings') },
        { type: 'separator' },
        { label: 'Přepočítat a zkontrolovat', accelerator: 'F5', click: cmd('project.revalidate') },
      ],
    },
    {
      label: 'Materiály',
      submenu: [
        { label: 'Databáze materiálů…', accelerator: 'CmdOrCtrl+M', click: cmd('materials.open') },
        { type: 'separator' },
        { label: 'Obnovit výchozí katalog', click: cmd('materials.reset') },
      ],
    },
    {
      label: 'Výstupy',
      submenu: [
        { label: 'Kusovník', accelerator: 'CmdOrCtrl+B', click: cmd('out.bom') },
        { label: 'Nářezový plán', accelerator: 'CmdOrCtrl+R', click: cmd('out.cut') },
        { type: 'separator' },
        { label: 'PDF – výkres', click: cmd('pdf.drawing') },
        { label: 'PDF – kusovník', click: cmd('pdf.bom') },
        { label: 'PDF – nářezový plán', click: cmd('pdf.cut') },
        { label: 'PDF – kompletní dokumentace', click: cmd('pdf.all') },
        { type: 'separator' },
        { label: 'Tisk…', accelerator: 'CmdOrCtrl+P', click: cmd('print.all') },
      ],
    },
    {
      label: 'Nápověda',
      submenu: [
        { label: 'Rychlý průvodce', accelerator: 'F1', click: cmd('help.guide') },
        { label: 'Klávesové zkratky', click: cmd('help.keys') },
        { type: 'separator' },
        { label: 'Otevřít soubor protokolu', click: cmd('help.log') },
        { label: 'O programu', click: cmd('help.about') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------- souborové operace ----- */

/** Atomický zápis: dočasný soubor + fsync + rename (§18). */
async function atomicWrite(filePath, contents) {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.writeFile(contents, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fsp.rename(tmp, filePath);
}

ipcMain.handle('file:save', async (_e, { filePath, data }) => {
  try {
    await atomicWrite(filePath, data);
    logLine('INFO', `uloženo ${filePath}`);
    return { ok: true, filePath };
  } catch (err) {
    logLine('ERROR', `uložení selhalo: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('file:saveDialog', async (_e, { defaultName }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Uložit projekt',
    defaultPath: path.join(app.getPath('documents'), 'KovoTingl', (defaultName || 'projekt') + '.' + PROJECT_EXT),
    filters: [{ name: 'KovoTingl projekt', extensions: [PROJECT_EXT] }],
  });
  return res.canceled ? { ok: false } : { ok: true, filePath: res.filePath };
});

ipcMain.handle('model:export', async (_e, { data, defaultName, format='obj' }) => {
  try {
    if(!['obj','step'].includes(format))throw Error('Neplatný formát exportu.');
    if(typeof data!=='string'||Buffer.byteLength(data,'utf8')>64*1024*1024||!(format==='step'?data.startsWith('ISO-10303-21;'):data.startsWith('# KovoTingl')))throw Error('Neplatná data 3D modelu nebo překročení limitu 64 MB.');
    const name=String(defaultName||'model').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100);
    const res=await dialog.showSaveDialog(mainWindow,{title:'Exportovat 3D model (milimetry)',defaultPath:path.join(app.getPath('documents'),name+'.'+format),filters:[{name:format==='step'?'STEP ploškový povrch':'3D model OBJ',extensions:[format]}]});
    if(res.canceled||!res.filePath)return {ok:false};
    await atomicWrite(res.filePath,data);return {ok:true,filePath:res.filePath};
  }catch(err){return {ok:false,error:err.message};}
});

ipcMain.handle('file:openDialog', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Otevřít projekt',
    defaultPath: path.join(app.getPath('documents'), 'KovoTingl'),
    filters: [{ name: 'KovoTingl projekt', extensions: [PROJECT_EXT] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false };
  return readProject(res.filePaths[0]);
});

async function readProject(filePath) {
  try {
    const data = await fsp.readFile(filePath, 'utf8');
    logLine('INFO', `otevřeno ${filePath}`);
    return { ok: true, filePath, data };
  } catch (err) {
    logLine('ERROR', `otevření selhalo: ${err.message}`);
    return { ok: false, error: err.message };
  }
}
ipcMain.handle('file:read', (_e, filePath) => readProject(filePath));

/* ------------------------------------------------------------ autozáloha - */

ipcMain.handle('backup:write', async (_e, { name, data }) => {
  try {
    const safe = String(name || 'projekt').replace(/[^\w\-. ]+/g, '_');
    await atomicWrite(path.join(backupDir(), `${safe}.autosave.json`), data);
    return { ok: true };
  } catch (err) {
    logLine('WARN', `autozáloha selhala: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('backup:list', async () => {
  try {
    const dir = backupDir();
    await fsp.mkdir(dir, { recursive: true });
    const names = (await fsp.readdir(dir)).filter((n) => n.endsWith('.autosave.json'));
    const out = [];
    for (const n of names) {
      const st = await fsp.stat(path.join(dir, n));
      out.push({ name: n, path: path.join(dir, n), mtime: st.mtimeMs, size: st.size });
    }
    out.sort((a, b) => b.mtime - a.mtime);
    return { ok: true, items: out };
  } catch (err) {
    return { ok: false, error: err.message, items: [] };
  }
});

ipcMain.handle('backup:clear', async (_e, name) => {
  try {
    const safe = String(name || 'projekt').replace(/[^\w\-. ]+/g, '_');
    await fsp.rm(path.join(backupDir(), `${safe}.autosave.json`), { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* -------------------------------------------------- databáze materiálů --- */

ipcMain.handle('materials:load', async () => {
  try {
    const data = await fsp.readFile(materialsFile(), 'utf8');
    return { ok: true, data };
  } catch {
    return { ok: false }; // renderer použije výchozí katalog
  }
});

ipcMain.handle('materials:save', async (_e, data) => {
  try {
    await atomicWrite(materialsFile(), data);
    return { ok: true };
  } catch (err) {
    logLine('ERROR', `uložení materiálů selhalo: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

/* ------------------------------------------------------------ PDF / tisk - */

/**
 * Vykreslí předaný HTML dokument v skryté offscreen stránce a uloží PDF.
 * Tisk používá stejnou stránku, takže tištěná i exportovaná podoba je totožná (§19).
 */
async function renderReport(html, { landscape = false, toPrinter = false, filePath = null }) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: true, contextIsolation: true },
  });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    // Necháme dokreslit vložené <canvas>/fonty.
    await new Promise((r) => setTimeout(r, 350));

    if (toPrinter) {
      await new Promise((resolve, reject) => {
        win.webContents.print({ silent: false, printBackground: true, landscape }, (ok, reason) =>
          ok || reason === 'cancelled' ? resolve() : reject(new Error(reason))
        );
      });
      return { ok: true, printed: true };
    }

    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      landscape,
      pageSize: 'A4',
      margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      preferCSSPageSize: true,
    });
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, pdf);
    return { ok: true, filePath };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

ipcMain.handle('pdf:export', async (_e, { html, landscape, defaultName }) => {
  try {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Export do PDF',
      defaultPath: path.join(app.getPath('documents'), 'KovoTingl', (defaultName || 'vystup') + '.pdf'),
      filters: [{ name: 'PDF dokument', extensions: ['pdf'] }],
    });
    if (res.canceled) return { ok: false, canceled: true };
    const out = await renderReport(html, { landscape, filePath: res.filePath });
    logLine('INFO', `PDF ${res.filePath}`);
    return out;
  } catch (err) {
    logLine('ERROR', `PDF selhalo: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('pdf:print', async (_e, { html, landscape }) => {
  try {
    return await renderReport(html, { landscape, toPrinter: true });
  } catch (err) {
    logLine('ERROR', `tisk selhal: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('shell:openPath', async (_e, which) => {
  const target =
    which === 'log' ? logFile() : which === 'data' ? userDataDir() : path.join(app.getPath('documents'), 'KovoTingl');
  await fsp.mkdir(path.dirname(target), { recursive: true }).catch(() => {});
  if (which === 'log') shell.showItemInFolder(target);
  else shell.openPath(target);
  return { ok: true };
});

ipcMain.handle('app:info', () => ({
  version: APP_VERSION,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: `${os.type()} ${os.release()}`,
  userData: userDataDir(),
  documents: path.join(app.getPath('documents'), 'KovoTingl'),
  log: logFile(),
}));

ipcMain.handle('dialog:message', async (_e, opts) => {
  const res = await dialog.showMessageBox(mainWindow, {
    type: opts.type || 'question',
    buttons: opts.buttons || ['OK'],
    defaultId: opts.defaultId ?? 0,
    cancelId: opts.cancelId ?? opts.buttons?.length - 1 ?? 0,
    title: opts.title || 'KovoTingl Dílna',
    message: opts.message || '',
    detail: opts.detail || '',
    noLink: true,
  });
  return res.response;
});

ipcMain.handle('app:log', (_e, { level, message }) => {
  logLine(level || 'INFO', message);
  return { ok: true };
});

ipcMain.handle('app:pendingOpen', () => {
  const p = pendingOpenPath;
  pendingOpenPath = null;
  return p;
});

ipcMain.handle('app:setTitle', (_e, title) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(title);
  return { ok: true };
});

/* ------------------------------------------------------------- životní --- */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const p = filePathFromArgv(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (p) send('app:open-file', p);
    }
  });

  app.whenReady().then(() => {
    logLine('INFO', `start KovoTingl Dílna ${APP_VERSION}`);
    buildMenu();
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
