/**
 * KovoTingl Dílna – propojení modelu, plátna, panelů a výstupů.
 */
import { SimpleWorkspace } from './simple.js';
import { SpatialEditor } from './spatial-editor.js';
import { Store } from '../core/store.js';
import { Project, makeAssembly, cloneObject, makeFill, makeMesh, objectBBox } from '../core/model.js';
import { MaterialLibrary } from '../core/materials.js';
import { Canvas2D } from './canvas2d.js';
import { View3D } from './view3d.js';
import { PropsPanel } from './props.js';
import { BomView } from './bom.js';
import { CutView } from './cutview.js';
import { mountIcons } from './icons.js';
import { buildReport, REPORT_TITLES } from './report.js';
import * as D from './dialogs.js';
import { fmtLen, fmtPercent } from '../core/units.js';
import * as G from '../core/geom.js';

// Mimo Electron (náhled v prohlížeči) doplníme náhradní můstek.
if (!window.kt) await import('./shim.js');

const kt = window.kt;
const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.store = new Store();
    this.modal = new D.Modal();
    this.mode = '2d';
    this.autosaveTimer = null;
    this.appInfo = { version: '1.0.0' };

    mountIcons();
    this.buildHost();
    this.canvas = new Canvas2D($('canvas2d'), this.store, this.host);
    this.view3d = this.create3D($('canvas3d'), this.store, { onPick: () => this.focusSelectedInBom() });
    this.mini3d = this.create3D($('canvasMini3d'), this.store, { interactive: true });
    this.props = new PropsPanel($('propsBody'), this.store, this.host);
    this.bom = new BomView($('bomBody'), this.store, this.host);
    this.cut = new CutView($('cutBody'), this.store, this.host);

    this.mini3d.setEnabled(false);
    this.bindUI();
    this.bindKeys();
    this.bindMenu();
    this.store.subscribe(() => this.syncUI());

    this.simple = new SimpleWorkspace(this);
    this.spatial = new SpatialEditor(this);
    this.ready = this.boot();
  }

  /* ────────────────────────────────────────────── zpětná volání ───── */

  create3D(canvas,store,opts) {
    try {return new View3D(canvas,store,opts)} catch(err) {
      kt.log?.('WARN', '3D není dostupné: '+err.message);
      if (canvas.id==='canvas3d') {
        const msg=document.createElement('div');msg.className='v3d-fallback';msg.textContent='Na tomto počítači není dostupný 3D náhled. Kreslení, výpočty a PDF můžeš dál používat. Pro 3D zkontroluj ovladač grafické karty.';canvas.parentElement.append(msg);canvas.style.display='none';
      }
      return {setEnabled(){},fit(){},resize(){},setEdges(){},setRefVisible(){},setStandardView(){}};
    }
  }
  buildHost() {
    this.host = {
      dimEditorEl: $('dimEditor'),
      dimInputEl: $('dimInput'),
      dimUnitEl: $('dimUnit'),
      onToast: (msg, kind) => this.toast(msg, kind),
      onCursor: (p) => {
        $('stX').textContent = Math.round(p.x);
        $('stY').textContent = Math.round(p.y);
      },
      onZoom: (s) => {
        $('stZoom').textContent = `${Math.round(s * 100)} %`;
      },
      onToolChange: (t) => {
        for (const b of document.querySelectorAll('.tool')) b.classList.toggle('active', b.dataset.tool === t);
        $('stTool').textContent = `Nástroj: ${TOOL_NAMES[t] || t}`;
      },
      onContextMenu: (e, hit) => this.showContextMenu(e, hit),
      onRecognizeChoice: (cands, at, cb) => this.showRecognizePopup(cands, at, cb),
      onOpenDetail: (hit) => {
        this.store.select(hit.objectId);
        if (hit.partKey) this.store.setHighlightPart(hit.partKey);
      },
      onHover: () => {},
      onGroupRequest: () => this.groupSelection(),
      onUngroup: () => this.ungroupSelection(),
      onDelete: () => this.deleteSelection(),
      onDuplicate: () => this.duplicateSelection(),
      onOpenMaterials: () => this.openMaterials(),
      onRenamePart: (row) => D.openRenameDialog(this.modal, this.store, row),
      onAddFill: (frame, dir) => this.addFill(frame, dir),
      onAddMesh: (frame) => this.canvas.placeMeshInFrame(frame),
      onFillToMesh: (fill) => {
        const frame = this.store.project.byId(fill.frameId);
        if (frame) this.canvas.placeMeshInFrame(frame);
      },
      onMeshToFill: (mesh) => {
        const frame = this.store.project.byId(mesh.frameId);
        if (frame) this.addFill(frame, 'v');
        else this.toast('Pletivo není v rámu, výplň nelze vytvořit.', 'warn');
      },
      onMovePiece: (matId, key) => this.movePieceDialog(matId, key),
    };
  }

  /* ───────────────────────────────────────────────────── start ───── */

  async boot() {
    try {
      this.appInfo = await kt.appInfo();
      $('stVersion').textContent = `Verze ${this.appInfo.version}`;
    } catch {
      /* běh mimo Electron – nevadí */
    }

    await this.loadMaterials();
    const recovered = await this.checkRecovery();

    const pending = await kt.pendingOpen?.();
    if (pending) await this.openPath(pending);
    else if (!recovered) this.newProject(true);

    this.canvas.fit();
    this.startAutosave();
    this.simple.start();
    if(this.store.project.objects.some(o=>['member3d','plate3d'].includes(o.type)))this.setMode('3d');
    this.syncUI();

    kt.onOpenFile?.((p) => this.openPath(p));
    kt.onBeforeQuit?.(() => this.confirmQuit());
  }

  async loadMaterials() {
    try {
      const res = await kt.materialsLoad();
      if (res?.ok) this.store.library = MaterialLibrary.fromJSON(res.data);
    } catch (err) {
      kt.log?.('WARN', `načtení materiálů selhalo: ${err.message}`);
    }
  }

  async saveMaterials() {
    try {
      const res = await kt.materialsSave(JSON.stringify(this.store.library.toJSON(), null, 2));
      if (!res?.ok) throw new Error(res?.error || "Zápis selhal");
    } catch (err) {
      this.toast('Databázi materiálů se nepodařilo uložit.', 'err');
    }
  }

  /* ─────────────────────────────────────────────── projekt ────────── */

  newProject(silent = false) {
    const create = () => {
      this.store.setProject(new Project({ name: 'Nový projekt' }), null);
      this.setMode('2d');
      this.canvas.fit();
      this.setTitle();
      if (!silent) this.toast('Nový projekt. Začni nástrojem Kreslení.', 'ok');
    };
    if (silent || !this.store.dirty) return create();
    this.confirmDiscard('Vytvořit nový projekt?', create);
  }

  async openProject() {
    const go = async () => {
      const res = await kt.openDialog();
      if (!res?.ok) return;
      this.loadFrom(res.data, res.filePath);
    };
    if (!this.store.dirty) return go();
    this.confirmDiscard('Otevřít jiný projekt?', go);
  }

  async openPath(filePath, confirmed = false) {
    if (this.store.dirty && !confirmed) return this.confirmDiscard("Otevřít jiný projekt?", () => this.openPath(filePath, true));
    const res = await kt.readFile(filePath);
    if (!res?.ok) {
      this.toast(`Soubor se nepodařilo otevřít: ${res?.error || 'neznámá chyba'}`, 'err');
      return;
    }
    this.loadFrom(res.data, res.filePath);
  }

  loadFrom(data, filePath) {
    try {
      const project = Project.fromJSON(data);
      // Derive in isolation before replacing the user's current document.
      const probe = new Store(); probe.library=this.store.library; probe.setProject(project);
      this.store.setProject(project, filePath);
      this.canvas.fit();
      this.view3d.fit();
      this.setMode(project.objects.some(o=>['member3d','plate3d'].includes(o.type))?'3d':'2d');
      this.setTitle();
      this.toast(`Projekt „${project.name}“ otevřen.`, 'ok');
    } catch (err) {
      this.toast(`Soubor nelze načíst: ${err.message}`, 'err');
      kt.log?.('ERROR', `načtení projektu: ${err.message}`);
    }
  }

  async saveProject(forceDialog = false) {
    let filePath = this.store.filePath;
    if (!filePath || forceDialog) {
      const res = await kt.saveDialog(sanitize(this.store.project.name));
      if (!res?.ok) return false;
      filePath = res.filePath;
    }
    const revision = this.store.revision;
    const projectId = this.store.project.id;
    const data = JSON.stringify(this.store.project.toJSON(), null, 1);
    const res = await kt.saveFile(filePath, data);
    if (!res?.ok) {
      this.toast(`Uložení selhalo: ${res?.error || 'neznámá chyba'}`, 'err');
      return false;
    }
    if (this.store.project.id !== projectId) return false;
    this.store.filePath = filePath;
    if (this.store.revision === revision) {
      this.store.markSaved(filePath);
      await kt.backupClear?.(projectId);
    }
    this.setTitle();
    if (this.store.revision !== revision) { this.toast('Předchozí stav je uložen. Novější změny ještě ulož znovu.', 'warn'); return false; }
    this.toast('Projekt uložen.', 'ok');
    return true;
  }

  setTitle() {
    const name = this.store.project.name || 'Nový projekt';
    const file = this.store.filePath ? ` – ${this.store.filePath.split(/[\\/]/).pop()}` : '';
    kt.setTitle?.(`KovoTingl Dílna – ${name}${file}${this.store.dirty ? ' *' : ''}`);
    $('projTitle').textContent = name;
  }

  /* ── automatické zálohy a obnova (§18) ── */

  startAutosave() {
    clearInterval(this.autosaveTimer);
    this.autosaveTimer = setInterval(() => {
      if (!this.store.dirty) return;
      kt.backupWrite?.(this.store.project.id, JSON.stringify(this.store.project.toJSON()));
    }, 30000);
  }

  async checkRecovery() {
    try {
      const res = await kt.backupList();
      if (!res?.ok || !res.items.length) return;
      const newest = res.items[0];
      const when = new Date(newest.mtime);
      const answer = await kt.messageBox({
        type: 'question',
        title: 'Obnova po neočekávaném ukončení',
        message: 'Našla se automatická záloha neuloženého projektu.',
        detail: `${newest.name.replace('.autosave.json', '')}\nUloženo ${when.toLocaleString('cs-CZ')}\n\nChceš ji obnovit?`,
        buttons: ['Obnovit zálohu', 'Zahodit zálohu', 'Rozhodnout později'],
        defaultId: 0,
        cancelId: 2,
      });
      if (answer === 0) {
        const file = await kt.readFile(newest.path);
        if (file?.ok) {
          this.loadFrom(file.data, null);
          this.store.dirty = true;
          this.toast('Záloha obnovena. Ulož projekt pod vlastním názvem.', 'warn');
          return true;
        }
      } else if (answer === 1) {
        await kt.backupClear(newest.name.replace('.autosave.json', ''));
      }
    } catch (err) {
      kt.log?.('WARN', `obnova selhala: ${err.message}`);
    }
    return false;
  }

  async confirmQuit() {
    if (!this.store.dirty) return kt.confirmQuit(true);
    const answer = await kt.messageBox({
      type: 'warning',
      title: 'Neuložené změny',
      message: `Projekt „${this.store.project.name}“ má neuložené změny.`,
      detail: 'Chceš je před ukončením uložit?',
      buttons: ['Uložit a zavřít', 'Zavřít bez uložení', 'Zrušit'],
      defaultId: 0,
      cancelId: 2,
    });
    if (answer === 0) {
      const ok = await this.saveProject();
      kt.confirmQuit(ok);
    } else kt.confirmQuit(answer === 1);
  }

  async confirmDiscard(question, onYes) {
    const answer = await kt.messageBox({
      type: 'question',
      title: 'Neuložené změny',
      message: question,
      detail: 'Projekt má neuložené změny.',
      buttons: ['Uložit a pokračovat', 'Pokračovat bez uložení', 'Zrušit'],
      defaultId: 0,
      cancelId: 2,
    });
    if (answer === 0) {
      if (await this.saveProject()) onYes();
    } else if (answer === 1) onYes();
  }

  /* ───────────────────────────────────────────── operace s prvky ──── */

  deleteSelection() {
    if(this.store.selectedObjects().some(o=>['member3d','plate3d'].includes(o.type))){this.spatial.remove();return;}
    const ids = this.simple ? this.simple.operationObjects().map(o=>o.id) : [...this.store.selection];
    if (!ids.length) return;
    this.store.commit('Odstranění prvků', (p) => {
      for (const id of ids) p.remove(id);
    });
    this.store.clearSelection();
  }

  duplicateSelection() {
    if(this.store.selectedObjects().some(o=>['member3d','plate3d'].includes(o.type))){this.setMode('3d');this.spatial.repeatDialog();return;}
    const objs = this.simple ? this.simple.operationObjects() : this.store.selectedObjects();
    if (!objs.length) return;
    const newIds = [];
    this.store.commit('Duplikování prvků', (p) => {
      const idMap = new Map();
      const asmMap = new Map();
      for (const o of objs) if (o.assemblyId && !asmMap.has(o.assemblyId)) {
        const a = makeAssembly({name: p.assemblyName(o.assemblyId) + " – kopie"});
        p.assemblies.push(a); asmMap.set(o.assemblyId,a.id);
      }
      const copies = objs.map((o) => {
        const c = cloneObject(o, idMap);
        if (c.assemblyId) c.assemblyId = asmMap.get(c.assemblyId);
        if (c.x != null) c.x += 100;
        if (c.y != null) c.y -= 100;
        if (c.points) c.points = c.points.map((q) => ({ x: q.x + 100, y: q.y - 100 }));
        if (c.holes) c.holes = c.holes.map((h) => ({ ...h, cx: h.cx + 100, cy: h.cy - 100 }));
        return c;
      });
      // Vazby mezi zkopírovanými prvky (výplň → rám) musí ukazovat na kopie.
      for (const c of copies) {
        if (c.frameId && idMap.has(c.frameId)) c.frameId = idMap.get(c.frameId);
        p.add(c);
        newIds.push(c.id);
      }
    });
    this.store.select(newIds);
  }

  groupSelection() {
    const objs = this.store.selectedObjects();
    if (!objs.length) {
      this.toast('Nejdřív označ prvky, které mají tvořit sestavu.', 'warn');
      return;
    }
    D.openGroupDialog(this.modal, this.store, (name) => {
      const asm = makeAssembly({ name });
      this.store.commit('Vytvoření sestavy', (p) => {
        p.assemblies.push(asm);
        for (const o of objs) {
          const t = p.byId(o.id);
          if (t) t.assemblyId = asm.id;
          // Výplně a pletiva rámu patří do stejné sestavy.
          for (const dep of p.objects) if (dep.frameId === o.id) dep.assemblyId = asm.id;
        }
      });
      this.toast(`Sestava „${name}“ vytvořena (${objs.length} prvků).`, 'ok');
      this.refreshFilters();
    });
  }

  ungroupSelection() {
    const objs = this.store.selectedObjects();
    if (!objs.length) return;
    this.store.commit('Zrušení seskupení', (p) => {
      for (const o of objs) {
        const t = p.byId(o.id);
        if (t) t.assemblyId = null;
      }
      // Sestavy bez prvků odstraníme.
      p.assemblies = p.assemblies.filter((a) => p.objects.some((o) => o.assemblyId === a.id));
    });
    this.refreshFilters();
  }

  addFill(frame, dir) {
    if (!frame || frame.type !== 'frame') return;
    const existing = this.store.project.ofType('fill').find((f) => f.frameId === frame.id);
    if (existing) {
      this.store.commit('Změna směru výplně', (p) => {
        const t = p.byId(existing.id);
        if (t) t.dir = dir;
      });
      this.store.select(existing.id);
      return;
    }
    const mat = this.store.library.get('m_jekl_20_20_2') || this.store.library.profiles()[0];
    const fill = makeFill({ frameId: frame.id, dir, count: 7, materialId: mat?.id || null, assemblyId: frame.assemblyId });
    this.store.commit('Vložení výplně', (p) => {
      if (mat) p.useMaterial(mat);
      for (const m of p.ofType('mesh').filter((x) => x.frameId === frame.id)) p.remove(m.id);
      p.add(fill);
    });
    this.store.select(fill.id);
  }

  focusSelectedInBom() {
    const key = this.store.highlightPart;
    if (!key) return;
    const tr = $('bomBody').querySelector(`tr[data-key="${CSS.escape(key)}"]`);
    tr?.scrollIntoView({ block: 'nearest' });
  }

  /* ─────────────────────────────────────────────────── ovládání ──── */

  bindUI() {
    for (const b of document.querySelectorAll('[data-cmd]')) {
      b.addEventListener('click', () => this.command(b.dataset.cmd));
    }
    for (const b of document.querySelectorAll('.tool')) {
      b.addEventListener('click', () => this.canvas.setTool(b.dataset.tool));
    }
    for (const b of document.querySelectorAll('[data-v3d]')) {
      b.addEventListener('click', () => {
        if (b.dataset.v3d === 'fit') this.view3d.fit();
        else this.view3d.setStandardView(b.dataset.v3d);
      });
    }
    $('v3dEdges').addEventListener('change', (e) => this.view3d.setEdges(e.target.checked));
    $('v3dRef').addEventListener('change', (e) => this.view3d.setRefVisible(e.target.checked));

    // Editor kóty
    $('dimInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.canvas.commitDimEdit(e.target.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.canvas.closeDimEdit();
      }
      e.stopPropagation();
    });
    $('dimInput').addEventListener('blur', () => setTimeout(() => this.canvas.closeDimEdit(), 120));

    // Panely
    for (const b of document.querySelectorAll('.panel-toggle')) {
      b.addEventListener('click', () => b.closest('.panel').classList.toggle('collapsed'));
    }

    // Filtry a nastavení kusovníku
    $('bomFilterAsm').addEventListener('change', (e) => this.bom.setFilters(e.target.value, null));
    $('bomFilterMat').addEventListener('change', (e) => this.bom.setFilters(null, e.target.value));
    $('bomSettings').addEventListener('click', () => D.openCutSettingsDialog(this.modal, this.store));
    $('bomPdf').addEventListener('click', () => this.exportPdf(['bom'], 'bom'));
    $('bomRename').addEventListener('click', () => {
      const key = this.store.highlightPart;
      const row = this.store.derived.bom.find((r) => r.sources.includes(key)) || this.store.derived.bom[0];
      if (row) D.openRenameDialog(this.modal, this.store, row);
      else this.toast('Kusovník je prázdný.', 'warn');
    });

    // Nářez
    $('kerfInput').addEventListener('change', (e) => {
      const v = Math.max(0, parseFloat(e.target.value) || 0);
      this.store.commit('Změna prořezu', (p) => {
        p.settings.kerf = v;
      });
    });
    $('sharedMiter').addEventListener('change', (e) => {
      const v = e.target.checked;
      this.store.commit('Sdílené pokosové řezy', (p) => {
        p.settings.sharedMiter = v;
      });
    });
    $('cutUnlock').addEventListener('click', () => {
      this.cut.unlockAll();
      this.toast('Nářez přepočítán automaticky.', 'ok');
    });
    $('cutPdf').addEventListener('click', () => this.exportPdf(['cut'], 'cut'));

    // Varování
    $('issueDetails').addEventListener('click', () => D.openIssuesDialog(this.modal, this.store));
    $('autoValidate').addEventListener('change', (e) => {
      const v = e.target.checked;
      this.store.commit('Automatická kontrola', (p) => {
        p.settings.autoValidate = v;
      });
      if (v) this.store.revalidate();
    });
    $('stIssues').addEventListener('click', () => D.openIssuesDialog(this.modal, this.store));

    // Stavový řádek – přepínače
    $('stSnap').addEventListener('click', () => this.command('view.snap'));
    $('stGrid').addEventListener('click', () => this.command('view.grid'));

    // Přejmenování projektu
    $('projTitle').addEventListener('click', () => D.openProjectDialog(this.modal, this.store));

    this.bindSplitter();
    document.addEventListener('mousedown', (e) => {
      // Menu otevírá právě probíhající stisk pravého tlačítka – ten ho nesmí
      // hned zase zavřít, když událost dobublá až sem.
      if (!e.target.closest('#ctxMenu') && e !== this._ctxOpenEvent) {
        $('ctxMenu').classList.add('hidden');
      }
      if (!e.target.closest('#recogPopup')) this.hideRecognizePopup();
    });
  }

  bindSplitter() {
    const split = $('outSplit');
    const outputs = $('outputs');
    let dragging = false;
    split.addEventListener('mousedown', () => {
      dragging = true;
      document.body.style.cursor = 'col-resize';
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const r = outputs.getBoundingClientRect();
      const w = G.clamp(e.clientX - r.left, 260, r.width - 300);
      outputs.style.gridTemplateColumns = `${w}px 5px 1fr`;
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      document.body.style.cursor = '';
    });
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (this.modal.isOpen) {
        if (e.key === 'Escape') this.modal.close();
        return;
      }
      const t = e.target;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;

      if (e.ctrlKey || e.metaKey) {
        const map = {
          z: 'edit.undo', y: 'edit.redo', a: 'edit.selectAll', d: 'edit.duplicate',
          g: e.shiftKey ? 'edit.ungroup' : 'edit.group',
        };
        const cmd = map[e.key.toLowerCase()];
        if (cmd) {
          e.preventDefault();
          if (!kt.desktop) this.command(cmd);
        }
        return;
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          this.canvas.cancelPending();
          this.store.clearSelection();
          break;
        case 'Enter':
          if (this.canvas.chain) {
            e.preventDefault();
            this.canvas.finishChain();
          }
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          this.deleteSelection();
          break;
        case 'F2': this.setMode('2d'); break;
        case 'F3': this.setMode('3d'); break;
        case 'F5': e.preventDefault(); this.command('project.revalidate'); break;
        case 'F1': e.preventDefault(); this.simple.help(); break;
        default: {
          const tool = TOOL_KEYS[e.key.toLowerCase()];
          if (tool) {
            e.preventDefault();
            this.canvas.setTool(tool);
          } else if (e.key.toLowerCase() === 'f') {
            this.command('view.fit');
          } else if (e.key.toLowerCase() === 'g') {
            this.command('view.grid');
          } else if (e.key.toLowerCase() === 's') {
            this.command('view.snap');
          }
        }
      }
    });
  }

  bindMenu() {
    kt.onMenu?.((id) => {
      const el=document.activeElement;
      if (id.startsWith('edit.') && (this.modal.isOpen || /INPUT|TEXTAREA|SELECT/.test(el?.tagName))) {
        const native={'edit.undo':'undo','edit.redo':'redo','edit.selectAll':'selectAll','edit.delete':'delete'}[id];
        if (native && /INPUT|TEXTAREA/.test(el?.tagName)) document.execCommand(native);
        return;
      }
      this.command(id);
    });
  }

  /* ─────────────────────────────────────────────────── příkazy ───── */

  command(id) {
    const s = this.store;
    switch (id) {
      case 'file.new': this.simple.newProject(); break;
      case 'file.open': this.openProject(); break;
      case 'file.save': this.saveProject(); break;
      case 'file.saveAs': this.saveProject(true); break;
      case 'file.revealData': kt.openPath('documents'); break;

      case 'edit.undo':
        if (!s.undo()) this.toast('Není co vrátit.', 'warn');
        break;
      case 'edit.redo':
        if (!s.redo()) this.toast('Není co opakovat.', 'warn');
        break;
      case 'edit.delete': this.deleteSelection(); break;
      case 'edit.duplicate': this.duplicateSelection(); break;
      case 'edit.selectAll': s.select(s.project.objects.map((o) => o.id)); break;
      case 'edit.group': this.groupSelection(); break;
      case 'edit.ungroup': this.ungroupSelection(); break;

      case 'view.2d': this.setMode('2d'); break;
      case 'view.3d': this.setMode('3d'); break;
      case 'view.fit':
        if (this.mode === '2d') this.canvas.fit();
        else this.view3d.fit();
        break;
      case 'view.zoomIn': this.canvas.zoom(1.25); break;
      case 'view.zoomOut': this.canvas.zoom(0.8); break;
      case 'view.grid':
        s.touch((p) => (p.settings.showGrid = !p.settings.showGrid));
        break;
      case 'view.snap':
        s.touch((p) => (p.settings.snap = !p.settings.snap));
        break;
      case 'view.dims':
        s.touch((p) => (p.settings.showDims = !p.settings.showDims));
        break;

      case 'project.settings': D.openProjectDialog(this.modal, s); break;
      case 'project.cutSettings': D.openCutSettingsDialog(this.modal, s); break;
      case 'project.revalidate': {
        const issues = s.revalidate();
        this.toast(issues.length ? `Kontrola: ${issues.length} položek.` : 'Kontrola bez nálezu.', issues.length ? 'warn' : 'ok');
        D.openIssuesDialog(this.modal, s);
        break;
      }

      case 'materials.open': this.openMaterials(); break;
      case 'materials.reset':
        s.library = new MaterialLibrary();
        this.saveMaterials();
        this.toast('Výchozí katalog obnoven.', 'ok');
        s.emit('materials');
        break;

      case 'out.bom': this.focusOutput('bom'); break;
      case 'out.cut': this.focusOutput('cut'); break;
      case 'pdf.drawing': this.exportPdf(['drawing'], 'drawing'); break;
      case 'pdf.bom': this.exportPdf(['bom'], 'bom'); break;
      case 'pdf.cut': this.exportPdf(['cut'], 'cut'); break;
      case 'pdf.all': this.exportPdf(['drawing', 'bom', 'cut'], 'all'); break;
      case 'print.all': this.printReport(['drawing', 'bom', 'cut']); break;

      case 'help.guide': this.simple.help(); break;
      case 'help.keys': D.openKeysDialog(this.modal); break;
      case 'help.log': kt.openPath('log'); break;
      case 'help.about': D.openAboutDialog(this.modal, this.appInfo); break;
      default: break;
    }
  }

  setMode(mode) {
    this.simple?.showPage(mode);
    this.mode = mode;
    const is3d = mode === '3d';
    $('viewport2d').classList.toggle('hidden', is3d);
    $('viewport3d').classList.toggle('hidden', !is3d);
    $('btn2d').classList.toggle('active', !is3d);
    $('btn3d').classList.toggle('active', is3d);
    this.view3d.setEnabled(is3d);
    if (is3d) {
      this.spatial?.activate();
      this.view3d.resize();
      if (!this._fitted3d) {
        this.view3d.fit();
        this._fitted3d = true;
      }
    } else this.canvas.requestDraw();
  }

  focusOutput(which) {
    this.simple?.showPage(which);
    document.body.classList.remove('no-outputs');
    const pane = which === 'bom' ? $('paneBom') : $('paneCut');
    pane.querySelector('.out-body').scrollTop = 0;
    pane.animate([{ background: '#e3edfb' }, { background: 'transparent' }], { duration: 550 });
  }

  openMaterials() {
    D.openMaterialsDialog(this.modal, this.store, () => {
      this.saveMaterials();
      this.store.recompute();
      this.store.emit('materials');
    });
  }

  /* ─────────────────────────────────────────────────── výstupy ───── */

  async exportPdf(sections, key) {
    if (!this.simple.checkExport()) return;
    try {
      this.toast('Připravuji PDF…');
      const html = buildReport(this.store, sections);
      const name = `${sanitize(this.store.project.name)}-${REPORT_TITLES[key] || 'vystup'}`;
      const res = await kt.exportPdf(html, true, name);
      if (res?.ok) this.toast('PDF uloženo.', 'ok');
      else if (!res?.canceled) this.toast(`Export selhal: ${res?.error || 'neznámá chyba'}`, 'err');
    } catch (err) {
      this.toast(`Export selhal: ${err.message}`, 'err');
      kt.log?.('ERROR', `PDF: ${err.stack || err.message}`);
    }
  }

  async printReport(sections) {
    if (!this.simple.checkExport()) return;
    try {
      const html = buildReport(this.store, sections);
      const res = await kt.printReport(html, true);
      if (!res?.ok) this.toast(`Tisk selhal: ${res?.error || 'neznámá chyba'}`, 'err');
    } catch (err) {
      this.toast(`Tisk selhal: ${err.message}`, 'err');
    }
  }

  movePieceDialog(materialId, partKey) {
    const plan = this.store.derived.plans.find((p) => p.materialId === materialId);
    if (!plan) return;
    const opts = plan.bars.map((b, i) => `<option value="${i}">Tyč ${i + 1} (zbytek ${fmtLen(b.remainder)} mm)</option>`).join('');
    this.modal.open({
      title: 'Přesun dílu na jinou tyč',
      body: `<div class="row"><label>Cílová tyč</label>
          <select id="tgt">${opts}<option value="${plan.bars.length}">Nová tyč</option></select></div>
        <p class="hint">Ruční zásah rozložení uzamkne. Tlačítkem <b>Obnovit</b> se vrátí automatický výpočet.</p>`,
      buttons: [
        { label: 'Zrušit' },
        {
          label: 'Přesunout',
          primary: true,
          action: (m) => {
            const idx = parseInt(m.bodyEl.querySelector('#tgt').value, 10);
            if (this.cut.movePieceTo(materialId, partKey, idx)) this.toast('Díl přesunut, rozložení uzamčeno.', 'ok');
            else this.toast('Přesun se nepodařil.', 'warn');
          },
        },
      ],
    });
  }

  /* ────────────────────────────────────────── kontextové menu ────── */

  showContextMenu(e, hit) {
    this._ctxOpenEvent = e;
    const menu = $('ctxMenu');
    const obj = hit ? this.store.project.byId(hit.objectId) : null;
    const items = [];

    if (obj) {
      items.push({ head: OBJECT_LABEL(obj) });
      items.push({ label: 'Materiál…', act: () => this.openMaterials() });
      items.push({ label: 'Rozměry a vlastnosti', act: () => $('propsBody').scrollIntoView() });
      if (obj.type === 'frame') {
        items.push({ label: 'Přidat svislou výplň', act: () => this.addFill(obj, 'v') });
        items.push({ label: 'Přidat vodorovnou výplň', act: () => this.addFill(obj, 'h') });
        items.push({ label: 'Vložit pletivo', act: () => this.canvas.placeMeshInFrame(obj) });
      }
      items.push({ sep: true });
      items.push({ label: 'Duplikovat', hint: 'Ctrl+D', act: () => this.duplicateSelection() });
      items.push({ label: 'Seskupit do sestavy', hint: 'Ctrl+G', act: () => this.groupSelection() });
      if (obj.assemblyId) items.push({ label: 'Zrušit seskupení', act: () => this.ungroupSelection() });
      items.push({
        label: obj.visible ? 'Skrýt' : 'Zobrazit',
        act: () =>
          this.store.commit('Viditelnost prvku', (p) => {
            const t = p.byId(obj.id);
            if (t) t.visible = !t.visible;
          }),
      });
      items.push({ sep: true });
      items.push({ label: 'Odstranit', hint: 'Del', act: () => this.deleteSelection() });
    } else {
      items.push({ head: 'Plátno' });
      items.push({ label: 'Vybrat vše', hint: 'Ctrl+A', act: () => this.command('edit.selectAll') });
      items.push({ label: 'Přizpůsobit pohled', hint: 'F', act: () => this.canvas.fit() });
      items.push({ sep: true });
      items.push({
        label: `${this.store.project.settings.showGrid ? 'Skrýt' : 'Zobrazit'} mřížku`,
        act: () => this.command('view.grid'),
      });
      items.push({
        label: `${this.store.project.settings.showDims ? 'Skrýt' : 'Zobrazit'} kóty`,
        act: () => this.command('view.dims'),
      });
      items.push({
        label: `Přichytávání: ${this.store.project.settings.snap ? 'zapnuto' : 'vypnuto'}`,
        act: () => this.command('view.snap'),
      });
    }

    menu.innerHTML = items
      .map((i) => {
        if (i.sep) return '<div class="ctx-sep"></div>';
        if (i.head) return `<div class="ctx-head">${escapeHtml(i.head)}</div>`;
        return `<button class="ctx-item"><span>${escapeHtml(i.label)}</span>${
          i.hint ? `<small>${escapeHtml(i.hint)}</small>` : ''
        }</button>`;
      })
      .join('');

    const buttons = [...menu.querySelectorAll('.ctx-item')];
    const actions = items.filter((i) => !i.sep && !i.head);
    buttons.forEach((b, i) =>
      b.addEventListener('click', () => {
        menu.classList.add('hidden');
        actions[i].act?.();
      })
    );

    menu.classList.remove('hidden');
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - r.height - 8)}px`;
  }

  /* ─────────────────────────────────── nabídka interpretací náčrtu ── */

  showRecognizePopup(cands, at, cb) {
    const pop = $('recogPopup');
    const list = $('recogList');
    this._recogCb = cb;
    list.innerHTML = cands
      .map(
        (c, i) =>
          `<button class="recog-opt ${i === 0 ? 'sel' : ''}" data-i="${i}">
            <b>${escapeHtml(c.label)}</b><small>${escapeHtml(c.hint)} · shoda ${Math.round(c.confidence * 100)} %</small>
          </button>`
      )
      .join('');
    list.querySelectorAll('.recog-opt').forEach((b) =>
      b.addEventListener('click', () => {
        this.hideRecognizePopup();
        cb(cands[+b.dataset.i]);
      })
    );
    pop.classList.remove('hidden');
    const r = pop.getBoundingClientRect();
    const vp = $('viewport2d').getBoundingClientRect();
    pop.style.left = `${G.clamp(at.x + 14, 8, vp.width - r.width - 8)}px`;
    pop.style.top = `${G.clamp(at.y - 20, 8, vp.height - r.height - 8)}px`;
  }

  hideRecognizePopup() {
    const pop = $('recogPopup');
    if (pop.classList.contains('hidden')) return;
    pop.classList.add('hidden');
    const cb = this._recogCb;
    this._recogCb = null;
    cb?.(null);
  }

  /* ───────────────────────────────────────────────── stav a UI ───── */

  syncUI() {
    const s = this.store;
    const p = s.project;

    $('btnUndo').disabled = !s.canUndo();
    $('btnRedo').disabled = !s.canRedo();
    $('stGrid').textContent = p.settings.showGrid ? `${p.settings.gridStep} mm` : 'vypnuta';
    const snap = $('stSnap');
    snap.textContent = p.settings.snap ? 'Zapnuto' : 'Vypnuto';
    snap.className = p.settings.snap ? 'on' : 'off';
    $('kerfInput').value = p.settings.kerf;
    $('sharedMiter').checked = !!p.settings.sharedMiter;
    $('autoValidate').checked = p.settings.autoValidate !== false;

    const saved = $('stSaved');
    saved.textContent = s.dirty ? 'Neuložené změny' : s.filePath ? 'Projekt uložen' : 'Neuloženo';
    saved.className = s.dirty ? 'st dirty' : s.filePath ? 'st saved' : 'st';

    const { errors, warns } = s.derived.counts;
    const stIssues = $('stIssues');
    stIssues.className = 'st st-issues' + (errors ? ' has-err' : warns ? ' has-warn' : '');
    stIssues.textContent = errors || warns ? `Kontrola: ${errors} chyb, ${warns} varování` : 'Bez chyb';
    stIssues.style.cursor = 'pointer';

    this.updateIssueBar();
    this.refreshFilters();
    this.setTitle();
  }

  updateIssueBar() {
    const bar = $('issueBar');
    const issues = this.store.derived.issues;
    const first = issues.find((i) => i.severity === 'error') || issues.find((i) => i.severity === 'warn');
    if (!first) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    bar.classList.toggle('err', first.severity === 'error');
    const more = issues.length > 1 ? ` (a další ${issues.length - 1})` : '';
    $('issueText').textContent = `${first.title}: ${first.message}${more}`;
  }

  refreshFilters() {
    const asmSel = $('bomFilterAsm');
    const matSel = $('bomFilterMat');
    const p = this.store.project;

    const asmVal = asmSel.value;
    asmSel.innerHTML =
      '<option value="">Všechny sestavy</option>' +
      p.assemblies.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
    asmSel.value = p.assemblies.some((a) => a.id === asmVal) ? asmVal : '';

    const mats = new Map();
    for (const r of this.store.derived.bom) if (r.materialId) mats.set(r.materialId, r.materialName);
    const matVal = matSel.value;
    matSel.innerHTML =
      '<option value="">Všechny materiály</option>' +
      [...mats].map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join('');
    matSel.value = mats.has(matVal) ? matVal : '';

    this.bom.filterAsm = asmSel.value;
    this.bom.filterMat = matSel.value;
  }

  toast(msg, kind = '') {
    const wrap = $('toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 260);
    }, kind === 'err' ? 6000 : 3400);
  }
}

/* ──────────────────────────────────────────────────────── pomocné ── */

const TOOL_NAMES = {
  select: 'Výběr', sketch: 'Kreslení', line: 'Čára', rect: 'Uzavřený tvar', fill: 'Výplň',
  mesh: 'Pletivo', plate: 'Plech/Patka', hole: 'Otvor', ref: 'Okolí/Zeď', dim: 'Kóta', group: 'Skupina',
};

const TOOL_KEYS = {
  v: 'select', n: 'sketch', c: 'line', r: 'rect', p: 'mesh', h: 'plate', o: 'hole', z: 'ref', k: 'dim',
};

function OBJECT_LABEL(obj) {
  return (
    { frame: 'Rám', fill: 'Výplň', mesh: 'Pletivo', profile: 'Profil', plate: 'Plech / patka', ref: 'Okolí', dim: 'Kóta' }[
      obj.type
    ] || obj.type
  );
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function sanitize(name) {
  return String(name || 'projekt').replace(/[^\w\-. ěščřžýáíéúůťďňĚŠČŘŽÝÁÍÉÚŮŤĎŇ]+/gi, '_').trim() || 'projekt';
}

// Modul s top-level await se dokončí až po DOMContentLoaded, proto se
// na událost spoléhat nelze – když je dokument hotový, startujeme rovnou.
function start() {
  window.app = new App();
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start);
else start();
