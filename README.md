# KovoTingl Dílna

Jednoduchá desktopová aplikace pro kreslení zámečnických konstrukcí. Pilotní verze pro Windows, s volným náčrtem myší, přesnými rozměry, kusovníkem a nářezovým plánem. Pracuje offline.

## Stažení a spuštění

V [Releases](https://github.com/Jakub709/kovotingl-dilna/releases) stáhněte `KovoTingl-Dilna-0.1.0.exe` a spusťte jej. Přenosná aplikace nevyžaduje instalaci. Balíček není digitálně podepsaný.

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

**Nejde o plnohodnotný prostorový CAD.** 3D náhled vzniká z 2D modelu; volné modelování celé pergoly ve třech rozměrech není implementované. Automatické výplně mají omezení u nepravidelných rámů. Spojení dvou profilů pokosem je jednorázový výpočet. Obecný řešič vazeb a úplná prostorová kolizní analýza chybí. Návazné pokosy se označují, ale jejich materiálová úspora se neoptimalizuje. DXF/CNC export není součástí této verze.

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

Výpočetní sada obsahuje 97 kontrol a regresní sada 26 testů. Automatizovaná akceptace ve skutečném Electron okně ověřila 19 kroků včetně kreslení, kót, ukládání, obnovy a PDF:

```sh
npx electron tools/acceptance.cjs
```

Akceptace používá oddělená testovací data v `.test-output`, automaticky obsluhuje dialogy a po dokončení okno zavře. Výstupy testů a uživatelské projekty nejsou součástí repozitáře.

## Licence

Projekt zatím nemá udělenou open-source licenci (`UNLICENSED`). Veřejné zpřístupnění zdrojů samo o sobě takovou licenci nepřidává. Přibalené Three.js a OrbitControls podléhají licenci MIT uvedené v `src/vendor/LICENSE`.
