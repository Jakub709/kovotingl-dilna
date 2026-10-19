# Prostorové modelování 0.4.0

Projekt má sdílené body nodes3d a členy member3d s odkazy start/end. Souřadnice v mm: X šířka, Y výška, Z hloubka. Průřez se natáčí hodnotou roll. Formát 4 navazuje na node.binding a member.ends z formátu 3 a přidává objekty plate3d. Načítají se formáty 1–3.

## Moduly

- spatial.js: body, profily, transformace celých propojených komponent, kopie, pergola a validace souboru.
- spatial-geometry.js: vektory a jednotná lokální báze průřezu U/V/osa.
- spatial-bindings.js: orientované vazby bodů na osu podpory. DFS detekuje cykly, výsledek se aplikuje až po kontrole délek a zámků.
- spatial-fabrication.js: roviny koncových řezů. square = kolmo na osu, butt = plocha opěrného jeklu plus mezera, miter = společná rovina dvojice shodných jeklů. unresolved zůstává návrhem.
- build.js: odvozuje délku nejdelší hrany, délku polotovaru a productionReady. 3D díly se neslučují, aby jejich individuální detail zůstal dohledatelný.
- view3d.js: vrcholy dutého průřezu se posunou na tytéž roviny jako výrobní výpočet.
- spatial-editor.js a spatial-workshop.js: ovládání, formuláře a detail řezů; všechny mutace přes store.commit s rollbackem a undo/redo.
- cutplan.js: vylučuje nevyřešené díly, pro 3D rezervuje polotovary a nepoužívá sdílené pokosy.
- report.js: tři osové pohledy, kusovník, nářez a tabulky rohů řezů. Nákresy tyčí jsou u 3D jen rozvržení polotovarů.

- spatial-plates.js: prostorové obdélníkové plechy, průchozí kruhové/oválné otvory a vazby patek na profil. Lokální báze U/V a normála vytvářejí skutečné světové souřadnice.
- spatial-assemblies.js: svařovaná pergola s průběžnými nosníky, automatickými napojeními a patkami.
- spatial-collisions.js: SAT nad konvexními vnějšími obálkami včetně skutečných řezů. Broad phase dle osových obálek; limity se hlásí uživateli. Dutiny a otvory se neodečítají.
- spatial-solids.js: ovládání plechů, otvorů a jejich výrobní výkresy.
- spatial-gizmo.js: přechodný náhled tažení osy a jediná transakce při uvolnění; zrušení vrací geometrii.
- spatial-export.js: OBJ viditelných prostorových trojúhelníkových sítí, v mm. IPC model:export omezuje velikost a používá systémový ukládací dialog.

## Zásady rozšiřování

Zdroj pravdy je projekt, nikoliv Three.js mesh. Spoje se odvozují při každém přepočtu. Kopie remapují vnitřní vazby a spoje; externí vazby se odpojí a externí spoje zůstanou nevyřešené. Smazání opory ruší odkazy. Transformace vyžaduje celou propojenou komponentu, aby se nedeformovaly sousední členy.

Polotovar = maximum koncových souřadnic minus minimum počátečních souřadnic všech čtyř rohů. Nejdelší hrana = maximum rozdílů odpovídajících rohů. Tyto hodnoty se nemusí rovnat. Úhel roviny není obecně nastavením pily; rozhodující jsou obě tabulky rohů a orientace průřezu.

## Co zbývá

Obecné výřezy a složené styčníky, vrtání stěn profilů, obecné řešení orientace nekompatibilních prostorových pokosů, skutečné booleovské objemy, STEP a optimalizace nářezu plechů. Generátor pergoly není parametrické přegenerování celé sestavy. Statika a technologický návrh svarů nejsou součástí geometrického výpočtu.

## Kontroly

npm test spouští původní výpočty a regresní, prostorové a výrobní testy. tools/acceptance.cjs ověřuje 2D v Electronu, acceptance-3d.cjs prostorové kreslení a acceptance-workshop.cjs spoje, transformace, uložení a PDF. acceptance-solids.cjs kontroluje patky, otvory, měření, myší tažený manipulátor a export OBJ/PDF. solids.test.mjs ověřuje jejich geometrii, vazby, kopie, zámky a serializaci. verify-bundle.cjs porovnává obsah výsledného ASAR se zdroji; test-package.cjs spouští přenosný EXE v izolovaných datech.
