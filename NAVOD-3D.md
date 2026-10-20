# Rychlý postup pro 3D dílnu

## Pergola

1. Otevři 3D modelování a Vytvořit pergolu. Ponech Svařovaná konstrukce s vyřešenými řezy.
2. Zadej rozteč sloupů X, hloubku Z, výšku osy předního nosníku a zvýšení zadní strany. Rozměry jsou osové, vnější rozměr celé sestavy je ve výkresu.
3. Vyber jekly pro krokve, sloupy a nosníky. Nosník musí být dostatečně velký, aby se na jeho bok vešel celý řez krokve, a dostatečně široký pro sloup. Výchozí 80 × 80 a 40 × 40 řeší geometrii, nikoli statiku.
4. Vytvoř model. Sloupy končí pod průběžnými nosníky, krokve se napojují z jejich boků. Patky leží na začátcích sloupů.
5. Klikni na díl. Vpravo uprav jeho vlastnosti. Konce navázané na nosník se mění úpravou opory nebo vazby; nejprve vazbu uvolni, pokud chceš bod přesunout samostatně.

## Vlastní konstrukce

Sloup vložíš kliknutím do roviny. Spojit dva body vytvoří profil mezi dvěma kliknutími. Profil podle bodů používá přesné X/Y/Z. Rovina vlevo určuje, kam kliknutí do prázdného prostoru dopadne. Kolmo na rovinu usnadní kreslení čela nebo boku.

U volných konců potvrď kolmé řezy. Pro pokos vyber dva profily se společným bodem pomocí Shift+klik a zvol Spojit pokosem. U napojení na průběžný jekl nejprve Navázat bod na nosník, potom Konec na ploše jeklu. Automatická volba plochy vychází ze směru profilu; mezera se měří kolmo od opěrné plochy. Spoje se znovu přepočítají po změně modelu.

## Patky a otvory

Vyber sloup či více sloupů a Přidat patky. Patka je na začátku každého profilu. U samostatného plechu zvol Plech v prostoru, rovinu a střed. Tlousťku určuje materiál.

Vyber plech a Přidat otvor. U/V jsou souřadnice od jeho středu. Kruh má průměr; ovál šířku a výšku. Otvor je průchozí. Výkres plechu ukazuje polohy i číslování. Změna rozměrů plechu se odmítne, pokud by otvor opustil jeho obrys.

## Posun, otočení, kopie a měření

Vyber díl, pak Posunout šipkami. Tažením barevné osy se posune celá propojená konstrukce včetně patek. Alt změní krok na 1 mm. Uvolnění myši vytvoří jednu změnu pro Undo. Esc zruší rozpracované tažení.

Pro přesné otočení zvol Vybrat propojenou konstrukci a Posunout / otočit. Vyplň střed otáčení, osu, úhel a případný následný posun. Kopie / rozestupy vytváří samostatné kopie, přičemž vazby uvnitř kopírované skupiny zachová.

Změřit vzdálenost: klikni na dva body. Uzel znamená bod osy; klik na plochu znamená bod na povrchu. Výsledek i rozdíly souřadnic jsou dole pod modelem.

## Výstupy

Seznam dílů obsahuje profily i plechy. Nářez tyčí obsahuje vyřešené profilové polotovary; plošný nářez plechů se neoptimalizuje. Výstupy / tisk vytvoří PDF s pohledy, kusovníkem, nářezem a detaily řezů a otvorů. Export 3D modelu vytvoří OBJ s viditelnými díly v milimetrech.

Před výrobou zkontroluj chyby a upozornění na kolize. Kolize kontrolují materiálové objemy včetně dutin a otvorů; při dosažení limitu zobrazí upozornění na částečnou kontrolu. Kontrola nenahrazuje ověření konstrukce, kotvení a svarů.

## Obrábění a výpočty (0.5.0)

Vyber jekl: vpravo jsou nové volby Otvor / výřez do jeklu, Průhyb a napětí nosníku a Orientační koutový svar. Vlevo je Export STEP · ploškový model. Podrobný postup a rozsah jsou v [VYPOCTY-A-OBRABENI.md](VYPOCTY-A-OBRABENI.md).
