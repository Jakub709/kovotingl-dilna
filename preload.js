'use strict';
/** Můstek mezi rendererem a hlavním procesem. Renderer nemá přímý přístup k Node. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kt', {
  desktop: true,
  /* projekty */
  saveFile: (filePath, data) => ipcRenderer.invoke('file:save', { filePath, data }),
  saveDialog: (defaultName) => ipcRenderer.invoke('file:saveDialog', { defaultName }),
  openDialog: () => ipcRenderer.invoke('file:openDialog'),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),

  /* zálohy */
  backupWrite: (name, data) => ipcRenderer.invoke('backup:write', { name, data }),
  backupList: () => ipcRenderer.invoke('backup:list'),
  backupClear: (name) => ipcRenderer.invoke('backup:clear', name),

  /* materiály */
  materialsLoad: () => ipcRenderer.invoke('materials:load'),
  materialsSave: (data) => ipcRenderer.invoke('materials:save', data),

  /* výstupy */
  exportPdf: (html, landscape, defaultName) => ipcRenderer.invoke('pdf:export', { html, landscape, defaultName }),
  printReport: (html, landscape) => ipcRenderer.invoke('pdf:print', { html, landscape }),

  /* systém */
  openPath: (which) => ipcRenderer.invoke('shell:openPath', which),
  appInfo: () => ipcRenderer.invoke('app:info'),
  messageBox: (opts) => ipcRenderer.invoke('dialog:message', opts),
  log: (level, message) => ipcRenderer.invoke('app:log', { level, message }),
  pendingOpen: () => ipcRenderer.invoke('app:pendingOpen'),
  setTitle: (title) => ipcRenderer.invoke('app:setTitle', title),
  confirmQuit: (ok) => ipcRenderer.send('app:confirm-quit', ok),

  /* události z hlavního procesu */
  onMenu: (cb) => ipcRenderer.on('menu:command', (_e, id) => cb(id)),
  onBeforeQuit: (cb) => ipcRenderer.on('app:before-quit', () => cb()),
  onOpenFile: (cb) => ipcRenderer.on('app:open-file', (_e, p) => cb(p)),
});
