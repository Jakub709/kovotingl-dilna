# KovoTingl Dílna

Jednoduchá desktopová aplikace pro kreslení zámečnických konstrukcí. Pilotní verze pro Windows, s volným náčrtem myší, přesnými rozměry, kusovníkem a nářezovým plánem. Pracuje offline.

## Verze 0.4.0: konstrukce ve 3D

- Volné skládání prostorových profilů, přesné souřadnice, sdílené body a vazby na nosníky.
- **Svařovaná pergola:** automatické řezy sloupů a krokví, průběžné nosníky a čtyři patky s otvory. Výchozí model má 17 dílů a lze jej dále upravovat. Materiály sloupů, nosníků a krokví se volí samostatně.
- Pokosy na obou koncích členu, uzavřené rámy a napojení na skutečnou plochu již seříznutého opěrného jeklu. Volba plochy může být automatická. Neslučitelné orientace a cyklické závislosti se odmítnou.
- **Plech v prostoru** v libovolné poloze; kruhové a oválné průchozí otvory, kontrola okrajů a překryvů otvorů. **Přidat patky** naváže patku na začátek vybraného profilu.
- **Posunout šipkami:** tažení os X/Y/Z posouvá celou propojenou konstrukci. Krok odpovídá mřížce, Alt používá 1 mm. Přesné otáčení je pod **Posunout / otočit**.
- **Změřit vzdálenost:** dva kliky na body os nebo povrch modelu zobrazí prostorovou vzdálenost a rozdíly X/Y/Z. Při přichycení na uzel jde o bod osy, nikoliv o seříznutý povrch.
- Kopírování zachovává vnitřní vazby a patky. Smazání profilu odpojí jeho patku a zachová její světovou polohu. Undo/redo platí i pro nové funkce.
- Kontrola možných kolizí vnějších objemů. Dutiny profilů a otvory se při této kontrole neodečítají, takže upozornění vyžaduje kontrolu uživatelem. U velmi rozsáhlého modelu se výslovně hlásí částečná kontrola.
- Kusovník, nářez vyřešených profilů, tři hranové pohledy a samostatné výkresy řezů i plechů s polohami otvorů. OBJ exportuje viditelné 3D díly jako trojúhelníkový model v mm.

### Vyzkoušení

Spusťte aplikaci → **3D modelování → Vytvořit pergolu → Vytvořit**. Výchozí svařovaná varianta má spoje dopočítané. Alternativní **Pouze osový návrh** zachovává původní volný generátor. Přímo lze otevřít [examples/pergola-svarovana.kov](examples/pergola-svarovana.kov). Podrobný postup je v [NAVOD-3D.md](NAVOD-3D.md).

Souřadnice jsou v mm: X = šířka, Y = výška, Z = hloubka. Klik vybere díl; Shift+klik přidá další. Tažení v režimu Vybrat / otočit otáčí pohled. Esc vrátí režim výběru. U patky nejprve vyberte profil, u otvoru nejprve plech.

### Přesný rozsah

Výrobní spoje jsou pro čtvercové a obdélníkové jekly. Celý řez musí ležet na skutečné ploše opory. Pokos vyžaduje shodné průřezy a geometricky slučitelné natočení; algoritmus nevytváří obecné výřezy do bočních stěn. Otvory jsou nyní v plechových dílech, ne vrtání stěnou profilu. OBJ je trojúhelníkový model, nikoliv STEP s CAD plochami. Statické dimenzování a technologický návrh svarů aplikace neprovádí. Volby materiálu v pergole jsou geometrické výchozí hodnoty.

Nevyřešené profily mají pouze osovou délku a nevstupují do nářezu. Tlačítko kolmých konců vyjadřuje záměr uživatele; automaticky nedokazuje, že konec je volný. Délka polotovaru a nejdelší hrana se mohou lišit. Detaily rohů řezu určují geometrii, ne nastavení konkrétní pily.

Formát projektu **4** přidává prostorové plechy a přílohy patek. Verze 0.4.0 otevírá formáty 1–3. Starší aplikace soubor formátu 4 neotevře; pro původní projekty doporučujeme **Uložit jako**.

Další rozvoj a moduly popisuje [ARCHITEKTURA-3D.md](ARCHITEKTURA-3D.md).

## Stažení a spuštění

**[Stáhnout aplikaci pro Windows – verze 0.4.0](https://github.com/Jakub709/kovotingl-dilna/releases/download/v0.4.0/KovoTingl-Dilna-0.4.0.exe)**

[Návod a ukázková pergola ke stažení](https://github.com/Jakub709/kovotingl-dilna/releases/tag/v0.4.0). Přenosná aplikace nevyžaduje instalaci. Balíček není digitálně podepsaný.

## Základní postup

1. Nástrojem **Kreslit** načrtněte obdélník nebo čáru.
2. Klepněte na kótu a zadejte přesný rozměr, například `900` nebo `90 cm`.
3. Vpravo vyberte materiál, spoje a výplň. Další nastavení jsou pod **Podrobnosti**.
4. Přidejte profily, patky, otvory nebo pletivo. Související prvky lze spojit do sestavy.
5. Zkontrolujte **3D kontrola**, **Seznam dílů** a **Nářez tyčí**.
6. Uložte projekt jako `.kov`. Přes **Výstupy / tisk** vytvořte PDF.

Nastavení, vlastní materiály a zálohy jsou v `%APPDATA%/KovoTingl-Dilna`.

## Rozsah pilotu

- Volné kreslení se zpřesněním, editovatelné kóty, mm/cm a přichytávání.
- Rámy, rovné a lomené profily, automatické výplně obdélníkových rámů a úpravy příček.
- Pletivo, plechové patky, kruhové a oválné otvory.
- Sestavy, databáze materiálů a referenční okolí.
- Kontrolní 3D náhled, automatický kusovník, nářez s prořezem a PDF.
- Ukládání, automatické zálohy a obnova projektu.

**Nejde o plnohodnotný prostorový CAD.** Automatické výplně mají omezení u nepravidelných rámů. Spojení dvou 2D profilů pokosem je jednorázový výpočet. Obecný řešič vazeb a úplná prostorová kolizní analýza chybí. Návazné pokosy se označují, ale jejich materiálová úspora se neoptimalizuje. DXF/CNC export není součástí této verze.

## Vývoj

Vyžaduje Node.js a npm. Electron a sestavovací nástroje se instalují ze závislostí; Three.js je přibalené v `src/vendor`.

```sh
npm install
npm start
npm test
```

Sestavení přenosné Windows verze:

```sh
npm run dist:portable
```

`npm run dist` vytvoří rozbalenou aplikaci v `dist/win-unpacked`.

## Ověření

Výpočetní sada obsahuje 97 kontrol, původní regresní sada 26 testů, prostorová sada 13 testů a výrobní sada 14 testů. Nové prostorové plechy a sestavy mají dalších 16 testů. Automatizovaná akceptace ve skutečném Electron okně ověřuje 19 původních 2D kroků, 20 kroků pro 3D, 10 kroků nových spojů a 15 kroků patek, otvorů, manipulátoru a exportu:

```sh
npx electron tools/acceptance.cjs
npx electron tools/acceptance-3d.cjs
npx electron tools/acceptance-workshop.cjs
npx electron tools/acceptance-solids.cjs
```

Akceptace používá oddělená testovací data v `.test-output`, automaticky obsluhuje dialogy a po dokončení okno zavře. Výstupy testů a uživatelské projekty nejsou součástí repozitáře.

## Licence

Projekt zatím nemá udělenou open-source licenci (`UNLICENSED`). Veřejné zpřístupnění zdrojů samo o sobě takovou licenci nepřidává. Přibalené Three.js a OrbitControls podléhají licenci MIT uvedené v `src/vendor/LICENSE`.
