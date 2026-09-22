import {resolveReferences} from './constraints.js';
/**
 * Centrální stav aplikace.
 *
 * Jediný zdroj pravdy: z projektu se odvozují díly, kusovník, nářez i varování.
 * 2D, 3D a výstupy pouze čtou odvozená data, takže nemohou rozejít (§2).
 */
import { Project } from './model.js';
import { MaterialLibrary } from './materials.js';
import { buildParts, buildBOM } from './build.js';
import { buildCutPlans } from './cutplan.js';
import { validate, countIssues } from './validate.js';

const HISTORY_LIMIT = 80;

export class Store {
  constructor() {
    this.project = new Project();
    this.library = new MaterialLibrary();
    this.filePath = null;
    this.dirty = false;
    this.revision = 0;

    this.selection = new Set();
    this.hover = null;
    /** Klíč zvýrazněného dílu (propojení kusovník ↔ výkres ↔ 3D). */
    this.highlightPart = null;

    this.undoStack = [];
    this.redoStack = [];
    this._pending = null;

    this.derived = { parts: [], bom: [], plans: [], issues: [], counts: { errors: 0, warns: 0, infos: 0 } };
    this._listeners = new Set();
    this.recompute();
  }

  /* ------------------------------------------------------ posluchači --- */

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  emit(reason = 'change') {
    for (const fn of this._listeners) {
      try {
        fn(reason, this);
      } catch (err) {
        console.error('posluchač selhal:', err);
      }
    }
  }

  /* --------------------------------------------------------- historie -- */

  snapshot() {
    return JSON.stringify(this.project.toJSON());
  }

  /**
   * Provede změnu projektu s možností vrátit zpět.
   * @param {string} label popis pro uživatele
   * @param {Function} fn mutace nad this.project
   */
  commit(label, fn) {
    const before = this.snapshot();
    try {
      fn(this.project);
    } catch (err) {
      console.error(`operace "${label}" selhala:`, err);
      // Vrátíme model do stavu před chybou, aby aplikace zůstala použitelná.
      this.project = Project.fromJSON(before);
      this.recompute();
      this.emit('error');
      throw err;
    }
    this.undoStack.push({ label, state: before });
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this.dirty = true;
    this.revision++;
    this.project.modified = new Date().toISOString();
    this.recompute();
    this.emit('commit');
  }

  /** Změna bez zápisu do historie (např. průběh tažení myší). */
  touch(fn, reason = 'change') {
    if (fn) fn(this.project);
    this.dirty = true;
    this.revision++;
    this.project.modified = new Date().toISOString();
    this.recompute();
    this.emit(reason);
  }

  /** Zahájí interaktivní operaci – stav se uloží až při endInteraction(). */
  beginInteraction() {
    if (this._pending == null) this._pending = this.snapshot();
  }
  endInteraction(label) {
    if (this._pending == null) return;
    const before = this._pending;
    this._pending = null;
    if (before === this.snapshot()) return; // nic se nezměnilo
    this.undoStack.push({ label, state: before });
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this.dirty = true;
    this.revision++;
    this.project.modified = new Date().toISOString();
    this.emit('commit');
  }
  cancelInteraction() {
    if (this._pending == null) return;
    this.project = Project.fromJSON(this._pending);
    this._pending = null;
    this.recompute();
    this.emit('undo');
  }

  canUndo() {
    return this.undoStack.length > 0;
  }
  canRedo() {
    return this.redoStack.length > 0;
  }
  undoLabel() {
    return this.undoStack.length ? this.undoStack[this.undoStack.length - 1].label : '';
  }
  redoLabel() {
    return this.redoStack.length ? this.redoStack[this.redoStack.length - 1].label : '';
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push({ label: entry.label, state: this.snapshot() });
    this.project = Project.fromJSON(entry.state);
    this.pruneSelection();
    this.dirty = true;
    this.revision++;
    this.project.modified = new Date().toISOString();
    this.recompute();
    this.emit('undo');
    return true;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push({ label: entry.label, state: this.snapshot() });
    this.project = Project.fromJSON(entry.state);
    this.pruneSelection();
    this.dirty = true;
    this.revision++;
    this.project.modified = new Date().toISOString();
    this.recompute();
    this.emit('redo');
    return true;
  }

  /* ---------------------------------------------------------- projekt -- */

  setProject(project, filePath = null) {
    this.project = project;
    this.revision++;
    this._pending = null;
    this.filePath = filePath;
    this.dirty = false;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.selection.clear();
    this.highlightPart = null;
    this.recompute();
    this.emit('project');
  }

  markSaved(filePath) {
    if (filePath) this.filePath = filePath;
    this.dirty = false;
    this.emit('saved');
  }

  /* --------------------------------------------------------- odvozená -- */

  recompute() {
    const p = this.project;
    resolveReferences(p);
    const parts = buildParts(p, this.library);
    const bom = buildBOM(p, parts);
    const plans = buildCutPlans(p, parts);
    const issues = validate(p, this.library, parts, plans);
    this.derived = { parts, bom, plans, issues, counts: countIssues(issues) };
    return this.derived;
  }

  /** Vynutí kontrolu i při vypnuté automatické validaci. */
  revalidate() {
    const { parts } = this.derived;
    const issues = validate(this.project, this.library, parts, this.derived.plans);
    this.derived.issues = issues;
    this.derived.counts = countIssues(issues);
    this.emit('validate');
    return issues;
  }

  partByKey(key) {
    return this.derived.parts.find((p) => p.key === key) || null;
  }
  partsOfObject(objectId) {
    return this.derived.parts.filter((p) => p.objectId === objectId);
  }
  issuesOfObject(objectId) {
    return this.derived.issues.filter((i) => i.objectIds.includes(objectId));
  }

  /* --------------------------------------------------------- výběr ----- */

  pruneSelection() {
    for (const id of [...this.selection]) if (!this.project.byId(id)) this.selection.delete(id);
  }
  select(ids, additive = false) {
    if (!additive) this.selection.clear();
    for (const id of [].concat(ids)) if (id) this.selection.add(id);
    this.emit('selection');
  }
  toggleSelect(id) {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.emit('selection');
  }
  clearSelection() {
    if (!this.selection.size) return;
    this.selection.clear();
    this.emit('selection');
  }
  selectedObjects() {
    return [...this.selection].map((id) => this.project.byId(id)).filter(Boolean);
  }
  firstSelected() {
    return this.selectedObjects()[0] || null;
  }

  setHighlightPart(key) {
    if (this.highlightPart === key) return;
    this.highlightPart = key;
    this.emit('highlight');
  }
}
