/**
 * Modální dialogy: databáze materiálů, nastavení, nápověda.
 */
import { CATEGORIES, FIELD_LABELS, categoryOf, makeMaterial, sectionText, defaultCatalog } from '../core/materials.js';
import { fmtLen, parseLength } from '../core/units.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Modal {
  constructor() {
    this.backdrop = document.getElementById('modalBackdrop');
    this.el = document.getElementById('modal');
    this.titleEl = document.getElementById('modalTitle');
    this.bodyEl = document.getElementById('modalBody');
    this.footEl = document.getElementById('modalFoot');
    document.getElementById('modalClose').addEventListener('click', () => this.close());
    this.backdrop.addEventListener('mousedown', (e) => {
      if (e.target === this.backdrop) this.close();
    });
    this.onClose = null;
  }

  open({ title, body, buttons = [], wide = false, onMount = null, onClose = null }) {
    this.generation = (this.generation || 0) + 1;
    const generation = this.generation;
    this.titleEl.textContent = title;
    this.bodyEl.innerHTML = body;
    this.el.classList.toggle('wide', !!wide);
    this.footEl.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', async () => {
        btn.disabled=true;
        try { const result = await b.action?.(this); if (result !== false && generation===this.generation) this.close(); }
        catch(err) { console.error(err); let el=this.bodyEl.querySelector('.form-error'); if(!el){el=document.createElement('p');el.className='form-error';this.bodyEl.append(el)}el.textContent=err.message; }
        finally {btn.disabled=false;}
      });
      this.footEl.appendChild(btn);
    }
    this.backdrop.classList.remove('hidden');
    this.onClose = onClose;
    onMount?.(this.bodyEl, this);
  }

  close() {
    this.backdrop.classList.add('hidden');
    this.bodyEl.innerHTML = '';
    this.onClose?.();
    this.onClose = null;
  }

  get isOpen() {
    return !this.backdrop.classList.contains('hidden');
  }
}

/* ═══════════════════════════════════════════ databáze materiálů (§8) ══ */

export function openMaterialsDialog(modal, store, onSaved) {
  let selectedId = store.library.items[0]?.id || null;

  const render = (root) => {
    const list = root.querySelector('#matList');
    const form = root.querySelector('#matForm');

    const groups = new Map();
    for (const m of store.library.items) {
      if (!groups.has(m.category)) groups.set(m.category, []);
      groups.get(m.category).push(m);
    }
    list.innerHTML = CATEGORIES.filter((c) => groups.has(c.key))
      .map(
        (c) =>
          `<div class="mat-cat">${esc(c.label)}</div>` +
          groups
            .get(c.key)
            .map(
              (m) =>
                `<div class="mat-item ${m.id === selectedId ? 'sel' : ''} ${m.active ? '' : 'off'}" data-id="${esc(m.id)}">
                  ${esc(m.name)}<small>${esc(sectionText(m))} · tyč ${m.stockLength ? fmtLen(m.stockLength) + ' mm' : '–'}</small>
                </div>`
            )
            .join('')
      )
      .join('');

    const m = store.library.get(selectedId);
    if (!m) {
      form.innerHTML = '<div class="empty">Vyber materiál ze seznamu.</div>';
      return;
    }
    const cat = categoryOf(m.category);
    form.innerHTML = `
      <div class="grp">
        <div class="grp-title">Položka databáze</div>
        <div class="row"><label>Název</label><input type="text" id="fName" value="${esc(m.name)}" /></div>
        <div class="row"><label>Kategorie</label>
          <select id="fCat">${CATEGORIES.map((c) => `<option value="${c.key}" ${c.key === m.category ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
      </div>
      <div class="grp">
        <div class="grp-title">Rozměry průřezu</div>
        ${cat.fields
          .map(
            (f) =>
              `<div class="row"><label>${esc(FIELD_LABELS[f])}</label>
                <input type="text" data-dim="${f}" value="${m.dims[f] ?? ''}" /></div>`
          )
          .join('') || '<p class="hint">Tato kategorie nemá rozměry průřezu.</p>'}
      </div>
      <div class="grp">
        <div class="grp-title">Sklad a zobrazení</div>
        <div class="row"><label>Skladová délka</label><input type="text" id="fStock" value="${m.stockLength ?? ''}" /></div>
        <div class="row"><label>Barva</label><input type="color" id="fColor" value="${esc(m.color || '#7d8b99')}" /></div>
        <label class="chk"><input type="checkbox" id="fActive" ${m.active ? 'checked' : ''}/> Aktivní (nabízí se při výběru)</label>
        <div class="row wide"><textarea id="fNote" placeholder="Poznámka">${esc(m.note || '')}</textarea></div>
        <p class="hint">Skladová délka je potřeba pro nářezový plán. Plech a pletivo se z tyčí neřežou.</p>
      </div>
      <div class="btn-row">
        <button class="btn" id="btnDup">Duplikovat</button>
        <button class="btn danger" id="btnDel" ${m.builtin ? 'disabled title="Výchozí položku lze jen skrýt"' : ''}>Odstranit</button>
      </div>`;

    /* vazby formuláře */
    const apply = (fn) => {
      fn(store.library.get(selectedId));
      render(root);
    };
    form.querySelector('#fName')?.addEventListener('change', (e) => apply((x) => (x.name = e.target.value)));
    form.querySelector('#fCat')?.addEventListener('change', (e) => apply((x) => (x.category = e.target.value)));
    form.querySelector('#fStock')?.addEventListener('change', (e) =>
      apply((x) => (x.stockLength = parseLength(e.target.value, 0) || 0))
    );
    form.querySelector('#fColor')?.addEventListener('change', (e) => apply((x) => (x.color = e.target.value)));
    form.querySelector('#fActive')?.addEventListener('change', (e) => apply((x) => (x.active = e.target.checked)));
    form.querySelector('#fNote')?.addEventListener('change', (e) => apply((x) => (x.note = e.target.value)));
    for (const inp of form.querySelectorAll('[data-dim]')) {
      inp.addEventListener('change', (e) =>
        apply((x) => (x.dims[e.target.dataset.dim] = parseLength(e.target.value, null)))
      );
    }
    form.querySelector('#btnDup')?.addEventListener('click', () => {
      const copy = makeMaterial({ ...m, name: m.name + ' (kopie)' });
      copy.dims = { ...m.dims };
      store.library.add(copy);
      selectedId = copy.id;
      render(root);
    });
    form.querySelector('#btnDel')?.addEventListener('click', () => {
      store.library.remove(m.id);
      selectedId = store.library.items[0]?.id || null;
      render(root);
    });

    list.querySelectorAll('.mat-item').forEach((el) =>
      el.addEventListener('click', () => {
        selectedId = el.dataset.id;
        render(root);
      })
    );
  };

  modal.open({
    title: 'Databáze materiálů',
    wide: true,
    body: `<div class="mat-layout">
      <div class="mat-list" id="matList"></div>
      <div class="mat-form" id="matForm"></div>
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn" id="btnNew">+ Nový materiál</button>
      <button class="btn" id="btnRestore">Doplnit chybějící výchozí položky</button>
    </div>`,
    buttons: [
      { label: 'Zavřít' },
      {
        label: 'Uložit databázi',
        primary: true,
        action: () => {
          onSaved?.();
          return true;
        },
      },
    ],
    onMount: (root) => {
      render(root);
      root.querySelector('#btnNew').addEventListener('click', () => {
        const m = store.library.add(makeMaterial({ name: 'Nový profil' }));
        selectedId = m.id;
        render(root);
      });
      root.querySelector('#btnRestore').addEventListener('click', () => {
        for (const d of defaultCatalog()) if (!store.library.get(d.id)) store.library.add(d);
        render(root);
      });
    },
    onClose: () => onSaved?.(),
  });
}

/* ═════════════════════════════════════════════════════ nastavení ══ */

export function openProjectDialog(modal, store) {
  const p = store.project;
  modal.open({
    title: 'Vlastnosti projektu',
    body: `
      <div class="row"><label>Název</label><input type="text" id="pName" value="${esc(p.name)}" /></div>
      <div class="row"><label>Zákazník</label><input type="text" id="pCust" value="${esc(p.customer)}" /></div>
      <div class="row wide"><textarea id="pNote" placeholder="Poznámka k projektu">${esc(p.note)}</textarea></div>
      <p class="hint">Údaje o zákazníkovi nejsou povinné.</p>`,
    buttons: [
      { label: 'Zrušit' },
      {
        label: 'Uložit',
        primary: true,
        action: (m) => {
          const name = m.bodyEl.querySelector('#pName').value.trim();
          const cust = m.bodyEl.querySelector('#pCust').value;
          const note = m.bodyEl.querySelector('#pNote').value;
          store.commit('Vlastnosti projektu', (pr) => {
            pr.name = name || 'Nový projekt';
            pr.customer = cust;
            pr.note = note;
          });
        },
      },
    ],
  });
}

export function openCutSettingsDialog(modal, store) {
  const s = store.project.settings;
  modal.open({
    title: 'Nastavení nářezu a kusovníku',
    body: `
      <div class="row"><label>Prořez pily</label><input type="number" id="sKerf" step="0.5" min="0" max="20" value="${s.kerf}" /></div>
      <div class="row"><label>Krok mřížky</label><input type="number" id="sGrid" step="1" min="1" max="500" value="${s.gridStep}" /></div>
      <div class="row"><label>Desetinná místa</label>
        <select id="sDec">
          <option value="0" ${s.lengthDecimals === 0 ? 'selected' : ''}>Celé milimetry</option>
          <option value="1" ${s.lengthDecimals === 1 ? 'selected' : ''}>Jedno desetinné místo</option>
        </select></div>
      <label class="chk"><input type="checkbox" id="sMerge" ${s.mergeIdentical !== false ? 'checked' : ''}/>
        Slučovat shodné díly do jednoho řádku kusovníku</label>
      <label class="chk"><input type="checkbox" id="sShared" ${s.sharedMiter ? 'checked' : ''}/>
        Označit návazné pokosy sousedních dílů</label>
      <p class="hint">Plán vždy započítává šířku prořezu. Úsporu společným řezem tato verze neoptimalizuje.</p>
      <label class="chk"><input type="checkbox" id="sValid" ${s.autoValidate !== false ? 'checked' : ''}/>
        Automatická kontrola po každé změně</label>`,
    buttons: [
      { label: 'Zrušit' },
      {
        label: 'Použít',
        primary: true,
        action: (m) => {
          const q = (id) => m.bodyEl.querySelector(id);
          store.commit('Nastavení projektu', (pr) => {
            pr.settings.kerf = Math.max(0, parseFloat(q('#sKerf').value) || 0);
            pr.settings.gridStep = Math.max(1, parseInt(q('#sGrid').value, 10) || 10);
            pr.settings.lengthDecimals = parseInt(q('#sDec').value, 10) || 0;
            pr.settings.mergeIdentical = q('#sMerge').checked;
            pr.settings.sharedMiter = q('#sShared').checked;
            pr.settings.autoValidate = q('#sValid').checked;
          });
        },
      },
    ],
  });
}

/* ═════════════════════════════════════════════════════ nápověda ══ */

export function openGuideDialog(modal) {
  modal.open({
    title: 'Rychlý průvodce',
    wide: true,
    body: `<div class="help">
      <h3>Od náčrtu k nářezu za deset kroků</h3>
      <ol class="steps">
        <li>Vyber nástroj <b>Kreslení</b> a myší načrtni obdélník. Nemusíš mířit přesně –
            program tvar rozpozná a narovná. Když si není jistý, nabídne varianty.</li>
        <li>Klepni na kótu a přepiš rozměr, například <kbd>2000</kbd>. Můžeš psát i <kbd>90 cm</kbd>.</li>
        <li>V pravém panelu vyber <b>profil</b> rámu a způsob rohového spoje (pokos 45° nebo rovný spoj).</li>
        <li>Nástrojem <b>Výplň</b> klepni dovnitř rámu. Zadej počet kusů nebo maximální mezeru
            a vyber jiný profil než u rámu.</li>
        <li>Případně nástrojem <b>Pletivo</b> nahraď profilovou výplň plošným pletivem.</li>
        <li>Nástrojem <b>Plech/Patka</b> nakresli patku, nastav tloušťku a tlačítkem
            <b>4× do rohů</b> vlož otvory.</li>
        <li>Nástrojem <b>Čára</b> přidej samostatný profil, například vzpěru nebo L doraz.
            Klepáním přidáš další lomy, dvojklik tvar ukončí.</li>
        <li>Označ vše (<kbd>Ctrl</kbd>+<kbd>A</kbd>) a stiskni <kbd>Ctrl</kbd>+<kbd>G</kbd> –
            vznikne sestava, kterou lze posouvat jako celek.</li>
        <li>Přepni na <b>3D</b> (<kbd>F3</kbd>) a konstrukci si otoč.</li>
        <li>Dole zkontroluj <b>kusovník</b> a <b>nářezový plán</b>, pak ulož a exportuj do PDF.</li>
      </ol>

      <h3>Rozpoznávání náčrtu</h3>
      <p>Program rozpozná čáru, obdélník, uzavřený tvar a lomený profil (například Z).
         Když je rozpoznání nejisté, ukáže dvě až tři možnosti a nerozhodne za tebe.
         Čáry se narovnávají na 0°, 45°, 90° a 135°; jiný úhel zůstane zachovaný.</p>

      <h3>Úhly řezu</h3>
      <p><b>90°</b> je rovný řez kolmo k ose profilu. <b>45°</b> je pokos, jak ho nastavíš
         na pokosové pile. U každého konce se ukládá i směr sklonu, který je vidět
         graficky na výkresu i v nářezovém plánu. Šipka na vybraném dílu ukazuje jeho
         lokální směr od levého k pravému konci.</p>

      <h3>Délka dílu</h3>
      <p>Délka se měří <b>po nejdelší vnější hraně</b>. U pokosového rámu 2000 × 1200 mm
         proto vyjdou díly přesně 2000 a 1200 mm. Prořez pily se do délky dílu nepočítá,
         projeví se až v rozložení na tyči.</p>

      <h3>Okolí a zeď</h3>
      <p>Nástrojem <b>Okolí/Zeď</b> nakreslíš stavební otvor i nepravidelný tvar.
         Okolí slouží jen ke kótování a nikdy nevstupuje do kusovníku ani nářezu.</p>

      <h3>Nářezový plán</h3>
      <p>Díly se rozkládají na skladové tyče tak, aby jich bylo co nejméně. Stejné zadání
         dá vždy stejný výsledek. Kliknutím na díl v plánu ho najdeš ve výkresu.
         Prořez se kreslí jako úzká šrafovaná mezera, zbytek tyče je vyšrafovaný na konci.</p>
    </div>`,
    buttons: [{ label: 'Zavřít', primary: true }],
  });
}

export function openKeysDialog(modal) {
  const keys = [
    ['V', 'Nástroj Výběr'],
    ['N', 'Nástroj Kreslení (volný náčrt)'],
    ['C', 'Nástroj Čára'],
    ['R', 'Nástroj Uzavřený tvar / rám'],
    ['P', 'Nástroj Pletivo'],
    ['H', 'Nástroj Plech / patka'],
    ['O', 'Nástroj Otvor'],
    ['Z', 'Nástroj Okolí / zeď'],
    ['K', 'Nástroj Kóta'],
    ['F2 / F3', 'Přepnutí 2D a 3D'],
    ['F', 'Přizpůsobit pohled'],
    ['G', 'Mřížka zapnout / vypnout'],
    ['S', 'Přichytávání zapnout / vypnout'],
    ['K (Zobrazení)', 'Kóty zapnout / vypnout'],
    ['Ctrl + Z / Ctrl + Y', 'Zpět / Znovu'],
    ['Ctrl + A', 'Vybrat vše'],
    ['Ctrl + G', 'Seskupit do sestavy'],
    ['Ctrl + Shift + G', 'Zrušit seskupení'],
    ['Ctrl + D', 'Duplikovat'],
    ['Delete', 'Odstranit vybrané'],
    ['Esc', 'Ukončit probíhající operaci'],
    ['Enter', 'Ukončit lomený tvar'],
    ['Ctrl + S / Ctrl + O / Ctrl + N', 'Uložit / Otevřít / Nový'],
    ['Ctrl + B / Ctrl + R', 'Kusovník / Nářezový plán'],
    ['Ctrl + M', 'Databáze materiálů'],
    ['Ctrl + P', 'Tisk'],
    ['Shift + tažení', 'Posun jen vodorovně nebo svisle'],
    ['Ctrl + tažení', 'Dočasně vypnout přichytávání'],
    ['Alt + tažení / prostřední tlačítko', 'Posun pohledu'],
    ['Kolečko myši', 'Přiblížení'],
  ];
  modal.open({
    title: 'Klávesové zkratky',
    body: `<table class="tabled"><tbody>${keys
      .map(([k, d]) => `<tr><td style="width:230px"><kbd>${esc(k)}</kbd></td><td>${esc(d)}</td></tr>`)
      .join('')}</tbody></table>`,
    buttons: [{ label: 'Zavřít', primary: true }],
  });
}

export function openAboutDialog(modal, info) {
  modal.open({
    title: 'O programu',
    body: `<div class="help">
      <h3>KovoTingl CAD ${esc(info.version)}</h3>
      <p>Rychlé kreslení zámečnických konstrukcí – 2D náčrt, automatický 3D náhled,
         kusovník a nářezový plán z jednoho modelu.</p>
      <table class="tabled"><tbody>
        <tr><td>Verze</td><td>${esc(info.version)}</td></tr>
        <tr><td>Systém</td><td>${esc(info.platform)}</td></tr>
        <tr><td>Projekty</td><td>${esc(info.documents)}</td></tr>
        <tr><td>Data programu</td><td>${esc(info.userData)}</td></tr>
        <tr><td>Protokol chyb</td><td>${esc(info.log)}</td></tr>
        <tr><td>Běhové prostředí</td><td>Electron ${esc(info.electron)} · Chromium ${esc(info.chrome)}</td></tr>
      </tbody></table>
      <p class="hint">Program pracuje offline. Aktualizace nemažou projekty ani databázi materiálů.</p>
    </div>`,
    buttons: [
      { label: 'Otevřít složku projektů', action: () => void window.kt.openPath('documents') },
      { label: 'Zavřít', primary: true },
    ],
  });
}

export function openIssuesDialog(modal, store) {
  const issues = store.derived.issues;
  if (!issues.length) {
    modal.open({
      title: 'Kontrola projektu',
      body: '<div class="help"><p>Žádné chyby ani varování. Projekt je připravený k výrobě.</p></div>',
      buttons: [{ label: 'Zavřít', primary: true }],
    });
    return;
  }
  modal.open({
    title: `Kontrola projektu – ${issues.length} položek`,
    wide: true,
    body: `<table class="tabled"><thead><tr><th style="width:110px">Závažnost</th><th style="width:180px">Typ</th><th>Popis</th></tr></thead>
      <tbody>${issues
        .map(
          (i) =>
            `<tr data-obj="${esc(i.objectIds[0] || '')}" style="cursor:pointer">
              <td><span class="pill ${i.severity === 'error' ? 'err' : 'warn'}">${i.severity === 'error' ? 'Chyba' : 'Varování'}</span></td>
              <td>${esc(i.title)}</td><td>${esc(i.message)}</td></tr>`
        )
        .join('')}</tbody></table>
      <p class="hint">Klepnutím na řádek se prvek vybere ve výkresu.</p>`,
    buttons: [{ label: 'Zavřít', primary: true }],
    onMount: (root, m) => {
      root.querySelectorAll('tr[data-obj]').forEach((tr) =>
        tr.addEventListener('click', () => {
          if (tr.dataset.obj) {
            store.select(tr.dataset.obj);
            m.close();
          }
        })
      );
    },
  });
}

export function openRenameDialog(modal, store, row) {
  modal.open({
    title: 'Název dílu',
    body: `<div class="row"><label>Označení</label>
        <input type="text" id="rName" value="${esc(row.name)}" placeholder="${esc(row.defaultName)}" /></div>
      <p class="hint">Například <b>R1 – levý svislý rám</b>, <b>V1 – výplň</b> nebo <b>P1 – patka</b>.
        Prázdné pole vrátí výchozí název.</p>`,
    buttons: [
      { label: 'Zrušit' },
      {
        label: 'Uložit',
        primary: true,
        action: (m) => {
          const val = m.bodyEl.querySelector('#rName').value.trim();
          store.commit('Přejmenování dílu', (p) => {
            for (const key of row.sources) {
              if (val) p.partNames[key] = val;
              else delete p.partNames[key];
            }
          });
        },
      },
    ],
    onMount: (root) => root.querySelector('#rName')?.select(),
  });
}

export function openGroupDialog(modal, store, onDone) {
  const suggested = `Branka ${store.project.assemblies.length + 1}`;
  modal.open({
    title: 'Nová sestava',
    body: `<div class="row"><label>Název sestavy</label><input type="text" id="gName" value="${esc(suggested)}" /></div>
      <p class="hint">Sestavu lze posouvat jako celek a filtrovat podle ní kusovník.
        Materiál mají jednotlivé prvky, ne sestava.</p>`,
    buttons: [
      { label: 'Zrušit' },
      {
        label: 'Vytvořit',
        primary: true,
        action: (m) => onDone(m.bodyEl.querySelector('#gName').value.trim() || suggested),
      },
    ],
    onMount: (root) => root.querySelector('#gName')?.select(),
  });
}
